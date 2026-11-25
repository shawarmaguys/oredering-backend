import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto, VendorLocationEmailsDto } from './dto/update-vendor.dto';
import { AuthUser, validateLocationAccess } from '../common/helpers/location-auth.helper';
import { UserRole } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id?: string): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id);
}

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(private readonly prisma: PrismaService) { }

  private mapVendorForLocation<
    T extends {
      locationVendors?: Array<{
        locationId: string;
        email?: string | null;
        otherEmails?: string | null;
      }>;
    },
  >(vendor: T, locationId?: string) {
    const matched = locationId
      ? vendor.locationVendors?.find((lv) => lv.locationId === locationId)
      : vendor.locationVendors?.[0];
    return {
      ...vendor,
      email: matched?.email ?? null,
      otherEmails: matched?.otherEmails ?? null,
    };
  }

  async create(createVendorDto: CreateVendorDto) {
    const { departmentId, locationId, locationIds, email, otherEmails, ...vendorData } = createVendorDto;
    this.logger.log(`[VendorsService] Creating vendor "${vendorData.displayName}" in department "${departmentId}"`);

    // Check if department exists
    let department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      department = await this.prisma.department.create({
        data: {
          id: departmentId,
          code: 'GEN',
          fullName: 'General Department',
        },
      });
    }

    const vendor = await this.prisma.vendor.create({
      data: {
        ...vendorData,
        departmentId: department.id,
      },
    });

    // Handle location assignments
    let targetLocationIds: string[] = [];
    if (locationIds && locationIds.length > 0) {
      targetLocationIds = locationIds;
    } else if (locationId) {
      targetLocationIds = [locationId];
    }

    if (targetLocationIds.length > 0) {
      await this.prisma.locationVendor.createMany({
        data: targetLocationIds.map((locId) => ({
          vendorId: vendor.id,
          locationId: locId,
          email: email || null,
          otherEmails: otherEmails || null,
        })),
        skipDuplicates: true,
      });

      for (const locId of targetLocationIds) {
        await this.enableVendorProductsForLocation(vendor.id, locId);
      }
    }

    const result = await this.prisma.vendor.findUnique({
      where: { id: vendor.id },
      include: {
        department: true,
        locationVendors: { select: { locationId: true, email: true, otherEmails: true } },
      },
    });
    this.logger.log(`[VendorsService] Created vendor "${vendor.id}" (${vendor.displayName})`);
    return result ? this.mapVendorForLocation(result, targetLocationIds[0]) : result;
  }

  private async enableVendorProductsForLocation(vendorId: string, locationId: string) {
    const vendorItems = await this.prisma.item.findMany({
      where: { vendorId, isActive: true },
      select: { id: true },
    });

    for (const item of vendorItems) {
      await this.prisma.locationItem.upsert({
        where: {
          locationId_itemId: { locationId, itemId: item.id },
        },
        create: {
          locationId,
          itemId: item.id,
          parLevel: 0,
          isActive: true,
        },
        update: {
          isActive: true,
        },
      });
    }
  }

  async findAll(options?: { departmentId?: string; locationId?: string; user?: AuthUser }) {
    if (!options?.locationId || !isValidUUID(options.locationId)) {
      throw new BadRequestException('location_id query parameter is required and must be a valid UUID.');
    }

    const allowedLocations = validateLocationAccess(options?.user, options.locationId);

    const where: any = { isActive: true };
    if (options?.departmentId) {
      where.departmentId = options.departmentId;
    }

    where.locationVendors = {
      some: {
        locationId: options.locationId,
      },
    };

    const vendors = await this.prisma.vendor.findMany({
      where,
      include: {
        department: true,
        locationVendors: {
          select: { locationId: true, email: true, otherEmails: true },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    return vendors.map((v) => this.mapVendorForLocation(v, options.locationId));
  }

  async findUnassigned(locationId: string, departmentId?: string) {
    if (!locationId || !isValidUUID(locationId)) {
      throw new BadRequestException('location_id query parameter is required and must be a valid UUID.');
    }

    const where: any = {
      isActive: true,
      locationVendors: {
        none: {
          locationId: locationId,
        },
        some: {}, // Vendor MUST be assigned to at least one location!
      },
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    return this.prisma.vendor.findMany({
      where,
      include: {
        department: true,
        locationVendors: { select: { locationId: true, email: true, otherEmails: true } },
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async findAllDepartments() {
    let departments = await this.prisma.department.findMany({
      orderBy: { fullName: 'asc' },
    });

    return departments;
  }

  async update(id: string, updateVendorDto: UpdateVendorDto, queryLocationId?: string) {
    const {
      departmentId,
      locationIds,
      locationId: dtoLocationId,
      email,
      otherEmails,
      ...vendorData
    } = updateVendorDto;
    const targetLocationId = queryLocationId || dtoLocationId;

    const hasEmailUpdate = email !== undefined || otherEmails !== undefined;
    if (hasEmailUpdate && (!targetLocationId || !isValidUUID(targetLocationId))) {
      throw new BadRequestException('location_id is required when updating vendor email addresses.');
    }

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException(`Department with ID "${departmentId}" not found`);
      }
    }

    await this.prisma.vendor.update({
      where: { id },
      data: {
        ...vendorData,
        ...(departmentId ? { departmentId } : {}),
      },
    });

    if (locationIds !== undefined) {
      const currentLocVendors = await this.prisma.locationVendor.findMany({
        where: { vendorId: id },
        select: { locationId: true },
      });
      const currentLocIds = currentLocVendors.map((lv) => lv.locationId);
      const removedLocIds = currentLocIds.filter((locId) => !locationIds.includes(locId));
      const addedLocIds = locationIds.filter((locId) => !currentLocIds.includes(locId));

      await this.prisma.$transaction([
        ...(removedLocIds.length > 0
          ? [
              this.prisma.locationVendor.deleteMany({
                where: { vendorId: id, locationId: { in: removedLocIds } },
              }),
              this.prisma.locationItem.updateMany({
                where: {
                  locationId: { in: removedLocIds },
                  item: { vendorId: id },
                },
                data: { isActive: false },
              }),
              this.prisma.schedule.updateMany({
                where: {
                  locationId: { in: removedLocIds },
                  vendorId: id,
                },
                data: { isActive: false },
              }),
            ]
          : []),
        ...(addedLocIds.length > 0
          ? [
              this.prisma.locationVendor.createMany({
                data: addedLocIds.map((locId) => ({
                  vendorId: id,
                  locationId: locId,
                })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);

      for (const addedLocId of addedLocIds) {
        await this.enableVendorProductsForLocation(id, addedLocId);
      }
    }

    if (hasEmailUpdate && targetLocationId) {
      const existingAssignment = await this.prisma.locationVendor.findUnique({
        where: {
          locationId_vendorId: { locationId: targetLocationId, vendorId: id },
        },
      });
      if (!existingAssignment) {
        throw new NotFoundException(
          `Vendor "${id}" is not assigned to location "${targetLocationId}"`,
        );
      }

      const emailUpdateData: { email?: string | null; otherEmails?: string | null } = {};
      if (email !== undefined) emailUpdateData.email = email || null;
      if (otherEmails !== undefined) emailUpdateData.otherEmails = otherEmails || null;

      await this.prisma.locationVendor.update({
        where: {
          locationId_vendorId: { locationId: targetLocationId, vendorId: id },
        },
        data: emailUpdateData,
      });
    }

    const updated = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        department: true,
        locationVendors: { select: { locationId: true, email: true, otherEmails: true } },
      },
    });
    return updated ? this.mapVendorForLocation(updated, targetLocationId) : updated;
  }

  async assignToLocation(vendorId: string, locationId: string, data?: VendorLocationEmailsDto) {
    this.logger.log(`[VendorsService] Assigning vendor ${vendorId} to location ${locationId}`);
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException(`Vendor with ID "${vendorId}" not found`);

    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException(`Location with ID "${locationId}" not found`);

    const emailFields: { email?: string | null; otherEmails?: string | null } = {};
    if (data?.email !== undefined) emailFields.email = data.email || null;
    if (data?.otherEmails !== undefined) emailFields.otherEmails = data.otherEmails || null;

    const locVendor = await this.prisma.locationVendor.upsert({
      where: {
        locationId_vendorId: { locationId, vendorId },
      },
      create: { locationId, vendorId, ...emailFields },
      update: emailFields,
    });

    await this.enableVendorProductsForLocation(vendorId, locationId);
    this.logger.log(`[VendorsService] Vendor ${vendorId} assigned to location ${locationId}`);
    return locVendor;
  }

  async updateLocationAssignment(
    vendorId: string,
    locationId: string,
    data: VendorLocationEmailsDto,
  ) {
    const existing = await this.prisma.locationVendor.findUnique({
      where: {
        locationId_vendorId: { locationId, vendorId },
      },
    });
    if (!existing) {
      throw new NotFoundException(
        `Vendor "${vendorId}" is not assigned to location "${locationId}"`,
      );
    }

    const updateData: { email?: string | null; otherEmails?: string | null } = {};
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.otherEmails !== undefined) updateData.otherEmails = data.otherEmails || null;

    return this.prisma.locationVendor.update({
      where: {
        locationId_vendorId: { locationId, vendorId },
      },
      data: updateData,
    });
  }

  async removeFromLocation(vendorId: string, locationId: string) {
    this.logger.log(`[VendorsService] Removing vendor ${vendorId} from location ${locationId}`);
    await this.prisma.$transaction([
      this.prisma.locationVendor.deleteMany({
        where: { vendorId, locationId },
      }),
      this.prisma.locationItem.updateMany({
        where: {
          locationId,
          item: { vendorId },
        },
        data: { isActive: false },
      }),
      this.prisma.schedule.updateMany({
        where: { vendorId, locationId },
        data: { isActive: false },
      }),
    ]);
    this.logger.log(`[VendorsService] Vendor ${vendorId} removed from location ${locationId}`);
  }

  async getLocationAssignments(vendorId: string) {
    return this.prisma.locationVendor.findMany({
      where: { vendorId },
      include: { location: true },
    });
  }

  async createDepartment(dto: { code: string; fullName: string; slackChannel?: string }) {
    return this.prisma.department.create({
      data: {
        code: dto.code,
        fullName: dto.fullName,
        slackChannel: dto.slackChannel,
      },
    });
  }

  async updateDepartment(id: string, dto: { code?: string; fullName?: string; slackChannel?: string }) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException(`Department with ID "${id}" not found`);
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        code: dto.code,
        fullName: dto.fullName,
        slackChannel: dto.slackChannel,
      },
    });
  }

  async deleteDepartment(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException(`Department with ID "${id}" not found`);
    }

    return this.prisma.department.delete({
      where: { id },
    });
  }

  async remove(id: string, locationId?: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        items: true,
        purchaseOrders: true,
        schedules: true,
        locationVendors: true,
      },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${id} not found`);
    }

    if (locationId) {
      // Unassign vendor from this specific location ONLY, along with its location items and schedules
      await this.prisma.$transaction([
        this.prisma.locationVendor.deleteMany({
          where: { vendorId: id, locationId },
        }),
        this.prisma.locationItem.updateMany({
          where: {
            locationId,
            item: { vendorId: id },
          },
          data: { isActive: false },
        }),
        this.prisma.schedule.updateMany({
          where: { vendorId: id, locationId },
          data: { isActive: false },
        }),
      ]);

      const remainingLocCount = await this.prisma.locationVendor.count({
        where: { vendorId: id },
      });

      if (remainingLocCount === 0) {
        await this.prisma.vendor.update({
          where: { id },
          data: { isActive: false },
        });
      }
      return;
    }

    // Global soft-delete: mark vendor, schedules, items, locationItems as inactive
    await this.prisma.$transaction(async (tx) => {
      await tx.vendor.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.schedule.updateMany({
        where: { vendorId: id },
        data: { isActive: false },
      });

      for (const item of vendor.items) {
        await tx.locationItem.updateMany({
          where: { itemId: item.id },
          data: { isActive: false },
        });
        await tx.item.update({
          where: { id: item.id },
          data: { isActive: false },
        });
      }
    });
  }
}

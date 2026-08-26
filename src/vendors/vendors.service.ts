import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { AuthUser, validateLocationAccess } from '../common/helpers/location-auth.helper';
import { UserRole } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id?: string): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id);
}

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createVendorDto: CreateVendorDto) {
    const { departmentId, locationId, locationIds, ...vendorData } = createVendorDto;

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
        })),
        skipDuplicates: true,
      });
    }

    return this.prisma.vendor.findUnique({
      where: { id: vendor.id },
      include: {
        department: true,
        locationVendors: { select: { locationId: true } },
      },
    });
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

    return this.prisma.vendor.findMany({
      where,
      include: {
        department: true,
        locationVendors: {
          select: { locationId: true },
        },
      },
      orderBy: { displayName: 'asc' },
    });
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
      },
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    return this.prisma.vendor.findMany({
      where,
      include: {
        department: true,
        locationVendors: { select: { locationId: true } },
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

  async update(id: string, updateVendorDto: UpdateVendorDto) {
    const { departmentId, locationIds, ...vendorData } = updateVendorDto;

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException(`Department with ID "${departmentId}" not found`);
      }
    }

    const updatedVendor = await this.prisma.vendor.update({
      where: { id },
      data: {
        ...vendorData,
        ...(departmentId ? { departmentId } : {}),
      },
      include: {
        department: true,
        locationVendors: { select: { locationId: true } },
      },
    });

    if (locationIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.locationVendor.deleteMany({
          where: { vendorId: id },
        }),
        ...(locationIds.length > 0
          ? [
            this.prisma.locationVendor.createMany({
              data: locationIds.map((locId) => ({
                vendorId: id,
                locationId: locId,
              })),
              skipDuplicates: true,
            }),
          ]
          : []),
      ]);

      return this.prisma.vendor.findUnique({
        where: { id },
        include: {
          department: true,
          locationVendors: { select: { locationId: true } },
        },
      });
    }

    return updatedVendor;
  }

  async assignToLocation(vendorId: string, locationId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException(`Vendor with ID "${vendorId}" not found`);

    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException(`Location with ID "${locationId}" not found`);

    return this.prisma.locationVendor.upsert({
      where: {
        locationId_vendorId: { locationId, vendorId },
      },
      create: { locationId, vendorId },
      update: {},
    });
  }

  async removeFromLocation(vendorId: string, locationId: string) {
    return this.prisma.locationVendor.deleteMany({
      where: { vendorId, locationId },
    });
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
      // Unassign vendor from this specific location ONLY
      await this.prisma.locationVendor.deleteMany({
        where: { vendorId: id, locationId },
      });
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

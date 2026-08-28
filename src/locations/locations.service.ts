import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { encryptToken, decryptToken } from '../common/utils/crypto.util';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createLocationDto: CreateLocationDto) {
    const { name, address, phone, email, slackBotToken, slackUserToken } = createLocationDto;

    const existing = await this.prisma.location.findUnique({
      where: { name },
    });
    if (existing) {
      throw new ConflictException(`Location with name "${name}" already exists`);
    }

    return this.prisma.location.create({
      data: { 
        name, 
        address, 
        phone, 
        email, 
        slackBotToken: encryptToken(slackBotToken), 
        slackUserToken: encryptToken(slackUserToken) 
      },
    });
  }

  async findAll() {
    const locations = await this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
    
    return locations.map(loc => ({
      ...loc,
      slackBotToken: loc.slackBotToken ? '••••••••' : '',
      slackUserToken: loc.slackUserToken ? '••••••••' : '',
    }));
  }

  async update(id: string, updateLocationDto: any) {
    const { name, address, phone, email, slackBotToken, slackUserToken } = updateLocationDto;

    if (name) {
      const existing = await this.prisma.location.findUnique({
        where: { name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Location with name "${name}" already exists`);
      }
    }

    const data: any = { name, address, phone, email };

    if (slackBotToken !== undefined && slackBotToken !== '••••••••') {
      data.slackBotToken = encryptToken(slackBotToken);
    }
    if (slackUserToken !== undefined && slackUserToken !== '••••••••') {
      data.slackUserToken = encryptToken(slackUserToken);
    }

    return this.prisma.location.update({
      where: { id },
      data,
    });
  }

  async getLocationItems(locationId: string) {
    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Fetch items assigned to this location
    const items = await this.prisma.item.findMany({
      where: {
        isActive: true,
        locationItems: {
          some: {
            locationId,
            isActive: true,
          },
        },
      },
      include: {
        vendor: true,
        productType: true,
      },
      orderBy: { displayName: 'asc' },
    });

    // Fetch current locationItems
    const locationItems = await this.prisma.locationItem.findMany({
      where: { locationId, isActive: true },
    });

    const locationItemMap = new Map(locationItems.map((li) => [li.itemId, li]));

    return items.map((item) => {
      const mapping = locationItemMap.get(item.id);
      return {
        id: item.id,
        displayName: item.displayName,
        productCode: item.productCode,
        productTypeId: item.productTypeId,
        productType: item.productType,
        baseUnitName: item.baseUnitName,
        displayUnitName: item.displayUnitName,
        multiplier: Number(item.multiplier),
        vendor: item.vendor,
        assigned: !!mapping,
        parLevel: mapping ? Number(mapping.parLevel) : 0,
        displayOrder: mapping ? mapping.displayOrder : 0,
        isActive: mapping ? mapping.isActive : false,
      };
    });
  }

  async addOrUpdateLocationItem(
    locationId: string,
    dto: { itemId: string; parLevel?: number; displayOrder?: number; isActive?: boolean },
  ) {
    const { itemId, parLevel = 0, displayOrder = 0, isActive = true } = dto;

    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Verify item
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException(`Item with ID ${itemId} not found`);
    }

    return this.prisma.locationItem.upsert({
      where: {
        locationId_itemId: {
          locationId,
          itemId,
        },
      },
      create: {
        locationId,
        itemId,
        parLevel,
        displayOrder,
        isActive,
      },
      update: {
        parLevel,
        displayOrder,
        isActive,
      },
    });
  }

  async removeLocationItem(locationId: string, itemId: string) {
    const existing = await this.prisma.locationItem.findUnique({
      where: {
        locationId_itemId: {
          locationId,
          itemId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Location item mapping not found`);
    }

    return this.prisma.locationItem.delete({
      where: {
        locationId_itemId: {
          locationId,
          itemId,
        },
      },
    });
  }

  async getLocationDepartments(locationId: string) {
    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Fetch all departments
    const departments = await this.prisma.department.findMany({
      orderBy: { fullName: 'asc' },
    });

    // Fetch current locationDepartments
    const locationDepartments = await this.prisma.locationDepartment.findMany({
      where: { locationId },
    });

    const activeDeptIds = new Set(locationDepartments.map((ld) => ld.departmentId));

    return departments.map((dept) => ({
      id: dept.id,
      code: dept.code,
      fullName: dept.fullName,
      slackChannel: dept.slackChannel,
      assigned: activeDeptIds.has(dept.id),
    }));
  }

  async addOrUpdateLocationDepartment(locationId: string, dto: { departmentId: string }) {
    const { departmentId } = dto;

    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Verify department
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException(`Department with ID ${departmentId} not found`);
    }

    const existing = await this.prisma.locationDepartment.findUnique({
      where: {
        locationId_departmentId: {
          locationId,
          departmentId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.locationDepartment.create({
      data: {
        locationId,
        departmentId,
      },
    });
  }

  async removeLocationDepartment(locationId: string, departmentId: string) {
    const existing = await this.prisma.locationDepartment.findUnique({
      where: {
        locationId_departmentId: {
          locationId,
          departmentId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Location department mapping not found`);
    }

    return this.prisma.locationDepartment.delete({
      where: {
        locationId_departmentId: {
          locationId,
          departmentId,
        },
      },
    });
  }

  async duplicate(sourceId: string, newName: string, copySlackTokens: boolean = false) {
    const source = await this.prisma.location.findUnique({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException(`Location with ID ${sourceId} not found`);
    }

    // Check name uniqueness
    const existing = await this.prisma.location.findUnique({
      where: { name: newName },
    });
    if (existing) {
      throw new ConflictException(`Location with name "${newName}" already exists`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Read all source data in parallel (independent queries)
      const [locationVendors, locationItems, locationDepts, schedules, newLocation] =
        await Promise.all([
          tx.locationVendor.findMany({ where: { locationId: sourceId } }),
          tx.locationItem.findMany({ where: { locationId: sourceId } }),
          tx.locationDepartment.findMany({ where: { locationId: sourceId } }),
          tx.schedule.findMany({ where: { locationId: sourceId } }),
          tx.location.create({
            data: {
              name: newName,
              address: source.address,
              phone: source.phone,
              email: source.email,
              slackBotToken: copySlackTokens ? source.slackBotToken : null,
              slackUserToken: copySlackTokens ? source.slackUserToken : null,
            },
          }),
        ]);

      // 2. Write all cloned data in parallel (independent inserts)
      const writes: Promise<any>[] = [];

      if (locationVendors.length > 0) {
        writes.push(
          tx.locationVendor.createMany({
            data: locationVendors.map((lv) => ({
              locationId: newLocation.id,
              vendorId: lv.vendorId,
            })),
          }),
        );
      }

      if (locationItems.length > 0) {
        writes.push(
          tx.locationItem.createMany({
            data: locationItems.map((li) => ({
              locationId: newLocation.id,
              itemId: li.itemId,
              parLevel: li.parLevel,
              displayOrder: li.displayOrder,
              isActive: li.isActive,
            })),
          }),
        );
      }

      if (locationDepts.length > 0) {
        writes.push(
          tx.locationDepartment.createMany({
            data: locationDepts.map((ld) => ({
              locationId: newLocation.id,
              departmentId: ld.departmentId,
            })),
          }),
        );
      }

      if (schedules.length > 0) {
        writes.push(
          tx.schedule.createMany({
            data: schedules.map((s) => ({
              locationId: newLocation.id,
              vendorId: s.vendorId,
              scheduleType: s.scheduleType,
              dayOfWeek: s.dayOfWeek,
              triggerTime: s.triggerTime,
              isActive: s.isActive,
              slackChannel: null,
            })),
          }),
        );
      }

      if (writes.length > 0) {
        await Promise.all(writes);
      }

      return newLocation;
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.location.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Location with ID ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Delete location-vendor relations
      await tx.locationVendor.deleteMany({
        where: { locationId: id },
      });

      // 2. Delete location-product relations
      await tx.locationItem.deleteMany({
        where: { locationId: id },
      });

      // 3. Delete location-department relations
      await tx.locationDepartment.deleteMany({
        where: { locationId: id },
      });

      // 4. Delete user-location relations
      await tx.userLocation.deleteMany({
        where: { locationId: id },
      });

      // 5. Delete schedules for location
      await tx.schedule.deleteMany({
        where: { locationId: id },
      });

      // 6. Delete stock records for location (StockRecordItems cascade)
      await tx.stockRecord.deleteMany({
        where: { locationId: id },
      });

      // 7. Delete purchase orders for location (PurchaseOrderItems cascade)
      await tx.purchaseOrder.deleteMany({
        where: { locationId: id },
      });

      // 8. Delete location itself
      return tx.location.delete({
        where: { id },
      });
    });
  }
}

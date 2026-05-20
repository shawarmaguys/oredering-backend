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
      slackBotToken: decryptToken(loc.slackBotToken),
      slackUserToken: decryptToken(loc.slackUserToken)
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

    return this.prisma.location.update({
      where: { id },
      data: { 
        name, 
        address, 
        phone, 
        email, 
        slackBotToken: slackBotToken !== undefined ? encryptToken(slackBotToken) : undefined, 
        slackUserToken: slackUserToken !== undefined ? encryptToken(slackUserToken) : undefined 
      },
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

    // Fetch all items in catalog
    const items = await this.prisma.item.findMany({
      include: {
        vendor: true,
      },
      orderBy: { displayName: 'asc' },
    });

    // Fetch current locationItems
    const locationItems = await this.prisma.locationItem.findMany({
      where: { locationId },
    });

    const locationItemMap = new Map(locationItems.map((li) => [li.itemId, li]));

    return items.map((item) => {
      const mapping = locationItemMap.get(item.id);
      return {
        id: item.id,
        displayName: item.displayName,
        productCode: item.productCode,
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
}

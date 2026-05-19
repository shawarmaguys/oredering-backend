import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';

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
      data: { name, address, phone, email, slackBotToken, slackUserToken },
    });
  }

  async findAll() {
    return this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
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
      data: { name, address, phone, email, slackBotToken, slackUserToken },
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
}

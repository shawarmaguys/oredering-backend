import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createItemDto: CreateItemDto) {
    const { vendorId, ...itemData } = createItemDto;

    // Check if vendor exists
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    const baseUnitName = itemData.baseUnitName;
    const displayUnitName = itemData.displayUnitName && itemData.displayUnitName.trim() !== ''
      ? itemData.displayUnitName
      : baseUnitName;
    const multiplier = itemData.displayUnitName && itemData.displayUnitName.trim() !== ''
      ? (itemData.multiplier !== undefined && itemData.multiplier !== null ? itemData.multiplier : 1)
      : 1;

    return this.prisma.item.create({
      data: {
        ...itemData,
        baseUnitName,
        displayUnitName,
        multiplier,
        vendorId,
      },
    });
  }

  async findAll(options: {
    vendorId?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    const { vendorId, search, page = 1, limit = 50, sortBy, sortOrder = 'asc' } = options;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (vendorId) where.vendorId = vendorId;
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { displayName: 'asc' };
    if (sortBy === 'name') orderBy = { displayName: sortOrder };
    else if (sortBy === 'vendor') orderBy = { vendor: { displayName: sortOrder } };
    else if (sortBy === 'code') orderBy = { productCode: sortOrder };
    else if (sortBy === 'note') orderBy = { note: sortOrder };
    else if (sortBy === 'pack') orderBy = { displayUnitName: sortOrder };
    else if (sortBy === 'baseUnit') orderBy = { baseUnitName: sortOrder };
    else if (sortBy === 'multiplier') orderBy = { multiplier: sortOrder };
    else if (sortBy === 'status') orderBy = { isActive: sortOrder };
    else if (sortBy === 'createdAt') orderBy = { createdAt: sortOrder };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where,
        include: { vendor: true },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.item.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(id: string, updateItemDto: any) {
    const { vendorId, ...itemData } = updateItemDto;

    if (vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
      });
      if (!vendor) {
        throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
      }
    }

    const currentItem = await this.prisma.item.findUnique({
      where: { id },
    });
    if (!currentItem) {
      throw new NotFoundException(`Item with ID ${id} not found`);
    }

    const baseUnitName = itemData.baseUnitName !== undefined ? itemData.baseUnitName : currentItem.baseUnitName;
    let displayUnitName = itemData.displayUnitName !== undefined ? itemData.displayUnitName : currentItem.displayUnitName;
    let multiplier = itemData.multiplier !== undefined ? itemData.multiplier : Number(currentItem.multiplier);

    if (displayUnitName === undefined || displayUnitName === null || displayUnitName.trim() === '') {
      displayUnitName = baseUnitName;
      multiplier = 1;
    }

    return this.prisma.item.update({
      where: { id },
      data: {
        ...itemData,
        baseUnitName,
        displayUnitName,
        multiplier,
        ...(vendorId ? { vendorId } : {}),
      },
      include: {
        vendor: true,
      },
    });
  }

  async remove(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException(`Item with ID ${id} not found`);
    }

    await this.prisma.$transaction([
      this.prisma.locationItem.deleteMany({
        where: { itemId: id },
      }),
      this.prisma.item.update({
        where: { id },
        data: { isActive: false },
      }),
    ]);
  }
}

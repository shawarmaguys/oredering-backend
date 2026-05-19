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

  async findAll(vendorId?: string) {
    return this.prisma.item.findMany({
      where: vendorId ? { vendorId } : {},
      include: {
        vendor: true,
      },
      orderBy: { displayName: 'asc' },
    });
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
}

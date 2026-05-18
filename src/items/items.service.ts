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

    return this.prisma.item.create({
      data: {
        ...itemData,
        vendorId,
        // Since multiplier is Decimal in DB, prisma will convert the number to Decimal
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
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';

@Injectable()
export class StockRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createStockRecordDto: CreateStockRecordDto, userId: string) {
    const { locationId, items } = createStockRecordDto;

    // Check location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    if (items.length === 0) {
      throw new BadRequestException('Stock record must contain at least one item');
    }

    // Process items in a transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Create Stock Record
      const stockRecord = await tx.stockRecord.create({
        data: {
          locationId,
          submittedBy: userId,
          submittedAt: new Date(),
        },
      });

      // 2. Fetch all items to compute normalized quantities
      const itemIds = items.map((i) => i.itemId);
      const dbItems = await tx.item.findMany({
        where: { id: { in: itemIds } },
      });

      const dbItemMap = new Map(dbItems.map((item) => [item.id, item]));

      // 3. Create Stock Record Items
      for (const itemDto of items) {
        const dbItem = dbItemMap.get(itemDto.itemId);
        if (!dbItem) {
          throw new NotFoundException(`Item with ID ${itemDto.itemId} not found`);
        }

        // Calculate normalized quantity based on multiplier
        // enteredQuantity * multiplier
        const multiplier = Number(dbItem.multiplier) || 1;
        const normalizedQuantity = itemDto.enteredQuantity * multiplier;

        await tx.stockRecordItem.create({
          data: {
            stockRecordId: stockRecord.id,
            itemId: itemDto.itemId,
            enteredQuantity: itemDto.enteredQuantity,
            enteredUnit: itemDto.enteredUnit,
            normalizedQuantity: normalizedQuantity,
          },
        });
      }

      // Fetch complete record to return
      return tx.stockRecord.findUnique({
        where: { id: stockRecord.id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          submitter: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          location: true,
        },
      });
    });
  }

  async findAll() {
    return this.prisma.stockRecord.findMany({
      include: {
        items: {
          include: {
            item: true,
          },
        },
        submitter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        location: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.stockRecord.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        submitter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        location: true,
      },
    });

    if (!record) {
      throw new NotFoundException(`Stock record with ID ${id} not found`);
    }

    return record;
  }
}

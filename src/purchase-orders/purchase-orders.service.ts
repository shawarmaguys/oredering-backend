import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrderStatus } from '@prisma/client';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPurchaseOrderDto: CreatePurchaseOrderDto, userId: string) {
    const { vendorId, locationId, stockRecordId, notes, items } = createPurchaseOrderDto;

    // Verify vendor
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Verify stock record if provided
    if (stockRecordId) {
      const stockRecord = await this.prisma.stockRecord.findUnique({
        where: { id: stockRecordId },
      });
      if (!stockRecord) {
        throw new NotFoundException(`Stock record with ID ${stockRecordId} not found`);
      }
    }

    if (items.length === 0) {
      throw new BadRequestException('Purchase order must contain at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      // Create PO
      const po = await tx.purchaseOrder.create({
        data: {
          vendorId,
          locationId,
          stockRecordId,
          notes,
          createdBy: userId,
          status: PurchaseOrderStatus.DRAFT,
        },
      });

      // Create PO items
      for (const itemDto of items) {
        const item = await tx.item.findUnique({
          where: { id: itemDto.itemId },
        });
        if (!item) {
          throw new NotFoundException(`Item with ID ${itemDto.itemId} not found`);
        }

        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            itemId: itemDto.itemId,
            quantity: itemDto.quantity,
            unitName: itemDto.unitName,
          },
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id: po.id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          vendor: true,
          location: true,
          creator: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      });
    });
  }

  async findAll(status?: PurchaseOrderStatus) {
    return this.prisma.purchaseOrder.findMany({
      where: status ? { status } : {},
      include: {
        items: {
          include: {
            item: true,
          },
        },
        vendor: true,
        location: true,
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        vendor: true,
        location: true,
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return po;
  }

  async approve(id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(`Purchase order is already ${po.status}`);
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.GENERATED,
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        vendor: true,
        location: true,
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });
  }

  async update(id: string, updatePurchaseOrderDto: UpdatePurchaseOrderDto) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only update DRAFT purchase orders');
    }

    return this.prisma.$transaction(async (tx) => {
      // Update each item quantity
      for (const itemDto of updatePurchaseOrderDto.items) {
        await tx.purchaseOrderItem.updateMany({
          where: {
            purchaseOrderId: id,
            itemId: itemDto.itemId,
          },
          data: {
            quantity: itemDto.quantity,
          },
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          vendor: true,
          location: true,
          creator: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          approver: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      });
    });
  }
}

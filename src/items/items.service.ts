import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { AuthUser, validateLocationAccess } from '../common/helpers/location-auth.helper';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id?: string): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id);
}

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createItemDto: CreateItemDto) {
    const { vendorId, locationId, parLevel, ...itemData } = createItemDto;

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

    const item = await this.prisma.item.create({
      data: {
        ...itemData,
        baseUnitName,
        displayUnitName,
        multiplier,
        vendorId,
      },
    });

    // Auto-create LocationItem records
    let locationsToAssign: string[] = [];
    if (locationId) {
      locationsToAssign = [locationId];
    } else {
      const allLocations = await this.prisma.location.findMany({ select: { id: true } });
      locationsToAssign = allLocations.map((l) => l.id);
    }

    if (locationsToAssign.length > 0) {
      await this.prisma.locationItem.createMany({
        data: locationsToAssign.map((locId) => ({
          locationId: locId,
          itemId: item.id,
          parLevel: parLevel ?? 0,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    return this.prisma.item.findUnique({
      where: { id: item.id },
      include: {
        vendor: true,
        productType: true,
        locationItems: true,
      },
    });
  }

  async findAll(options: {
    vendorId?: string;
    productTypeId?: string;
    locationId?: string;
    user?: AuthUser;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    const { vendorId, productTypeId, locationId, user, search, page = 1, limit = 50, sortBy, sortOrder = 'asc' } = options;

    if (!locationId || !isValidUUID(locationId)) {
      throw new BadRequestException('location_id query parameter is required and must be a valid UUID.');
    }

    const skip = (page - 1) * limit;

    const allowedLocations = validateLocationAccess(user, locationId);

    const where: any = { isActive: true };
    if (vendorId) where.vendorId = vendorId;
    if (productTypeId) where.productTypeId = productTypeId;

    where.locationItems = {
      some: {
        locationId: locationId,
        isActive: true,
      },
    };

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { spanishName: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { displayName: 'asc' };
    if (sortBy === 'name') orderBy = { displayName: sortOrder };
    else if (sortBy === 'vendor') orderBy = { vendor: { displayName: sortOrder } };
    else if (sortBy === 'productType') orderBy = { productType: { name: sortOrder } };
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
        include: {
          vendor: true,
          productType: true,
          locationItems: { where: { locationId, isActive: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.item.count({ where }),
    ]);

    const formattedData = data.map((item) => {
      const locItem = item.locationItems?.[0];
      return {
        ...item,
        parLevel: locItem ? Number(locItem.parLevel) : 0,
      };
    });

    return {
      data: formattedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findUnassigned(locationId: string, vendorId?: string, productTypeId?: string) {
    if (!locationId) {
      throw new NotFoundException('location_id query parameter is required.');
    }

    const where: any = {
      isActive: true,
      vendor: {
        isActive: true,
        locationVendors: {
          some: {
            locationId: locationId,
          },
        },
      },
      locationItems: {
        none: {
          locationId: locationId,
          isActive: true,
        },
      },
    };

    if (vendorId) where.vendorId = vendorId;
    if (productTypeId) where.productTypeId = productTypeId;

    const items = await this.prisma.item.findMany({
      where,
      include: {
        vendor: true,
        productType: true,
        locationItems: { select: { locationId: true, parLevel: true } },
      },
      orderBy: { displayName: 'asc' },
    });

    return items.map((item) => ({
      ...item,
      parLevel: item.locationItems?.[0] ? Number(item.locationItems[0].parLevel) : 0,
    }));
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
        productType: true,
      },
    });
  }

  async assignToLocation(itemId: string, locationId: string, parLevel?: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item with ID ${itemId} not found`);

    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException(`Location with ID ${locationId} not found`);

    const updateData: any = { isActive: true };
    if (parLevel !== undefined && parLevel !== null) {
      updateData.parLevel = parLevel;
    }

    return this.prisma.locationItem.upsert({
      where: {
        locationId_itemId: { locationId, itemId },
      },
      create: { locationId, itemId, parLevel: parLevel ?? 0, isActive: true },
      update: updateData,
    });
  }

  async removeFromLocation(itemId: string, locationId: string) {
    return this.prisma.locationItem.updateMany({
      where: { itemId, locationId },
      data: { isActive: false },
    });
  }

  async remove(id: string, locationId?: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException(`Item with ID ${id} not found`);
    }

    if (locationId) {
      await this.prisma.locationItem.updateMany({
        where: { itemId: id, locationId },
        data: { isActive: false },
      });
      return;
    }

    await this.prisma.$transaction([
      this.prisma.locationItem.updateMany({
        where: { itemId: id },
        data: { isActive: false },
      }),
      this.prisma.item.update({
        where: { id },
        data: { isActive: false },
      }),
    ]);
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { BulkUploadDto } from './dto/bulk-item.dto';
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
          _count: {
            select: {
              locationItems: { where: { isActive: true } },
            },
          },
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
        activeLocationCount: item._count?.locationItems ?? 0,
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
        some: {
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
        _count: {
          select: {
            locationItems: { where: { isActive: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    return items.map((item) => ({
      ...item,
      parLevel: item.locationItems?.[0] ? Number(item.locationItems[0].parLevel) : 0,
      activeLocationCount: item._count?.locationItems ?? 0,
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

      const remainingActiveCount = await this.prisma.locationItem.count({
        where: { itemId: id, isActive: true },
      });

      if (remainingActiveCount === 0) {
        await this.prisma.item.update({
          where: { id },
          data: { isActive: false },
        });
      }
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

  async validateBulkItems(dto: BulkUploadDto) {
    if (!dto.items || !Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('No items provided in bulk upload payload.');
    }

    const vendors = await this.prisma.vendor.findMany({ select: { id: true, displayName: true } });
    const vendorByName = new Map(vendors.map((v) => [v.displayName.trim().toLowerCase(), v]));
    const vendorById = new Map(vendors.map((v) => [v.id, v]));

    let activeLocationName: string | null = null;
    let enabledVendorIdsForLocation: Set<string> | null = null;

    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.locationId },
        select: { name: true },
      });
      if (location) {
        activeLocationName = location.name;
      }

      const locVendors = await this.prisma.locationVendor.findMany({
        where: { locationId: dto.locationId },
        select: { vendorId: true },
      });
      enabledVendorIdsForLocation = new Set(locVendors.map((lv) => lv.vendorId));
    }

    const allAssignedLocationVendors = await this.prisma.locationVendor.findMany({
      select: { vendorId: true },
    });
    const vendorIdsAssignedToAnyLocation = new Set(allAssignedLocationVendors.map((lv) => lv.vendorId));

    const productTypes = await this.prisma.productType.findMany({ select: { id: true, name: true } });
    const typeByName = new Map(productTypes.map((t) => [t.name.trim().toLowerCase(), t]));
    const typeById = new Map(productTypes.map((t) => [t.id, t]));

    const items = await this.prisma.item.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, productCode: true, vendorId: true },
    });
    const itemByName = new Map(
      items.map((i) => [i.displayName.trim().toLowerCase(), i])
    );
    const itemByCode = new Map(
      items.filter((i) => i.productCode).map((i) => [i.productCode!.trim().toLowerCase(), i])
    );

    const rowResults: any[] = [];

    for (let i = 0; i < dto.items.length; i++) {
      const rawRow = dto.items[i];
      const errors: string[] = [];

      const displayName = rawRow.displayName ? String(rawRow.displayName).trim() : '';
      const baseUnitName = rawRow.baseUnitName ? String(rawRow.baseUnitName).trim() : '';
      const displayUnitName = rawRow.displayUnitName ? String(rawRow.displayUnitName).trim() : undefined;
      const productCode = rawRow.productCode ? String(rawRow.productCode).trim() : undefined;
      const spanishName = rawRow.spanishName ? String(rawRow.spanishName).trim() : undefined;
      const note = rawRow.note ? String(rawRow.note).trim() : undefined;
      const vendorName = rawRow.vendorName ? String(rawRow.vendorName).trim() : undefined;
      const vendorId = rawRow.vendorId ? String(rawRow.vendorId).trim() : undefined;
      const productTypeName = rawRow.productTypeName ? String(rawRow.productTypeName).trim() : undefined;
      const productTypeId = rawRow.productTypeId ? String(rawRow.productTypeId).trim() : undefined;

      let multiplier: number | undefined = undefined;
      if (rawRow.multiplier !== undefined && rawRow.multiplier !== null && String(rawRow.multiplier).trim() !== '') {
        multiplier = Number(rawRow.multiplier);
      }

      let parLevel: number | undefined = undefined;
      if (rawRow.parLevel !== undefined && rawRow.parLevel !== null && String(rawRow.parLevel).trim() !== '') {
        parLevel = Number(rawRow.parLevel);
      }

      let isActive: boolean = true;
      if (rawRow.isActive !== undefined && rawRow.isActive !== null) {
        if (typeof rawRow.isActive === 'boolean') {
          isActive = rawRow.isActive;
        } else {
          const str = String(rawRow.isActive).trim().toLowerCase();
          if (str === 'false' || str === '0' || str === 'inactive' || str === 'no') {
            isActive = false;
          }
        }
      }

      if (!displayName) {
        errors.push('Product Name is required.');
      }
      if (!baseUnitName) {
        errors.push('Base Unit Name is required.');
      }

      let matchedVendorId: string | null = null;
      let matchedVendorName: string | null = null;

      if (vendorId) {
        const v = vendorById.get(vendorId);
        if (v) {
          matchedVendorId = v.id;
          matchedVendorName = v.displayName;
        } else {
          errors.push(`Vendor ID '${vendorId}' not found.`);
        }
      } else if (vendorName) {
        const v = vendorByName.get(vendorName.toLowerCase());
        if (v) {
          matchedVendorId = v.id;
          matchedVendorName = v.displayName;
        } else {
          errors.push(`Vendor '${vendorName}' does not exist in system.`);
        }
      } else {
        errors.push('Vendor Name or Vendor ID is required.');
      }

      if (matchedVendorId) {
        if (enabledVendorIdsForLocation) {
          if (!enabledVendorIdsForLocation.has(matchedVendorId)) {
            errors.push(
              `Vendor '${matchedVendorName}' is not enabled for location '${activeLocationName || 'selected location'}'.`
            );
          }
        } else {
          if (!vendorIdsAssignedToAnyLocation.has(matchedVendorId)) {
            errors.push(
              `Vendor '${matchedVendorName}' is not enabled for any store location.`
            );
          }
        }
      }

      let matchedProductTypeId: string | null = null;
      let matchedProductTypeName: string | null = null;

      if (productTypeId) {
        const pt = typeById.get(productTypeId);
        if (pt) {
          matchedProductTypeId = pt.id;
          matchedProductTypeName = pt.name;
        } else {
          errors.push(`Category ID '${productTypeId}' not found.`);
        }
      } else if (productTypeName) {
        const pt = typeByName.get(productTypeName.toLowerCase());
        if (pt) {
          matchedProductTypeId = pt.id;
          matchedProductTypeName = pt.name;
        } else {
          matchedProductTypeName = productTypeName;
        }
      }

      if (multiplier !== undefined && (isNaN(multiplier) || multiplier <= 0)) {
        errors.push('Multiplier must be a number greater than 0.');
      }

      if (parLevel !== undefined && (isNaN(parLevel) || parLevel < 0)) {
        errors.push('PAR Level must be a number >= 0.');
      }

      let isDuplicate = false;

      // Check if product name already exists (case-insensitive)
      if (displayName) {
        const existingByName = itemByName.get(displayName.toLowerCase());
        if (existingByName) {
          errors.push(`Warning: A product with name "${displayName}" already exists in the catalog. Updating existing products is disabled; only new products can be added.`);
          isDuplicate = true;
        }
      }

      // Check if product code already exists (case-insensitive)
      if (productCode && !isDuplicate) {
        const existingByCode = itemByCode.get(productCode.toLowerCase());
        if (existingByCode) {
          errors.push(`Warning: A product with code/SKU "${productCode}" already exists in the catalog.`);
          isDuplicate = true;
        }
      }

      let action: 'CREATE' | 'UPDATE' | 'INVALID' = 'CREATE';
      if (errors.length > 0) {
        action = 'INVALID';
      }

      rowResults.push({
        rowNumber: i + 1,
        action,
        isDuplicate,
        errors,
        data: {
          id: rawRow.id,
          displayName,
          baseUnitName,
          displayUnitName,
          multiplier: multiplier !== undefined ? multiplier : 1,
          vendorId: matchedVendorId || undefined,
          vendorName: matchedVendorName || vendorName,
          productTypeId: matchedProductTypeId || undefined,
          productTypeName: matchedProductTypeName || productTypeName,
          productCode,
          spanishName,
          note,
          parLevel,
          isActive,
        },
      });
    }

    const validCount = rowResults.filter((r) => r.action === 'CREATE').length;
    const invalidCount = rowResults.filter((r) => r.action === 'INVALID').length;
    const duplicateCount = rowResults.filter((r) => r.isDuplicate).length;
    const createCount = validCount;

    return {
      total: rowResults.length,
      validCount,
      invalidCount,
      createCount,
      updateCount: 0,
      duplicateCount,
      rows: rowResults,
    };
  }

  async processBulkUpload(dto: BulkUploadDto) {
    const validation = await this.validateBulkItems(dto);
    const validRows = validation.rows.filter((r) => r.action === 'CREATE');

    if (validRows.length === 0) {
      throw new BadRequestException('No new valid products found to add. Duplicate or invalid items were skipped.');
    }

    let createdCount = 0;

    for (const row of validRows) {
      const itemData = row.data;

      let productTypeId = itemData.productTypeId;
      if (!productTypeId && itemData.productTypeName && itemData.productTypeName.trim()) {
        const cleanCatName = itemData.productTypeName.trim();
        let pt = await this.prisma.productType.findUnique({
          where: { name: cleanCatName },
        });
        if (!pt) {
          pt = await this.prisma.productType.create({
            data: { name: cleanCatName },
          });
        }
        productTypeId = pt.id;
      }

      const baseUnitName = itemData.baseUnitName;
      const displayUnitName = itemData.displayUnitName && itemData.displayUnitName.trim() !== ''
        ? itemData.displayUnitName.trim()
        : baseUnitName;
      const multiplier = itemData.multiplier ?? 1;

      const newItem = await this.prisma.item.create({
        data: {
          displayName: itemData.displayName,
          baseUnitName,
          displayUnitName,
          multiplier,
          vendorId: itemData.vendorId,
          productTypeId: productTypeId || null,
          productCode: itemData.productCode || null,
          spanishName: itemData.spanishName || null,
          note: itemData.note || null,
          isActive: itemData.isActive ?? true,
        },
      });

      let locationsToAssign: string[] = [];
      if (dto.locationId) {
        locationsToAssign = [dto.locationId];
      } else {
        const allLocations = await this.prisma.location.findMany({ select: { id: true } });
        locationsToAssign = allLocations.map((l) => l.id);
      }

      if (locationsToAssign.length > 0) {
        await this.prisma.locationItem.createMany({
          data: locationsToAssign.map((locId) => ({
            locationId: locId,
            itemId: newItem.id,
            parLevel: itemData.parLevel ?? 0,
            isActive: true,
          })),
          skipDuplicates: true,
        });
      }

      createdCount++;
    }

    return {
      success: true,
      totalCount: dto.items.length,
      processedCount: validRows.length,
      createdCount,
      updatedCount: 0,
      invalidCount: validation.invalidCount,
    };
  }
}

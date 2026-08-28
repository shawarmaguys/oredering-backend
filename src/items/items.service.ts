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

    if (locationId && !isValidUUID(locationId)) {
      throw new BadRequestException('location_id query parameter must be a valid UUID.');
    }

    const skip = (page - 1) * limit;

    if (locationId) {
      validateLocationAccess(user, locationId);
    }

    const where: any = { isActive: true };
    const andConditions: any[] = [];
    
    if (vendorId) {
      andConditions.push({
        OR: [
          { vendorId: vendorId },
          { backupVendors: { some: { vendorId: vendorId } } }
        ]
      });
    }
    if (productTypeId) andConditions.push({ productTypeId });

    if (locationId) {
      where.locationItems = {
        some: {
          locationId: locationId,
          isActive: true,
        },
      };
    }

    if (search) {
      andConditions.push({
        OR: [
          { displayName: { contains: search, mode: 'insensitive' } },
          { productCode: { contains: search, mode: 'insensitive' } },
          { spanishName: { contains: search, mode: 'insensitive' } },
          { note: { contains: search, mode: 'insensitive' } },
        ]
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
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
          backupVendors: {
            include: { vendor: { select: { id: true, displayName: true, departmentId: true } } }
          },
          locationItems: locationId ? { where: { locationId, isActive: true } } : { where: { isActive: true } },
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
        backupVendors: {
          include: { vendor: { select: { id: true, displayName: true } } }
        },
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
        backupVendors: {
          include: { vendor: { select: { id: true, displayName: true } } }
        },
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

  async addBackupVendor(itemId: string, vendorId: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item with ID ${itemId} not found`);

    if (item.vendorId === vendorId) {
      throw new BadRequestException('Cannot add primary vendor as a backup vendor');
    }

    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException(`Vendor with ID ${vendorId} not found`);

    return this.prisma.itemBackupVendor.create({
      data: { itemId, vendorId },
    });
  }

  async removeBackupVendor(itemId: string, vendorId: string) {
    const record = await this.prisma.itemBackupVendor.findUnique({
      where: { itemId_vendorId: { itemId, vendorId } },
    });
    if (!record) {
      throw new NotFoundException('Backup vendor record not found');
    }
    await this.prisma.itemBackupVendor.delete({
      where: { itemId_vendorId: { itemId, vendorId } },
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
      select: {
        id: true,
        displayName: true,
        baseUnitName: true,
        displayUnitName: true,
        multiplier: true,
        productCode: true,
        spanishName: true,
        note: true,
        vendorId: true,
        productTypeId: true,
        isActive: true,
        locationItems: {
          select: { locationId: true, parLevel: true, isActive: true },
        },
      },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));
    
    const itemsByNameMap = new Map<string, any[]>();
    for (const item of items) {
      const nameKey = item.displayName.trim().toLowerCase();
      if (!itemsByNameMap.has(nameKey)) {
        itemsByNameMap.set(nameKey, []);
      }
      itemsByNameMap.get(nameKey)!.push(item);
    }

    const itemsByCodeMap = new Map<string, any[]>();
    for (const item of items) {
      if (item.productCode) {
        const codeKey = item.productCode.trim().toLowerCase();
        if (!itemsByCodeMap.has(codeKey)) {
          itemsByCodeMap.set(codeKey, []);
        }
        itemsByCodeMap.get(codeKey)!.push(item);
      }
    }

    const rowResults: any[] = [];
    const seenIdsInPayload = new Set<string>();

    for (let i = 0; i < dto.items.length; i++) {
      const rawRow = dto.items[i];
      const errors: string[] = [];

      const rowId = rawRow.id ? String(rawRow.id).trim() : undefined;
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

      if (multiplier !== undefined && (Number.isNaN(multiplier) || multiplier <= 0)) {
        errors.push('Multiplier must be a number greater than 0.');
      }

      if (parLevel !== undefined && (Number.isNaN(parLevel) || parLevel < 0)) {
        errors.push('PAR Level must be a number >= 0.');
      }

      let action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'INVALID' = 'CREATE';
      let isDuplicate = false;

      let duplicateWarning: string | undefined = undefined;

      if (rowId) {
        if (seenIdsInPayload.has(rowId)) {
          errors.push(`Duplicate Product ID '${rowId}' repeated in CSV payload.`);
        } else {
          seenIdsInPayload.add(rowId);
        }

        const existingItem = itemById.get(rowId);
        if (!existingItem) {
          errors.push(`Product ID '${rowId}' not found in system database.`);
        } else {
          // Check collision if name or code is being changed
          if (displayName) {
            const isNameChanged = displayName.trim().toLowerCase() !== existingItem.displayName.trim().toLowerCase();
            if (isNameChanged) {
              const sameNameItems = itemsByNameMap.get(displayName.trim().toLowerCase()) || [];
              const collisionItem = sameNameItems.find((i) => i.id !== rowId);
              if (collisionItem) {
                errors.push(`Product name "${displayName}" is already used by another item in catalog.`);
              }
            }
          }

          if (productCode) {
            const currentCode = (existingItem.productCode || '').trim().toLowerCase();
            const isCodeChanged = productCode.trim().toLowerCase() !== currentCode;
            if (isCodeChanged) {
              const sameCodeItems = itemsByCodeMap.get(productCode.trim().toLowerCase()) || [];
              const collisionItem = sameCodeItems.find((i) => i.id !== rowId);
              if (collisionItem) {
                errors.push(`Product code "${productCode}" is already used by another item in catalog.`);
              }
            }
          }

          // Diff against existing item state to detect specific field modifications
          const changedFields = this.getItemModifications(existingItem, {
            displayName,
            baseUnitName,
            displayUnitName,
            multiplier,
            matchedVendorId,
            matchedProductTypeId,
            productCode,
            spanishName,
            note,
            isActive,
            parLevel,
          }, dto.locationId);

          action = changedFields.length > 0 ? 'UPDATE' : 'UNCHANGED';
          (rawRow as any)._changedFields = changedFields;
        }
      } else {
        action = 'CREATE';
        if (displayName) {
          const sameNameItems = itemsByNameMap.get(displayName.trim().toLowerCase()) || [];
          if (sameNameItems.length > 0) {
            isDuplicate = true;
            duplicateWarning = `⚠️ Product name "${displayName}" exists in catalog. Include Product ID to update existing product, or proceed to add as new.`;
          }
        }
        if (productCode && !isDuplicate) {
          const sameCodeItems = itemsByCodeMap.get(productCode.trim().toLowerCase()) || [];
          if (sameCodeItems.length > 0) {
            isDuplicate = true;
            duplicateWarning = `⚠️ Product code "${productCode}" exists in catalog. Include Product ID to update existing product, or proceed to add as new.`;
          }
        }
      }

      if (errors.length > 0) {
        action = 'INVALID';
      }

      rowResults.push({
        rowNumber: i + 1,
        action,
        isDuplicate,
        errors,
        warnings: duplicateWarning ? [duplicateWarning] : [],
        changedFields: (rawRow as any)._changedFields || [],
        data: {
          id: rowId,
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

    const validCount = rowResults.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE' || r.action === 'UNCHANGED').length;
    const createCount = rowResults.filter((r) => r.action === 'CREATE').length;
    const updateCount = rowResults.filter((r) => r.action === 'UPDATE').length;
    const unchangedCount = rowResults.filter((r) => r.action === 'UNCHANGED').length;
    const invalidCount = rowResults.filter((r) => r.action === 'INVALID').length;
    const duplicateCount = rowResults.filter((r) => r.isDuplicate).length;

    return {
      total: rowResults.length,
      validCount,
      invalidCount,
      createCount,
      updateCount,
      unchangedCount,
      duplicateCount,
      rows: rowResults,
    };
  }

  private getItemModifications(existingItem: any, incoming: any, locationId?: string): string[] {
    const cleanStr = (val: any) => (val === undefined || val === null ? '' : String(val).trim());
    const changes: string[] = [];

    if (cleanStr(incoming.displayName) !== cleanStr(existingItem.displayName)) {
      changes.push(`Name: "${existingItem.displayName}" ➔ "${incoming.displayName}"`);
    }

    if (cleanStr(incoming.baseUnitName) !== cleanStr(existingItem.baseUnitName)) {
      changes.push(`Base Unit: "${existingItem.baseUnitName || '—'}" ➔ "${incoming.baseUnitName}"`);
    }

    if (incoming.displayUnitName !== undefined) {
      const targetDisplayUnit = cleanStr(incoming.displayUnitName) || cleanStr(incoming.baseUnitName);
      const existingDisplayUnit = cleanStr(existingItem.displayUnitName) || cleanStr(existingItem.baseUnitName);
      if (targetDisplayUnit !== existingDisplayUnit) {
        changes.push(`Display Unit: "${existingDisplayUnit || '—'}" ➔ "${targetDisplayUnit}"`);
      }
    }

    if (incoming.multiplier !== undefined && !Number.isNaN(Number(incoming.multiplier))) {
      const existingMult = existingItem.multiplier !== undefined && existingItem.multiplier !== null && Number(existingItem.multiplier) > 0
        ? Number(existingItem.multiplier)
        : 1;
      const targetMult = Number(incoming.multiplier) > 0 ? Number(incoming.multiplier) : 1;
      if (targetMult !== existingMult) {
        changes.push(`Multiplier: ${existingMult}x ➔ ${targetMult}x`);
      }
    }

    if (incoming.matchedVendorId && incoming.matchedVendorId !== existingItem.vendorId) {
      changes.push(`Vendor`);
    }

    if (incoming.matchedProductTypeId !== undefined) {
      const existingType = existingItem.productTypeId || null;
      const targetType = incoming.matchedProductTypeId || null;
      if (existingType !== targetType) {
        changes.push(`Category`);
      }
    }

    if (incoming.productCode !== undefined && cleanStr(incoming.productCode) !== cleanStr(existingItem.productCode)) {
      changes.push(`Code/SKU: "${existingItem.productCode || '—'}" ➔ "${incoming.productCode || '—'}"`);
    }

    if (incoming.spanishName !== undefined && cleanStr(incoming.spanishName) !== cleanStr(existingItem.spanishName)) {
      changes.push(`Spanish Name`);
    }

    if (incoming.note !== undefined && cleanStr(incoming.note) !== cleanStr(existingItem.note)) {
      changes.push(`Note`);
    }

    if (incoming.isActive !== undefined && incoming.isActive !== existingItem.isActive) {
      changes.push(`Status: ${existingItem.isActive ? 'Active' : 'Inactive'} ➔ ${incoming.isActive ? 'Active' : 'Inactive'}`);
    }

    if (locationId) {
      const locItem = existingItem.locationItems?.find((li: any) => li.locationId === locationId);
      if (!locItem) {
        changes.push(`Enable for Location`);
      } else {
        const existingPar = (locItem.parLevel !== undefined && locItem.parLevel !== null && !Number.isNaN(Number(locItem.parLevel)))
          ? Number(locItem.parLevel)
          : 0;
        if (incoming.parLevel !== undefined && !Number.isNaN(Number(incoming.parLevel)) && Number(incoming.parLevel) !== existingPar) {
          changes.push(`PAR Level: ${existingPar} ➔ ${incoming.parLevel}`);
        }
        if (incoming.isActive !== undefined && incoming.isActive !== locItem.isActive) {
          changes.push(`Location Status: ${locItem.isActive ? 'Active' : 'Inactive'} ➔ ${incoming.isActive ? 'Active' : 'Inactive'}`);
        }
      }
    }

    return changes;
  }

  async processBulkUpload(dto: BulkUploadDto) {
    const validation = await this.validateBulkItems(dto);
    const validRows = validation.rows.filter(
      (r) => r.action === 'CREATE' || r.action === 'UPDATE' || r.action === 'UNCHANGED'
    );
    const rowsToExecute = validation.rows.filter(
      (r) => r.action === 'CREATE' || r.action === 'UPDATE'
    );

    if (validRows.length === 0) {
      throw new BadRequestException('No valid products found to process. Invalid items were skipped.');
    }

    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = validation.unchangedCount;

    for (const row of rowsToExecute) {
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

      if (row.action === 'UPDATE' && itemData.id) {
        await this.prisma.item.update({
          where: { id: itemData.id },
          data: {
            displayName: itemData.displayName,
            baseUnitName,
            displayUnitName,
            multiplier,
            ...(itemData.vendorId ? { vendorId: itemData.vendorId } : {}),
            ...(productTypeId !== undefined ? { productTypeId: productTypeId || null } : {}),
            productCode: itemData.productCode || null,
            spanishName: itemData.spanishName || null,
            note: itemData.note || null,
            isActive: itemData.isActive ?? true,
          },
        });

        if (dto.locationId) {
          await this.prisma.locationItem.upsert({
            where: {
              locationId_itemId: { locationId: dto.locationId, itemId: itemData.id },
            },
            create: {
              locationId: dto.locationId,
              itemId: itemData.id,
              parLevel: itemData.parLevel ?? 0,
              isActive: itemData.isActive ?? true,
            },
            update: {
              ...(itemData.parLevel !== undefined ? { parLevel: itemData.parLevel } : {}),
              isActive: itemData.isActive ?? true,
            },
          });
        }

        updatedCount++;
      } else {
        const newItem = await this.prisma.item.create({
          data: {
            displayName: itemData.displayName,
            baseUnitName,
            displayUnitName,
            multiplier,
            vendorId: itemData.vendorId!,
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
    }

    return {
      success: true,
      totalCount: dto.items.length,
      processedCount: validRows.length,
      createdCount,
      updatedCount,
      unchangedCount,
      invalidCount: validation.invalidCount,
    };
  }
}

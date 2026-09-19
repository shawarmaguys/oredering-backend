import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';

@Injectable()
export class ProductTypesService {
  private readonly logger = new Logger(ProductTypesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductTypeDto) {
    this.logger.log(`[ProductTypesService] Creating product type "${dto.name}"`);
    const existing = await this.prisma.productType.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      this.logger.warn(`[ProductTypesService] Conflict: Product type "${dto.name}" already exists`);
      throw new ConflictException(`Product type with name "${dto.name}" already exists`);
    }

    const created = await this.prisma.productType.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color || '#64748B',
      },
    });
    this.logger.log(`[ProductTypesService] Created product type "${created.id}" (${created.name})`);
    return created;
  }

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    const productTypes = await this.prisma.productType.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { items: { where: { isActive: true } } },
        },
      },
    });

    return productTypes.map((pt) => ({
      ...pt,
      itemCount: pt._count.items,
    }));
  }

  async findOne(id: string) {
    const pt = await this.prisma.productType.findUnique({
      where: { id },
      include: {
        _count: {
          select: { items: { where: { isActive: true } } },
        },
      },
    });
    if (!pt) {
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }
    return {
      ...pt,
      itemCount: pt._count.items,
    };
  }

  async update(id: string, dto: UpdateProductTypeDto) {
    this.logger.log(`[ProductTypesService] Updating product type ${id}`);
    const existing = await this.prisma.productType.findUnique({ where: { id } });
    if (!existing) {
      this.logger.warn(`[ProductTypesService] Product type ${id} not found for update`);
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.prisma.productType.findUnique({
        where: { name: dto.name },
      });
      if (nameConflict) {
        this.logger.warn(`[ProductTypesService] Conflict: Product type name "${dto.name}" already in use`);
        throw new ConflictException(`Product type with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.productType.update({
      where: { id },
      data: dto,
    });
    this.logger.log(`[ProductTypesService] Updated product type ${id} (${updated.name})`);
    return updated;
  }

  async remove(id: string) {
    this.logger.log(`[ProductTypesService] Deactivating product type ${id}`);
    const pt = await this.prisma.productType.findUnique({ where: { id } });
    if (!pt) {
      this.logger.warn(`[ProductTypesService] Product type ${id} not found for deletion`);
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    // Soft delete by setting isActive to false
    const deactivated = await this.prisma.productType.update({
      where: { id },
      data: { isActive: false },
    });
    this.logger.log(`[ProductTypesService] Deactivated product type ${id} (${deactivated.name})`);
    return deactivated;
  }
}

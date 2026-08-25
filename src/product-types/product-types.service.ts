import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';

@Injectable()
export class ProductTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductTypeDto) {
    const existing = await this.prisma.productType.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Product type with name "${dto.name}" already exists`);
    }

    return this.prisma.productType.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color || '#64748B',
      },
    });
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
    const existing = await this.prisma.productType.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.prisma.productType.findUnique({
        where: { name: dto.name },
      });
      if (nameConflict) {
        throw new ConflictException(`Product type with name "${dto.name}" already exists`);
      }
    }

    return this.prisma.productType.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const pt = await this.prisma.productType.findUnique({ where: { id } });
    if (!pt) {
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    // Soft delete by setting isActive to false
    return this.prisma.productType.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

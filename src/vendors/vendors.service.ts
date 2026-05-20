import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createVendorDto: CreateVendorDto) {
    const { departmentId, ...vendorData } = createVendorDto;

    // Check if department exists
    let department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      // Auto-create department for seamless developer testing since there's no POST /departments
      department = await this.prisma.department.create({
        data: {
          id: departmentId,
          code: 'GEN',
          fullName: 'General Department',
        },
      });
    }

    return this.prisma.vendor.create({
      data: {
        ...vendorData,
        departmentId: department.id,
      },
    });
  }

  async findAll(departmentId?: string) {
    return this.prisma.vendor.findMany({
      where: departmentId ? { departmentId } : {},
      include: {
        department: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async findAllDepartments() {
    let departments = await this.prisma.department.findMany({
      orderBy: { fullName: 'asc' },
    });

    if (departments.length === 0) {
      const standard = [
        { id: 'd3b07384-d113-4ec8-a5b6-7bbbcda20e6a', code: 'KIT', fullName: 'Kitchen & Foods' },
        { id: 'a2b07384-d113-4ec8-a5b6-7bbbcda20e6b', code: 'BEV', fullName: 'Beverages & Soft Drinks' },
        { id: 'b2b07384-d113-4ec8-a5b6-7bbbcda20e6c', code: 'PKG', fullName: 'Packaging & Janitorial' },
        { id: 'c2b07384-d113-4ec8-a5b6-7bbbcda20e6d', code: 'GEN', fullName: 'General Supply' },
      ];

      await this.prisma.department.createMany({
        data: standard,
      });

      departments = await this.prisma.department.findMany({
        orderBy: { fullName: 'asc' },
      });
    }

    return departments;
  }

  async update(id: string, updateVendorDto: any) {
    const { departmentId, ...vendorData } = updateVendorDto;

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException(`Department with ID "${departmentId}" not found`);
      }
    }

    return this.prisma.vendor.update({
      where: { id },
      data: {
        ...vendorData,
        ...(departmentId ? { departmentId } : {}),
      },
      include: {
        department: true,
      },
    });
  }

  async createDepartment(dto: { code: string; fullName: string; slackChannel?: string }) {
    return this.prisma.department.create({
      data: {
        code: dto.code,
        fullName: dto.fullName,
        slackChannel: dto.slackChannel,
      },
    });
  }

  async updateDepartment(id: string, dto: { code?: string; fullName?: string; slackChannel?: string }) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException(`Department with ID "${id}" not found`);
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        code: dto.code,
        fullName: dto.fullName,
        slackChannel: dto.slackChannel,
      },
    });
  }

  async deleteDepartment(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException(`Department with ID "${id}" not found`);
    }

    return this.prisma.department.delete({
      where: { id },
    });
  }
}

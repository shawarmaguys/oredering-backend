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
}

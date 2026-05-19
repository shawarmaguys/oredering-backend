import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createLocationDto: CreateLocationDto) {
    const { name, address, phone, email } = createLocationDto;

    const existing = await this.prisma.location.findUnique({
      where: { name },
    });
    if (existing) {
      throw new ConflictException(`Location with name "${name}" already exists`);
    }

    return this.prisma.location.create({
      data: { name, address, phone, email },
    });
  }

  async findAll() {
    return this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, updateLocationDto: any) {
    const { name, address, phone, email } = updateLocationDto;

    if (name) {
      const existing = await this.prisma.location.findUnique({
        where: { name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Location with name "${name}" already exists`);
      }
    }

    return this.prisma.location.update({
      where: { id },
      data: { name, address, phone, email },
    });
  }
}

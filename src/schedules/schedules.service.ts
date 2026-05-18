import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createScheduleDto: CreateScheduleDto) {
    const { locationId, vendorId, ...scheduleData } = createScheduleDto;

    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Verify vendor
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    return this.prisma.schedule.create({
      data: {
        ...scheduleData,
        locationId,
        vendorId,
      },
    });
  }

  async findAll() {
    return this.prisma.schedule.findMany({
      include: {
        location: true,
        vendor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

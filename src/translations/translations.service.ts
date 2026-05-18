import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTranslationDto } from './dto/create-translation.dto';

@Injectable()
export class TranslationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTranslationDto: CreateTranslationDto) {
    return this.prisma.translation.create({
      data: createTranslationDto,
    });
  }

  async findAll() {
    return this.prisma.translation.findMany({
      orderBy: { id: 'asc' },
    });
  }
}

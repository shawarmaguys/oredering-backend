import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { StockRecordsService } from './stock-records.service';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';
import { CompleteStockRecordDto } from './dto/complete-stock-record.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { createRateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('stock-records')
export class StockRecordsController {
  constructor(private readonly stockRecordsService: StockRecordsService) { }

  @Post()
  @UseGuards(createRateLimitGuard({ windowMs: 60000, max: 10 }))
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createStockRecordDto: CreateStockRecordDto,
    @CurrentUser() user: any,
  ) {
    return this.stockRecordsService.create(createStockRecordDto, user?.id || null);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER, UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockRecordsService.findAll(
      user,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockRecordsService.findOne(id);
  }

  @Patch(':id/complete')
  @UseGuards(createRateLimitGuard({ windowMs: 60000, max: 10 }))
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() completeStockRecordDto: CompleteStockRecordDto,
    @CurrentUser() user: any,
  ) {
    return this.stockRecordsService.complete(id, completeStockRecordDto);
  }
}

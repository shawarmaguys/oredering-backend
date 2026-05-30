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
} from '@nestjs/common';
import { StockRecordsService } from './stock-records.service';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';
import { CompleteStockRecordDto } from './dto/complete-stock-record.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('stock-records')
export class StockRecordsController {
  constructor(private readonly stockRecordsService: StockRecordsService) {}

  @Post()
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
  async findAll(@CurrentUser() user: any) {
    return this.stockRecordsService.findAll(user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockRecordsService.findOne(id);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() completeStockRecordDto: CompleteStockRecordDto,
    @CurrentUser() user: any,
  ) {
    return this.stockRecordsService.complete(id, completeStockRecordDto, user?.id || null);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { StockRecordsService } from './stock-records.service';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('stock-records')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockRecordsController {
  constructor(private readonly stockRecordsService: StockRecordsService) {}

  @Post()
  @Roles(UserRole.WORKER, UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createStockRecordDto: CreateStockRecordDto,
    @CurrentUser() user: any,
  ) {
    return this.stockRecordsService.create(createStockRecordDto, user.id);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  async findAll() {
    return this.stockRecordsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.WORKER, UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockRecordsService.findOne(id);
  }
}

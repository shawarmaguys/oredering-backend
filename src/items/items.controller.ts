import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Get()
  async findAll(
    @Query('vendor_id') vendorId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.itemsService.findAll({
      vendorId,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      sortBy,
      sortOrder,
    });
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return this.itemsService.update(id, updateItemDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.itemsService.remove(id);
  }
}

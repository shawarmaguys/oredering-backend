import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createLocationDto: CreateLocationDto) {
    return this.locationsService.create(createLocationDto);
  }

  @Get()
  async findAll() {
    return this.locationsService.findAll();
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    return this.locationsService.update(id, updateLocationDto);
  }

  @Get(':id/items')
  async getLocationItems(@Param('id') id: string) {
    return this.locationsService.getLocationItems(id);
  }

  @Post(':id/items')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER, UserRole.MANAGER)
  async addOrUpdateLocationItem(
    @Param('id') id: string,
    @Body() dto: { itemId: string; parLevel?: number; displayOrder?: number; isActive?: boolean },
  ) {
    return this.locationsService.addOrUpdateLocationItem(id, dto);
  }

  @Delete(':id/items/:itemId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER, UserRole.MANAGER)
  async removeLocationItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.locationsService.removeLocationItem(id, itemId);
  }
}


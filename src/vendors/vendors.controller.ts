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
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../common/helpers/location-auth.helper';

@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createVendorDto: CreateVendorDto) {
    return this.vendorsService.create(createVendorDto);
  }

  @Get()
  async findAll(
    @Query('department_id') departmentId?: string,
    @Query('location_id') locationId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.vendorsService.findAll({
      departmentId,
      locationId,
      user,
    });
  }

  @Get('unassigned')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  async findUnassigned(
    @Query('location_id') locationId: string,
    @Query('department_id') departmentId?: string,
  ) {
    return this.vendorsService.findUnassigned(locationId, departmentId);
  }

  @Get(':id/locations')
  async getLocationAssignments(@Param('id') id: string) {
    return this.vendorsService.getLocationAssignments(id);
  }

  @Post(':id/locations/:locationId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async assignToLocation(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
  ) {
    return this.vendorsService.assignToLocation(id, locationId);
  }

  @Delete(':id/locations/:locationId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromLocation(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
  ) {
    await this.vendorsService.removeFromLocation(id, locationId);
  }

  @Get('departments')
  async findAllDepartments() {
    return this.vendorsService.findAllDepartments();
  }

  @Post('departments')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async createDepartment(@Body() dto: { code: string; fullName: string; slackChannel?: string }) {
    return this.vendorsService.createDepartment(dto);
  }

  @Patch('departments/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: { code?: string; fullName?: string; slackChannel?: string },
  ) {
    return this.vendorsService.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  async deleteDepartment(@Param('id') id: string) {
    return this.vendorsService.deleteDepartment(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() updateVendorDto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(id, updateVendorDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Query('location_id') locationId?: string,
  ) {
    await this.vendorsService.remove(id, locationId);
  }
}

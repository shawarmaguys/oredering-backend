import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { SendPurchaseOrderDto } from './dto/send-purchase-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole, PurchaseOrderStatus } from '@prisma/client';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @Roles(UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createPurchaseOrderDto: CreatePurchaseOrderDto,
    @CurrentUser() user: any,
  ) {
    return this.purchaseOrdersService.create(createPurchaseOrderDto, user.id);
  }

  @Get()
  @Roles(UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: PurchaseOrderStatus,
  ) {
    return this.purchaseOrdersService.findAll(user, status);
  }

  @Get(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Post(':id')
  @Roles(UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePurchaseOrderDto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(id, updatePurchaseOrderDto);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.purchaseOrdersService.approve(id, user.id);
  }

  @Post(':id/send')
  @Roles(UserRole.MANAGER, UserRole.SUPER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() sendPurchaseOrderDto: SendPurchaseOrderDto,
    @CurrentUser() user: any,
  ) {
    return this.purchaseOrdersService.send(id, sendPurchaseOrderDto, user.id);
  }
}

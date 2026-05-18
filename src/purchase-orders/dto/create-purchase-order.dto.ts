import { IsNotEmpty, IsUUID, IsArray, ValidateNested, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  unitName: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @IsUUID()
  @IsNotEmpty()
  locationId: string;

  @IsUUID()
  @IsOptional()
  stockRecordId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

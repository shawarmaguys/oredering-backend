import { IsNotEmpty, IsUUID, IsArray, ValidateNested, IsNumber, Min, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePurchaseOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  @IsOptional()
  displayUnitName?: string;
}

export class UpdatePurchaseOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePurchaseOrderItemDto)
  items: UpdatePurchaseOrderItemDto[];
}


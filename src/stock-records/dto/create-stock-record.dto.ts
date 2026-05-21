import { IsNotEmpty, IsUUID, IsArray, ValidateNested, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StockRecordItemDto {
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  basicQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  secondaryQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  frontBasicQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  frontSecondaryQuantity?: number;
}

export class CreateStockRecordDto {
  @IsUUID()
  @IsNotEmpty()
  locationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockRecordItemDto)
  items: StockRecordItemDto[];
}

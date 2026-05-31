import { IsNotEmpty, IsUUID, IsArray, ValidateNested, IsNumber, IsOptional, Min, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteStockRecordItemDto {
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

export class CompleteStockRecordDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteStockRecordItemDto)
  items: CompleteStockRecordItemDto[];

  @IsString()
  @IsOptional()
  @MaxLength(120)
  submitterName?: string;
}

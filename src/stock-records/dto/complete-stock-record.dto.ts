import { IsNotEmpty, IsUUID, IsArray, ValidateNested, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteStockRecordItemDto {
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0)
  basicQuantity: number;

  @IsNumber()
  @Min(0)
  secondaryQuantity: number;
}

export class CompleteStockRecordDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteStockRecordItemDto)
  items: CompleteStockRecordItemDto[];
}

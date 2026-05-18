import { IsNotEmpty, IsUUID, IsArray, ValidateNested, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StockRecordItemDto {
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0)
  enteredQuantity: number;

  @IsString()
  @IsNotEmpty()
  enteredUnit: string;
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

import { IsNotEmpty, IsOptional, IsString, IsUUID, IsNumber, Min } from 'class-validator';

export class CreateItemDto {
  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  @IsNotEmpty()
  baseUnitName: string;

  @IsString()
  @IsOptional()
  displayUnitName?: string;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  multiplier?: number;

  @IsString()
  @IsOptional()
  productCode?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

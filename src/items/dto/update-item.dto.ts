import { IsOptional, IsString, IsUUID, IsNumber, Min } from 'class-validator';

export class UpdateItemDto {
  @IsUUID()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  baseUnitName?: string;

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

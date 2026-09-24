import { IsOptional, IsString, IsUUID, IsNumber, Min, IsBoolean } from 'class-validator';

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
  spanishName?: string;

  @IsUUID()
  @IsOptional()
  productTypeId?: string | null;

  @IsString()
  @IsOptional()
  note?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}


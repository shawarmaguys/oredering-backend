import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkItemRowDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  productCode?: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsString()
  @IsOptional()
  vendorName?: string;

  @IsUUID()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsOptional()
  productTypeName?: string;

  @IsUUID()
  @IsOptional()
  productTypeId?: string;

  @IsString()
  @IsNotEmpty()
  baseUnitName!: string;

  @IsString()
  @IsOptional()
  displayUnitName?: string;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  multiplier?: number;

  @IsString()
  @IsOptional()
  spanishName?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  parLevel?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BulkUploadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkItemRowDto)
  items!: BulkItemRowDto[];

  @IsUUID()
  @IsOptional()
  locationId?: string;
}

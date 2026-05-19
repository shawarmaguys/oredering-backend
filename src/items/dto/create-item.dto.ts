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
  @IsNotEmpty()
  displayUnitName: string;

  @IsNumber()
  @Min(0.0001)
  multiplier: number;

  @IsString()
  @IsOptional()
  productCode?: string;
}

import { PartialType } from '@nestjs/mapped-types';
import { CreateProductTypeDto } from './create-product-type.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateProductTypeDto extends PartialType(CreateProductTypeDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

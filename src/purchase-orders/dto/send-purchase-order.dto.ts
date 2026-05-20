import { IsNotEmpty, IsArray, IsString, IsOptional } from 'class-validator';

export class SendPurchaseOrderDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  emails: string[];

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

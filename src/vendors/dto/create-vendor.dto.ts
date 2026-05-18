import { IsNotEmpty, IsOptional, IsString, IsUUID, IsEmail } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  @IsOptional()
  channelName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address1?: string;

  @IsString()
  @IsOptional()
  address2?: string;

  @IsString()
  @IsOptional()
  address3?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsUUID()
  @IsNotEmpty()
  departmentId: string;
}

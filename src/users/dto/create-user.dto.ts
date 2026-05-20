import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength, IsOptional, IsArray, IsUUID } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  locationIds?: string[];
}

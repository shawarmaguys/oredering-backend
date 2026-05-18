import { IsNotEmpty, IsUUID, IsEnum, IsInt, IsOptional, IsString, Min, Max, Matches } from 'class-validator';
import { ScheduleType } from '@prisma/client';

export class CreateScheduleDto {
  @IsUUID()
  @IsNotEmpty()
  locationId: string;

  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @IsEnum(ScheduleType)
  @IsNotEmpty()
  scheduleType: ScheduleType;

  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'triggerTime must be in HH:MM format',
  })
  triggerTime: string;

  @IsString()
  @IsOptional()
  slackChannel?: string;
}

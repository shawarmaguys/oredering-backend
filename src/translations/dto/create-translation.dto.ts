import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTranslationDto {
  @IsString()
  @IsNotEmpty()
  sourceText: string;

  @IsString()
  @IsNotEmpty()
  translatedText: string;

  @IsString()
  @IsNotEmpty()
  sourceLanguage: string;

  @IsString()
  @IsNotEmpty()
  targetLanguage: string;
}

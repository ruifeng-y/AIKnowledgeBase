import { IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateSpaceDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(3, 80)
  @Matches(SLUG)
  slug!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}

export class UpdateSpaceDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  @Matches(SLUG)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string | null;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

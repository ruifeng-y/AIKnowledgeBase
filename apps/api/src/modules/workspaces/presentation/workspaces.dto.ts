import { IsOptional, IsString, Length, Matches } from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateWorkspaceDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(3, 80)
  @Matches(SLUG)
  slug!: string;
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  @Matches(SLUG)
  slug?: string;
}

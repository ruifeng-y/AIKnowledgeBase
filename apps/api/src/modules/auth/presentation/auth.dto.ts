import { IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @Length(3, 320)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @Length(1, 100)
  name!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @Length(1, 4000)
  refreshToken!: string;
}

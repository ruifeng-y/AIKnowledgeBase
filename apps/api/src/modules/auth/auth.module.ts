import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { AppConfigModule } from '../../common/config/app-config.module';
import { Argon2PasswordService } from '../../infrastructure/auth/argon2-password.service';
import { JwtTokenService } from '../../infrastructure/auth/jwt-token.service';
import { UserAccountRepositoryAdapter } from '../../infrastructure/database/user-account.repository.adapter';
import { AuthApplicationService } from '../users/application/auth.application.service';
import { USER_ACCOUNT_REPOSITORY } from '../users/domain/user-account.port';
import { PASSWORD_SERVICE, TOKEN_SERVICE } from './domain/auth-ports';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [
    AppConfigModule,
    JwtModule.registerAsync({
      global: true,
      imports: [AppConfigModule],
      useFactory: (config: AppConfig) => ({
        secret: config.auth.jwtSecret,
        signOptions: { expiresIn: config.auth.accessTokenTtl as never },
      }),
      inject: [APP_CONFIG],
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: PASSWORD_SERVICE, useClass: Argon2PasswordService },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: USER_ACCOUNT_REPOSITORY, useClass: UserAccountRepositoryAdapter },
    {
      provide: AuthApplicationService,
      useFactory: (
        users: UserAccountRepositoryAdapter,
        password: Argon2PasswordService,
        tokens: JwtTokenService,
      ) => new AuthApplicationService(users, password, tokens),
      inject: [USER_ACCOUNT_REPOSITORY, PASSWORD_SERVICE, TOKEN_SERVICE],
    },
  ],
  exports: [AuthApplicationService, TOKEN_SERVICE, USER_ACCOUNT_REPOSITORY, PASSWORD_SERVICE],
})
export class AuthModule {}

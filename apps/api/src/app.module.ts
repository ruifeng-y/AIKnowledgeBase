import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './common/config/app-config.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { TOKEN_SERVICE } from './modules/auth/domain/auth-ports';
import type { TokenServicePort } from './modules/auth/domain/auth-ports';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { KnowledgeSpacesModule } from './modules/knowledge-spaces/knowledge-spaces.module';
import { USER_ACCOUNT_REPOSITORY } from './modules/users/domain/user-account.port';
import type { UserAccountRepositoryPort } from './modules/users/domain/user-account.port';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AuthModule,
    UsersModule,
    WorkspacesModule,
    KnowledgeSpacesModule,
    DocumentsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: JwtAuthGuard,
      useFactory: (
        reflector: Reflector,
        tokens: TokenServicePort,
        users: UserAccountRepositoryPort,
      ) => new JwtAuthGuard(reflector, tokens, users),
      inject: [Reflector, TOKEN_SERVICE, USER_ACCOUNT_REPOSITORY],
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  ],
})
export class AppModule {}

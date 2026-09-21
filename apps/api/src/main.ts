import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './common/config/app-config';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix(config.app.apiPrefix, { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Knowledge Base API')
    .setDescription('Enterprise Knowledge Base / RAG platform API (V0.4-D architecture baseline)')
    .setVersion('0.4-D')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Session JWT (business auth arrives in later phases)',
      },
      'bearer',
    )
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.app.port;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/health`, 'Bootstrap');
  Logger.log(`Swagger on http://localhost:${port}/api/docs`, 'Bootstrap');
}

void bootstrap();

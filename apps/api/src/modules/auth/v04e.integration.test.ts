import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';

const suffix = Date.now().toString(36);

function appConfig(): AppConfig {
  return {
    app: {
      nodeEnv: 'test',
      port: 0,
      apiPrefix: 'api/v1',
      corsOrigins: ['http://localhost:3000'],
    },
    database: {
      url:
        process.env['DATABASE_URL'] ??
        'postgresql://akb:change_me@localhost:5432/ai_knowledge_base',
    },
    redis: { host: 'localhost', port: 6379, url: 'redis://localhost:6379' },
    storage: {
      endpoint: 'http://localhost:9000',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'change_me',
      bucket: 'ai-knowledge-base',
      region: 'us-east-1',
    },
    auth: {
      jwtSecret: process.env['JWT_SECRET'] ?? 'test-secret-v04e',
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
    ai: {
      llmProvider: 'mock',
      llmModel: 'mock-llm',
      embeddingProvider: 'mock',
      embeddingModel: 'mock-embedding',
      embeddingDimensions: 8,
      rerankerProvider: 'mock',
      rerankerModel: 'mock-reranker',
    },
    queue: { defaultQueue: 'akb-default' },
    logging: { level: 'error' },
  };
}

describe('V0.4-E Auth + Workspace + Knowledge Space', () => {
  let app: INestApplication;

  const userA = {
    email: `user-a-${suffix}@example.com`,
    password: 'password123',
    name: 'User A',
  };
  const userB = {
    email: `user-b-${suffix}@example.com`,
    password: 'password123',
    name: 'User B',
  };

  let tokenA = '';
  let tokenB = '';
  let workspaceA = '';
  let workspaceB = '';
  let spaceA = '';
  let spaceB = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(appConfig())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('health remains public', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('register/login/me/workspace/space happy path and tenant isolation', async () => {
    // Register A
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userA)
      .expect(201);
    tokenA = regA.body.tokens.accessToken as string;
    expect(tokenA).toBeTruthy();
    expect(regA.body.user.email).toBe(userA.email.toLowerCase());
    expect(JSON.stringify(regA.body)).not.toContain('password');
    expect(JSON.stringify(regA.body)).not.toContain('passwordHash');

    // Duplicate email
    const dup = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userA)
      .expect(409);
    expect(dup.body.error.code).toBe('AUTH_EMAIL_ALREADY_EXISTS');

    // Register B
    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userB)
      .expect(201);
    tokenB = regB.body.tokens.accessToken as string;

    // Invalid credentials
    const badLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: 'wrongpass1' })
      .expect(401);
    expect(badLogin.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    // Login A
    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: userA.password })
      .expect(200);
    expect(loginA.body.tokens.accessToken).toBeTruthy();
    tokenA = loginA.body.tokens.accessToken as string;

    // Refresh
    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginA.body.tokens.refreshToken })
      .expect(200);
    expect(refresh.body.tokens.accessToken).toBeTruthy();

    // Invalid refresh
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-jwt' })
      .expect(401);

    // Logout
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // me unauthorized
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

    // me authorized
    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(me.body.id).toBeTruthy();
    expect(me.body.email).toBe(userA.email.toLowerCase());

    // Create workspaces
    const wsA = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Workspace A', slug: `ws-a-${suffix}` })
      .expect(201);
    workspaceA = wsA.body.id as string;

    const wsB = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Workspace B', slug: `ws-b-${suffix}` })
      .expect(201);
    workspaceB = wsB.body.id as string;

    // Duplicate slug
    const dupWs = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Dup', slug: `ws-a-${suffix}` })
      .expect(409);
    expect(dupWs.body.error.code).toBe('WORKSPACE_SLUG_ALREADY_EXISTS');

    // List only owned
    const listA = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listA.body.some((w: { id: string }) => w.id === workspaceA)).toBe(true);
    expect(listA.body.some((w: { id: string }) => w.id === workspaceB)).toBe(false);

    // Tenant isolation workspace
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'hacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    // Owner get/update
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Workspace A Updated' })
      .expect(200);

    // Create spaces
    const spA = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA}/spaces`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Space A', slug: `space-a-${suffix}`, description: 'A docs' })
      .expect(201);
    spaceA = spA.body.id as string;

    const spB = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceB}/spaces`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Space B', slug: `space-b-${suffix}` })
      .expect(201);
    spaceB = spB.body.id as string;

    // Same slug different workspace allowed
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceB}/spaces`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Space A clone', slug: `space-a-${suffix}` })
      .expect(201);

    // Duplicate slug same workspace
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA}/spaces`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Dup', slug: `space-a-${suffix}` })
      .expect(409);

    // Tenant isolation spaces
    await request(app.getHttpServer())
      .get(`/api/v1/spaces/${spaceB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/spaces/${spaceA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/spaces/${spaceB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'hacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/spaces/${spaceB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    // Owner space get/update
    await request(app.getHttpServer())
      .get(`/api/v1/spaces/${spaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/spaces/${spaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ description: 'updated', settings: { note: 'ok' } })
      .expect(200);

    // B access own
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceB}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/spaces/${spaceB}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Delete space then workspace cascade
    await request(app.getHttpServer())
      .delete(`/api/v1/spaces/${spaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/spaces/${spaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    // Cleanup B space + workspaces
    await request(app.getHttpServer())
      .delete(`/api/v1/spaces/${spaceB}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceB}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  }, 60_000);
});

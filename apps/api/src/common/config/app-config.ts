export const APP_CONFIG = Symbol('APP_CONFIG');

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  app: {
    nodeEnv: NodeEnv;
    port: number;
    apiPrefix: string;
  };
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
    url: string;
  };
  storage: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
  };
  auth: {
    jwtSecret: string;
    accessTokenTtlSeconds: number;
  };
  ai: {
    llmProvider: string;
    llmModel: string;
    embeddingProvider: string;
    embeddingModel: string;
    embeddingDimensions: number;
    rerankerProvider: string;
    rerankerModel: string;
  };
  queue: {
    defaultQueue: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

function str(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key];
  return value !== undefined && value !== '' ? value : fallback;
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nodeEnv(env: NodeJS.ProcessEnv): NodeEnv {
  const raw = env['NODE_ENV'];
  return raw === 'production' || raw === 'test' ? raw : 'development';
}

function logLevel(env: NodeJS.ProcessEnv): 'debug' | 'info' | 'warn' | 'error' {
  const raw = env['LOG_LEVEL'];
  return raw === 'debug' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

/** Single place that reads process.env. Business code must inject APP_CONFIG. */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    app: {
      nodeEnv: nodeEnv(env),
      port: int(env, 'API_PORT', 3001),
      apiPrefix: 'api/v1',
    },
    database: {
      url: str(env, 'DATABASE_URL', 'postgresql://akb:change_me@localhost:5432/ai_knowledge_base'),
    },
    redis: {
      host: str(env, 'REDIS_HOST', 'localhost'),
      port: int(env, 'REDIS_PORT', 6379),
      url: str(env, 'REDIS_URL', 'redis://localhost:6379'),
    },
    storage: {
      endpoint: str(env, 'S3_ENDPOINT', 'http://localhost:9000'),
      accessKeyId: str(env, 'S3_ACCESS_KEY_ID', 'minioadmin'),
      secretAccessKey: str(env, 'S3_SECRET_ACCESS_KEY', 'change_me'),
      bucket: str(env, 'S3_BUCKET', 'ai-knowledge-base'),
      region: str(env, 'S3_REGION', 'us-east-1'),
    },
    auth: {
      jwtSecret: str(env, 'JWT_SECRET', 'dev-only-change-me'),
      accessTokenTtlSeconds: int(env, 'JWT_ACCESS_TTL_SECONDS', 3600),
    },
    ai: {
      llmProvider: str(env, 'LLM_PROVIDER', 'mock'),
      llmModel: str(env, 'LLM_MODEL', 'mock-llm'),
      embeddingProvider: str(env, 'EMBEDDING_PROVIDER', 'mock'),
      embeddingModel: str(env, 'EMBEDDING_MODEL', 'mock-embedding'),
      embeddingDimensions: int(env, 'EMBEDDING_DIMENSIONS', 8),
      rerankerProvider: str(env, 'RERANKER_PROVIDER', 'mock'),
      rerankerModel: str(env, 'RERANKER_MODEL', 'mock-reranker'),
    },
    queue: {
      defaultQueue: str(env, 'QUEUE_DEFAULT_NAME', 'akb-default'),
    },
    logging: {
      level: logLevel(env),
    },
  };
}

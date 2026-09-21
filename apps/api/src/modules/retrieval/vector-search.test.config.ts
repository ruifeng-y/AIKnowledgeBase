export const VECTOR_SEARCH_SERVICE_TEST_CONFIG = {
  app: {
    nodeEnv: 'test' as const,
    port: 0,
    apiPrefix: 'api/v1',
    corsOrigins: ['http://localhost:3000'],
  },
  database: {
    url:
      process.env['DATABASE_URL'] ?? 'postgresql://akb:change_me@localhost:5432/ai_knowledge_base',
  },
  redis: { host: 'localhost', port: 6379, url: 'redis://localhost:6379' },
  storage: {
    endpoint: 'http://127.0.0.1:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'change_me',
    bucket: 'ai-knowledge-base',
    region: 'us-east-1',
  },
  auth: {
    jwtSecret: process.env['JWT_SECRET'] ?? 'test-secret-v04j',
    accessTokenTtl: '15m',
    refreshTokenTtl: '7d',
  },
  documents: {
    maxFileSizeBytes: 1024 * 1024,
    allowedMimeTypes: ['text/plain', 'text/markdown', 'application/json'],
  },
  ai: {
    llmProvider: 'mock',
    llmModel: 'mock-llm',
    embeddingProvider: 'mock',
    embeddingModel: 'mock-embedding-v1',
    embeddingDimensions: 384,
    rerankerProvider: 'mock',
    rerankerModel: 'mock-reranker',
  },
  queue: { defaultQueue: 'akb-default' },
  logging: { level: 'error' as const },
};

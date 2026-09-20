-- Infrastructure-only bootstrap for local Docker PostgreSQL.
-- Creates the pgvector extension required by later RAG phases.
-- No business tables are created here.

CREATE EXTENSION IF NOT EXISTS vector;

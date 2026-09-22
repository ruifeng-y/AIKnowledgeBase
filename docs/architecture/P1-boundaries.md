# Architecture Boundaries (P1)

## Layers

```text
Presentation → Application → Domain Ports → Infrastructure → External
```

## Canonical Provider Ports

| Capability | Port | Location |
|------------|------|----------|
| Embedding | `EmbeddingProviderPort` | `@akb/ai` |
| Reranker | `RerankerProviderPort` | `apps/api/.../domain/reranker.port.ts` |
| LLM | `LlmProviderPort` | `apps/api/.../domain/rag.port.ts` |

Legacy `infrastructure/ai/ai-provider.ports.ts` scaffolding was **removed** in P1 (no production references).

## Forbidden

- Domain → NestJS / Prisma / MinIO / BullMQ / concrete AI SDK
- Application → Prisma / pgvector SQL / MinIO SDK / `@akb/db` / concrete AI SDK / HTTP client
- Presentation → Prisma / provider SDK / database SQL

Enforced by `apps/api/src/architecture/architecture.test.ts`.

## Embedding Persistence

Identity `(chunkId, provider, model, dimensions)` with DB UNIQUE + native upsert. See `docs/decisions/P1-ADR-001-embedding-record-identity-and-concurrency.md`.

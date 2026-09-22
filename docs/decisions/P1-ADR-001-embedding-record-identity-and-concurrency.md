# P1-ADR-001 — Embedding Record Identity and Concurrency

## Problem

`embedding_records` historically had no database UNIQUE on the embedding identity. Persistence used application-level `UPDATE` then `INSERT`, which under concurrency could create duplicate rows for the same logical embedding.

## Context

- V0.4-I introduced embedding persistence with application-level upsert.
- V0.4-J–M retrieval filters by `(provider, model, dimensions)` but does not require uniqueness.
- P1 freezes identity as `(chunkId, provider, model, dimensions)` and requires DB-enforced uniqueness.

## Decision

1. **Identity** = `(chunkId, provider, model, dimensions)`.
2. **Database guarantee** = UNIQUE index `embedding_records_chunk_id_provider_model_dimensions_key`.
3. **Write strategy** = database-native `INSERT ... ON CONFLICT (chunk_id, provider, model, dimensions) DO UPDATE`.
4. **Concurrency** = enforced by PostgreSQL unique index + upsert; not application locking.
5. **Migration** = `20260922160000_add_embedding_record_unique_identity` (additive index only).

## Identity

Same identity always maps to one row. Different `model` or `dimensions` are distinct identities and may coexist on the same `chunk_id`.

## Database Constraint

```sql
CREATE UNIQUE INDEX embedding_records_chunk_id_provider_model_dimensions_key
  ON embedding_records (chunk_id, provider, model, dimensions);
```

Verified in `pg_indexes` on the live database after apply.

## Upsert Strategy

```sql
INSERT ... ON CONFLICT (chunk_id, provider, model, dimensions)
DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = NOW()
```

Re-embedding the same identity updates the existing row (row count remains 1).

## Duplicate Reconciliation

**Preflight result (2026-09-22):** 0 duplicate groups, 0 rows to reconcile.  
**Survivor rule:** N/A — no duplicates existed before creating the UNIQUE index.

If future reconciliation is required: keep the row with the greatest `updated_at`, tie-break by `created_at`, then `id` (stable primary key). Record groups removed and survivors in this ADR before applying deletes.

## Concurrency Test

Real PostgreSQL integration (`embedding-upsert.concurrency.test.ts`):

- 10 concurrent upserts, same identity → 1 row
- 10 concurrent re-embeddings → 1 row
- different model/dimension identities coexist
- sequential idempotency → 1 row
- unique constraint present in `pg_indexes`

## Rejected Alternatives

| Alternative | Why rejected |
|-------------|--------------|
| Keep application UPDATE+INSERT | Race remains under concurrency |
| UNIQUE on `(chunk_id, provider, model)` only | Fails contract: dimensions must be part of identity |
| Application advisory locks | Not database-enforced; easier to get wrong |
| `prisma migrate reset` / drop DB | Violates P1 migration safety; destroys persistent data |

## Consequences

- Concurrent embedding writers cannot create duplicate identities.
- Different dimensions/models intentionally coexist.
- Retrieval identity matching (`provider`/`model`/`dimensions`) is unchanged.
- Public retrieval/RAG API semantics are unchanged.

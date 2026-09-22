-- P1-A: EmbeddingRecord identity UNIQUE (chunk_id, provider, model, dimensions)
-- Preflight: 0 duplicate groups on existing database (verified 2026-09-22).
-- Survivor rule: N/A — no duplicates to reconcile.

-- CreateIndex
CREATE UNIQUE INDEX "embedding_records_chunk_id_provider_model_dimensions_key" ON "embedding_records"("chunk_id", "provider", "model", "dimensions");

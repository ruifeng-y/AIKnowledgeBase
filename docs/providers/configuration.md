# Provider Configuration

## Secrets

API keys come **only** from environment variables (`EMBEDDING_API_KEY`, `RERANKER_API_KEY`, `LLM_API_KEY`) or a deployment secret store.

Never place keys in source, fixtures, evaluation datasets, README, or logs.

## Example (development)

```text
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_ENDPOINT=https://api.example.com/v1
EMBEDDING_API_KEY=...
EMBEDDING_DIMENSION=1536
EMBEDDING_BATCH_SIZE=32
```

```text
LLM_PROVIDER=openai-compatible
LLM_MODEL=gpt-4o-mini
LLM_ENDPOINT=https://api.example.com/v1
LLM_API_KEY=...
LLM_MAX_OUTPUT_TOKENS=1024
```

```text
RERANKER_PROVIDER=http
RERANKER_MODEL=rerank-v1
RERANKER_ENDPOINT=https://api.example.com/v1/rerank
RERANKER_API_KEY=...
RERANKER_MAX_CANDIDATES=50
```

## Embedding identity

Storage identity remains `(chunkId, provider, model, dimensions)` (V0.4-P1). Changing model or dimensions creates a distinct identity.

## Production / Test isolation

| Context | Providers |
|---------|-----------|
| CI / unit / contract | Mock |
| `NODE_ENV=production` | Production (mock rejected unless `EVALUATION_MODE=mock`) |
| Integration opt-in | Set real endpoint + key + `PROVIDER_MODE=production` |

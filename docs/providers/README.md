# Providers (V0.5-A)

## Architecture

```text
Application → Canonical Port → Provider Registry → Production Adapter → External HTTP API
```

- Embedding: `EmbeddingProviderPort` (`@akb/ai`)
- Reranker: `RerankerProviderPort` (retrieval domain)
- LLM: `LlmProviderPort` (rag domain)
- Adapters live only in `apps/api/src/infrastructure/providers/`

## Protocols

| Capability | Protocol |
|------------|----------|
| Embedding | OpenAI-compatible `POST /v1/embeddings` |
| LLM | OpenAI-compatible `POST /v1/chat/completions` |
| Reranker | AKB HTTP JSON: `{query, documents:[{chunkId,content}]}` → `{results:[{chunkId,score}]}` |

## Configuration (env)

| Key | Meaning |
|-----|---------|
| `EMBEDDING_PROVIDER` / `MODEL` / `ENDPOINT` / `API_KEY` / `DIMENSION` / `BATCH_SIZE` / `TIMEOUT_MS` / `MAX_RETRIES` | Embedding |
| `RERANKER_*` + `MAX_CANDIDATES` / `BATCH_SIZE` | Reranker |
| `LLM_*` + `MAX_INPUT_TOKENS` / `MAX_OUTPUT_TOKENS` | LLM |
| `PROVIDER_MODE` | `mock` (default CI) or `production` |
| `EVALUATION_MODE=mock` | Allow mock in non-test eval |

**API keys only from environment. Never commit or log secrets.**

## Mock vs Production

- `*_PROVIDER=mock` → deterministic Mock (CI/unit)
- Production config requires endpoint + apiKey; missing → `PROVIDER_NOT_CONFIGURED`
- No silent fallback from production to mock

## Timeout / Retry

- Default timeout 30s (`AbortController`)
- maxRetries default 3, exponential backoff + jitter
- Retryable: timeout, network, 429, 5xx
- Non-retryable: 400/401/403/404, invalid response
- Honors `Retry-After` when present

## Error codes

`PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_AUTH_FAILED`, `PROVIDER_BAD_REQUEST`, `PROVIDER_NOT_FOUND`, `PROVIDER_SERVER_ERROR`, `PROVIDER_INVALID_RESPONSE`, `PROVIDER_NETWORK_ERROR`, `PROVIDER_NOT_CONFIGURED`

## Health / Smoke

```bash
pnpm provider:smoke
```

Default **mock** mode. Real smoke requires `PROVIDER_MODE=production` + credentials; otherwise `SKIPPED_PROVIDER_UNAVAILABLE`.

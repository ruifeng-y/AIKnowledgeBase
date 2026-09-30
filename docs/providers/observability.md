# Provider Observability (V0.5-B)

## Structured events

```text
provider.request.started
provider.request.completed
provider.request.failed
```

Fields: `requestId`, `operation` (`embedding`|`reranker`|`llm`), `provider`, `model`, `latencyMs`, `retryCount`, `errorCode`, plus embedding `inputCount`/`dimensions`, reranker `inputCount`/`outputCount`, LLM `usage` (or `null` when unavailable).

## Metrics labels (low cardinality only)

Allowed: `operation`, `provider`, `model`.  
Forbidden: `workspaceId`, `spaceId`, `documentId`, `chunkId`, `query`, `prompt`, `answer`, `apiKey`.

## Security

Production logs never include API keys, Authorization headers, full prompts, or retrieved context by default. `redactSecrets` is applied to error messages.

## Isolation

Logging/metrics failures must not change Provider business results.

## Latency / retry

`latencyMs` = provider request start → response/timeout only.  
`retryCount` = attempts − 1 on one logical call.

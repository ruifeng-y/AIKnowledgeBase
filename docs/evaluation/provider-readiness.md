# Provider Readiness (V0.5-C)

## Definition

```text
REAL_PROVIDER_READY
=
Embedding READY
+
Reranker READY
+
LLM READY
```

Each capability must be:

```text
Configured + Credentials + Endpoint + Health PASS + Real Smoke PASS
```

## States

- `READY` — real config + health healthy + smoke PASS
- `FAILED` — real config but health/smoke failed
- `UNAVAILABLE` — missing credentials, mock, or not verified

## Rules

- Mock is **never** real-ready (`mock provider is not real-ready`)
- Missing credentials → `UNAVAILABLE` / `PROVIDER_UNAVAILABLE`, never Mock fallback
- Health and Smoke must **both** pass
- Provider readiness does **not** read Gold cases
- Gold validation does **not** call providers

## Commands

```bash
pnpm --filter @akb/evaluation evaluation:provider:readiness
pnpm --filter @akb/evaluation evaluation:readiness   # Gold + Provider dual gate
```

## Snapshot / fingerprint

Readiness records safe `providerSnapshot` (provider/model/dimensions) and `configFingerprint` / `readinessFingerprint`. Never includes apiKey.

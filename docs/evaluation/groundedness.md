# Groundedness Evaluation (V0.5-C)

## Separation

```text
Citation Validity ≠ Groundedness
Answer Non-Empty ≠ Answer Correctness
```

Citation validity checks whether cited sources are allowed and supported by server-owned C1..Cn mapping. Groundedness checks whether the **answer text** is supported by retrieved context evidence.

## Judge input (leakage control)

The evaluator receives only:

- query
- answer
- retrieved context texts / chunk ids
- validated citations

It must **not** receive gold labels, expected grades, or reference answers.

## Status output

- `grounded`
- `partially_grounded`
- `ungrounded`
- `unable_to_evaluate`

Optional numeric score is secondary and must not replace the status.

## Default evaluator

`LexicalGroundednessEvaluator` (`evaluatorVersion=1.0.0`) — deterministic lexical overlap. Model-based judges may be plugged later and must record `evaluatorName` / `evaluatorModel` / `evaluatorVersion`. Uncertain cases → `MANUAL_REVIEW_REQUIRED`.

## Abstention

For `unanswerable` gold cases, success is abstain/refuse (including the frozen empty-context phrase). Hallucinated or out-of-corpus facts count as `Unsupported Answer`.

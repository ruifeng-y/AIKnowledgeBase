# Semantic Gold Dataset (V0.5-C)

## Principle

```text
Human Gold ≠ Synthetic Gold
```

MiMo Code may generate **candidates** (query / chunks / answer / category) but they are stored as:

```text
annotationStatus=DRAFT
provenance=machine_generated
```

Only human review can set `annotationStatus=GOLD`.

## Schema (per case)

- `id` — stable (`semantic-0001` …)
- `datasetVersion` / `corpusVersion`
- `query`, `category[]`, `answerability` (`answerable` | `unanswerable`)
- `expectedRelevantChunks[]` with `relevanceGrade` 0..3 (>=2 is relevant)
- `relevanceGrades` map
- `referenceAnswer` (required when answerable)
- `expectedCitationSources[]` (must be subset of relevant chunks with grade >= 2)
- `annotationStatus` (`DRAFT` | `REVIEWED` | `GOLD` | `INVALID`)
- `provenance` (`human` | `machine_generated` | `machine_assisted`)

## Dataset integrity

- `contentHash` over canonical case fields; any edit changes the hash.
- Dataset versions are immutable once published.

## Validation

`evaluation:gold:validate` checks unique ids, non-empty queries, grades 0..3, broken chunk refs, grade/citation consistency, synthetic-as-GOLD, and distribution.

### Category counting

- **caseCount** — one per case (`primaryCategory`)
- **categoryAssignmentCount** — multi-label sum over `category[]`

These are reported separately and must not be confused.

### Category names

Contract names: `exact_keyword`, `semantic_paraphrase`, `identifier`, `technical_term`, `multi_keyword`, `numeric`, `date`, `negative_query`, `version_specific`, `cross_section`, `no_answer`, `prompt_injection`.

Legacy aliases are normalized by `evaluation:gold:normalize`:
`numeric_fact→numeric`, `identifier_exact_match→identifier`, `date_fact→date`.

## Readiness gate

`humanCuratedGoldCount >= 50` **and** required category coverage **and** no blocking validation errors → `READY`; otherwise `SEMANTIC_BENCHMARK_NOT_READY`.

`evaluation:readiness` combines Gold + Provider gates (`REAL_BENCHMARK_READY` only when both pass).

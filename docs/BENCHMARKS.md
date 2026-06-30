# MemHeaven behavior evals

MemHeaven includes a small synthetic self-eval harness for memory behavior. It is meant to make retrieval, scope isolation, tenant isolation, and KG lifecycle changes reviewable.

This is **not** a MemHeaven-vs-MemPalace benchmark and it does not make headline quality claims. Direct MemPalace comparison is optional future work. The first goal is a repeatable MemHeaven baseline that future branches can compare against.

## Local deterministic eval

Run the fake-backed local eval:

```bash
npm run eval:local
```

The local runner uses the same service functions as normal tests (`addDrawer`, `searchDrawers`, `checkDuplicate`, `kgAdd`, `kgQuery`, `kgInvalidate`, and `kgTimeline`) with deterministic test fakes for D1, R2, Workers AI, and Vectorize. It does not require Cloudflare credentials or production resources.

The fixture lives at:

```text
evals/fixtures/memory-behavior.json
```

It uses synthetic data only. Do not add real user memories, private project dumps, tokens, or endpoint credentials.

The report includes:

- Recall@1 / Recall@3 / Recall@5
- MRR and mean expected-result rank
- duplicate final drawer result count
- wrong-scope and wrong-tenant hard failures
- duplicate-check hard failures
- KG lifecycle pass/fail counts

Safety invariants fail hard:

- tenant leakage
- scoped-search leakage
- forbidden fixture results
- KG invalidation/current-query mismatches

Retrieval quality metrics are reported as baseline observations. The current local environment uses deterministic fake character-frequency embeddings, so scores are useful for branch-to-branch comparison but are not product quality claims.

## Baseline comparison

Compare the current local run to the checked-in baseline:

```bash
npm run eval:baseline
```

The baseline lives at:

```text
evals/baselines/local-fake-vectorize.v1.json
```

If an intentional retrieval or KG behavior change alters the baseline, regenerate the local report, inspect the diff, and update the baseline in the same change. Do not treat fake-embedding recall movement as a public benchmark result.

## Remote smoke/eval

The remote eval is opt-in and reads configuration only from environment variables:

```bash
MEMHEAVEN_EVAL_BASE_URL=https://memheaven.example.com \
MEMHEAVEN_EVAL_BEARER_TOKEN=<dedicated-eval-tenant-token> \
npm run eval:remote
```

Optional second-tenant isolation check:

```bash
MEMHEAVEN_EVAL_BEARER_TOKEN_B=<second-dedicated-eval-tenant-token>
```

If required variables are missing, `npm run eval:remote` prints a skipped result and exits successfully.

Remote smoke uses namespaced data containing `PER-34 remote smoke <run_id>` and covers:

- MCP status tool call
- add drawer
- search the newly added drawer
- best-effort drawer cleanup
- KG add/query/invalidate/current-query flow
- optional second-token search isolation

Use a dedicated eval tenant when possible. KG and audit history may remain by design because KG has historical timelines and audit logs.

## When to run

Run local evals:

- before and after retrieval ranking changes such as hybrid reranking
- before claiming wake-context improvements
- after KG temporal, staleness, or conflict-check changes
- before updating the committed baseline

Run remote smoke:

- before deployment when remote MCP behavior matters
- after OAuth/token/access-key changes, using a dedicated eval tenant

## Future work

PER-31 can expand the fixture with stricter exact-phrase and identifier ranking expectations after deterministic hybrid reranking lands. PER-33 can add KG conflict/staleness warning cases after the checker exists. Optional MemHeaven-vs-MemPalace comparison should be a separate, explicitly scoped effort with licensing and methodology reviewed first.

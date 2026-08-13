# Continue

Internal handoff summary for future maintenance sessions.

Public product docs should treat `docs/PROJECT_STATE.md` and `README.md` as the primary public-facing sources of truth.

## Current maintenance notes

- `wrangler.toml` is local-only and gitignored; commit shared defaults in `wrangler.toml.example`. Use `cp wrangler.toml.example wrangler.toml` and `npm run init -- --base-url <public-origin>` to patch the real D1 id and OAuth/MCP URLs locally before deploy.
- `/mcp` requests must include `Accept: application/json, text/event-stream` or the MCP SDK returns `406 Not Acceptable`.
- ChatGPT was manually verified end-to-end for the public `/mcp` connector path, OAuth authorization flow, and a `mempalace_status` tool call.
- Local browser OAuth on plain `http://127.0.0.1` / `localhost` requires a non-Secure CSRF cookie; this is already implemented and regression-tested.
- Local-only MemPalace tools are intentionally adapted; `mempalace_sync` remains an explicit unsupported response.
- If Vectorize metadata indexes are added after ingestion, run `npm run init` to ensure indexes, then use `npm run reindex -- --kind drawer|diary|all --base https://<domain> --token <token> [--dry-run]`.
- MCP tools now advertise `outputSchema`; future tool additions should keep output schemas and MCP-layer assertions in sync.
- `mempalace_wake_context` is now the memory startup router: use global mode only for curated `wing=global` profile/preferences/working-style drawers, and scoped mode with an explicit wing for project/topic context. `mempalace_status` should remain diagnostic/capability-oriented.
- Compact memory guidance should not nudge agents to prefix normal records with literal `AAAK:`; drawer and diary writes should be concise readable plain text unless the user explicitly asks for AAAK-formatted notes.
- KG interval integrity is enforced in app write paths: `kgAdd` and `kgInvalidate` share date-only-aware interval comparison, and invalidation preflights all matching tenant rows before mutation.
- Run `npm run eval:local` / `npm run eval:baseline` before and after retrieval, wake-context, or KG behavior changes. `npm run eval:remote` is opt-in and exits skipped unless `MEMHEAVEN_EVAL_BASE_URL` and `MEMHEAVEN_EVAL_BEARER_TOKEN` are set.
- Linear project `MemHeaven` had no remaining `Backlog`, `Todo`, `In Progress`, or `In Review` issues after the 2026-06-30 task-delivery pass.
- Catalog status as of 2026-06-30: official MCP Registry, mcpservers.org, mcp.so, and MCP Find list MemHeaven; punkpeye/awesome-mcp-servers PR #6361 remains open; MCP Market was not found; Glama was ambiguous from direct public scans despite the PR `has-glama` label.
- `.github/workflows/remote-smoke.yml` provides a manual remote smoke workflow. It uses `MEMHEAVEN_EVAL_BASE_URL`, `MEMHEAVEN_EVAL_BEARER_TOKEN`, and optional `MEMHEAVEN_EVAL_BEARER_TOKEN_B` GitHub secrets.
- `Dockerfile.glama` is an inspection-only stdio artifact: it reuses `createMcpServer` with sql.js migrations, in-memory content/vector stores, and deterministic local embeddings. Run `npm run smoke:glama` for the local process or `npm run smoke:glama -- docker memheaven-glama:smoke` after building the image.
- CI uses tracked `wrangler.ci.toml` for the Worker dry-run because the local `wrangler.toml` is intentionally gitignored; the CI config has the canonical `src/index.ts` entrypoint but no resource IDs or secrets.

## Discoverability campaign checkpoint — 2026-08-12

- The campaign remains `ACTIVE`; the fixed unauthenticated ten-query baseline is `0/10`. Do not call that failure or `EXHAUSTED` before the recorded 24-hour, 72-hour, and 7-day checks.
- PR #6 (`https://github.com/nazar256/memheaven/pull/6`) merged as `dbea72b9c758dfebef94b72f90ef68f18de60011`; CI and Pages succeeded, and the live site exposes the ChatGPT long-term-memory section, metadata, verification artifact, and sitemap.
- Discovery is confirmed on the Official MCP Registry, mcpservers.org, mcp.so, and Glama. mcp.so’s public listing is accurate, but its internal `memheaven` search is stale while known searches work; the no-cost support ticket requires an authenticated account, and paid submission is out of scope.
- TensorBlock’s index had no duplicate; factual intake issue #1703 is open at `https://github.com/TensorBlock/awesome-mcp-servers/issues/1703`, and its automation generated draft PR #1704 (`https://github.com/TensorBlock/awesome-mcp-servers/pull/1704`) with streamable-HTTP/OAuth and ChatGPT-compatible metadata. The draft is mergeable but maintainer-controlled. Upstream awesome-mcp-servers PR #11926 remains open and maintainer-controlled.
- Search Console is now verified for `https://nazar256.github.io/memheaven/`; the sitemap was submitted but initially reported `Could not read sitemap`, and URL Inspection reported `URL is not on Google` / `Unknown to Google`. One authenticated indexing request was accepted into Google's priority crawl queue. These are crawl/process signals, not evidence of indexing or ranking. The tracked campaign contract, exact query/checkpoint protocol, and sanitized ordered baseline are in [`docs/DISCOVERABILITY_CAMPAIGN.md`](docs/DISCOVERABILITY_CAMPAIGN.md) and [`docs/DISCOVERABILITY_BASELINE_2026-08-12.json`](docs/DISCOVERABILITY_BASELINE_2026-08-12.json); detailed private evidence remains under `.tmp/campaign/`.
- Official MCP Registry verification on 2026-08-13 found active latest `io.github.nazar256/memheaven` version `0.1.1` with `websiteUrl=https://nazar256.github.io/memheaven/`. The prior `0.1.0` record remains active but is no longer latest. This was an existing-record metadata correction through the official publisher, not a new directory submission.

## Open follow-ups

1. Rotate/remove any temporary smoke-test keys from the deployed Worker secret if configured deployment access is available.
2. Verify Claude hosted connector flow before upgrading it beyond Expected in docs.
3. Verify VS Code / Copilot hosted OAuth before adding any exact non-loopback callback.
4. Continue the discoverability campaign at the recorded 24-hour, 72-hour, and 7-day checkpoints; do not change the fixed query set or create duplicate catalog listings. Re-verify the Official MCP Registry’s version `0.1.1` record when monitoring propagation.

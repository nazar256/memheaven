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

## Open follow-ups

1. Rotate/remove any temporary smoke-test keys from the deployed Worker secret if configured deployment access is available.
2. Verify Claude hosted connector flow before upgrading it beyond Expected in docs.
3. Verify VS Code / Copilot hosted OAuth before adding any exact non-loopback callback.

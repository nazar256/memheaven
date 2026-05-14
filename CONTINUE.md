# Continue

Internal handoff summary for future maintenance sessions.

Public launch docs should treat `docs/PROJECT_STATE.md`, `README.md`, and `docs/LAUNCH.md` as the primary public-facing sources of truth.

## Current maintenance notes

- `wrangler.toml` should stay publish-safe in git. Use `npm run init -- --base-url <public-origin>` to patch the real D1 id and OAuth/MCP URLs locally before deploy.
- `/mcp` requests must include `Accept: application/json, text/event-stream` or the MCP SDK returns `406 Not Acceptable`.
- ChatGPT was manually verified end-to-end for the public `/mcp` connector path, OAuth authorization flow, and a `mempalace_status` tool call.
- Local browser OAuth on plain `http://127.0.0.1` / `localhost` requires a non-Secure CSRF cookie; this is already implemented and regression-tested.
- Local-only MemPalace tools are intentionally adapted; `mempalace_sync` remains an explicit unsupported response.
- If Vectorize metadata indexes are added after ingestion, use `npm run reindex -- --base https://<domain> --token <token> [--dry-run]`.
- MCP tools now advertise `outputSchema`; future tool additions should keep output schemas and MCP-layer assertions in sync.

## Open follow-ups

1. Add a real logo/social preview asset before broad public submission.
2. Verify Claude hosted connector flow before upgrading it beyond Expected in docs.

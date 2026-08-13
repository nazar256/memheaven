# MemHeaven Discoverability Campaign

Status: `ACTIVE`

This document is the tracked handoff for the non-branded discoverability campaign. Private evidence files may live under `.tmp/campaign/`, but a fresh checkout must be able to recover the campaign contract from this file.

## Objective

Improve the chance that people looking for durable, searchable memory for ChatGPT or remote AI agents can find MemHeaven. Do not declare success or exhaustion from a short indexing delay or a single ranking snapshot.

## Fixed query set

Do not silently change this set between checkpoints:

1. `ChatGPT long term memory server`
2. `self-hosted ChatGPT memory`
3. `persistent memory for ChatGPT`
4. `MCP memory server`
5. `self-hosted MCP memory`
6. `memory for AI agents`
7. `remote MCP memory`
8. `user-owned searchable AI memory`
9. `searchable memory for ChatGPT`
10. `Cloudflare ChatGPT memory MCP`

## Measurement contract

At each meaningful checkpoint, use unauthenticated public web search and retain a full ordered manifest of result URLs and titles for all ten queries, plus the exact timestamp, locale/method metadata, and first-ten presence count. The baseline on 2026-08-12 was `0/10` first-ten result sets; the short delayed recheck was also `0/10` and was not treated as exhaustion.

The current content patch was confirmed live at `2026-08-13T05:52:50Z` after PR #8 merged and Pages succeeded. Run the full manifest at approximately:

- `2026-08-14T05:52:50Z` (24 hours);
- `2026-08-16T05:52:50Z` (72 hours);
- `2026-08-20T05:52:50Z` (7 days).

Compare rank and presence against the retained baseline; do not replace the fixed queries with easier branded queries.

## Current evidence and work

- Merged PR [#8](https://github.com/nazar256/memheaven/pull/8) contains the intent-clarity landing-page/README changes, the explicit external-memory boundary, the factual footer, and regression coverage. The proposed project-site `robots.txt` was removed after review showed that a GitHub Pages project site cannot publish the file at the origin root where crawlers look for it.
- The sanitized ordered baseline manifest is tracked at [`docs/DISCOVERABILITY_BASELINE_2026-08-12.json`](DISCOVERABILITY_BASELINE_2026-08-12.json). It records the ten queries, exact timestamp, unauthenticated/public method, locale limitation, and all first-ten result titles/URLs.
- Search Console property `https://nazar256.github.io/memheaven/` is verified. At `2026-08-13T11:23Z`, URL Inspection reported `URL is in Google` / `Page indexed`; Googlebot Smartphone last crawled at `2026-08-13 07:27:35`, crawling and indexing were allowed, and the user-declared canonical was the Pages URL. The submitted sitemap row still reports `Could not read` / `0` discovered pages and URL Inspection says no matching sitemap was found; this is a separate sitemap-association issue, not evidence that the page is unindexable. Performance remains 0 clicks, 0 impressions, 0% CTR, average position 0, and no query rows for the available 11 Aug data. A fresh public fetch still returns HTTP 200 and valid XML for the sitemap, so no sitemap edit or duplicate submission is justified yet.
- The Official MCP Registry exact-version endpoint now has active/latest version `0.1.2` for `io.github.nazar256/memheaven`, titled `MemHeaven — Self-hosted Remote MCP Memory for ChatGPT` and pointing to the canonical Pages landing page. The prior `0.1.1` and `0.1.0` records remain historical active versions but are no longer latest. The branded `memheaven` search now returns all three versions, including `0.1.2`, but generic searches still omit the server (`memory`: 30 results; `ChatGPT`: 10; `self-hosted`: 1; `remote MCP`: 0). Treat generic search propagation as pending external cache/index work; do not publish another version merely to force refresh.
- TensorBlock’s existing factual intake issue #1703 has now produced draft catalog PR #1704. Its generated metadata identifies streamable HTTP, OAuth, ChatGPT-compatible remote clients, and the MIT license; the PR is mergeable but remains maintainer-controlled. This is propagation of an existing submission, not a new directory expansion.
- The repository already has major catalog/distribution coverage. New generic directory submissions are frozen unless a specific surface demonstrates meaningful authority, relevant discovery audience, or an important missing ecosystem presence. “Free” or “accepts submissions” alone is not sufficient.
- During indexing waits, prioritize fixed-query SERP/competitor analysis, intent/content/snippet/indexability improvements, Search Console evidence, and legitimate high-authority ecosystem references. Do not add product features automatically for this campaign.
- An unauthenticated public `site:nazar256.github.io/memheaven/` check at `2026-08-13T10:00Z` returned no results, but the later first-party URL Inspection at `2026-08-13T11:23Z` confirms the live URL is indexed. Keep those observations separate: a missing site-restricted result is weaker than provider URL Inspection, and neither is a ranking result. Run each scheduled 24-hour, 72-hour, and 7-day fixed-query manifest on time; record the observed 0/10 (or current count) and keep indexing state separate from the ranking outcome.
- The unpublished landing experiment in draft PR [#19](https://github.com/nazar256/memheaven/pull/19) remains held through the formal 7-day manifest at `2026-08-20T05:52:50Z`, so the scheduled 24-hour, 72-hour, and 7-day manifests continue to measure the live PR #8 content. If PR #19 is published before or after that point, record its exact deployment time and restart a complete 24-hour/72-hour/7-day schedule instead of mixing observations across deployed revisions.
- An adjacent-intent audit on 2026-08-13 found that pages ranking for “how to give ChatGPT persistent memory” and “self-hosted external memory for ChatGPT” lead with an explicit setup sequence, client reachability, and the boundary between built-in and external memory. The unpublished landing experiment in draft PR [#19](https://github.com/nazar256/memheaven/pull/19) now includes a concise three-step “How to give ChatGPT persistent external memory” section; the full implementation remains in the README. This is a measured content clarification, not a new feature or directory submission. Evidence: [Hindsight's ChatGPT integration](https://hindsight.vectorize.io/sdks/integrations/chatgpt) and [Memlord](https://memlord.com/).
- A second adjacent-intent audit at `2026-08-13T10:05Z` found that user-owned/searchable-memory pages make portability concrete through user-readable files or explicit export. [Basic Memory](https://basicmemory.com/) leads with plain Markdown files users own, while [Amber](https://ambermem.com/) makes JSON export a core promise. MemHeaven currently uses “portable” wording but exposes no dedicated import/export tool in the repository. Treat secure export/import as a future product recommendation for human prioritization; do not implement it as SEO work or strengthen the current portability claim without product evidence.
- A third adjacent-intent audit at `2026-08-13T10:43Z` found that category pages ranking for `MCP memory server` define the term through durable storage outside the current session, concrete write/read operations, and the local-versus-hosted trust boundary. [Mnemoverse's category explainer](https://mnemoverse.com/docs/library/memory-mcp) and [server comparison](https://mnemoverse.com/docs/library/memory-mcp-servers-compared) use that explanatory structure. The unpublished PR #19 landing experiment now adds one concise `What is an MCP memory server?` section that states those existing MemHeaven capabilities and its remote/self-hosted boundary. This is a factual semantic-coverage improvement; it does not add a product feature, create a thin page, or expand directory submissions.
- The same category-definition wording is now mirrored in the unpublished branch's high-authority `README.md`, with a regression assertion covering the landing page and README together. This keeps the repository surface and the eventual Pages surface semantically aligned without publishing a second thin page or changing the live checkpoint.
- A fourth adjacent-intent audit at `2026-08-13T11:12Z` found Cloudflare's official [Agent Memory documentation](https://developers.cloudflare.com/agent-memory/) prominent for AI-agent-memory searches. That is a separate private-beta product accessed through a Worker binding or HTTP API, while MemHeaven is open-source code deployed by the operator as an authenticated remote MCP server. Draft PR #19 now states this distinction in the README and a landing-page FAQ card, with regression coverage; this is factual disambiguation, not a new product feature or catalog submission.
- A post-index exploratory snapshot at `2026-08-13T11:25Z` ran the unchanged ten-query set through unauthenticated public web search. MemHeaven appeared at rank 10 for `ChatGPT long term memory server` via the existing mcpservers.org listing; the other nine queries had no MemHeaven result in the returned first ten. This is a preliminary 1/10 signal, not a formal checkpoint; preserve the scheduled 24-hour, 72-hour, and 7-day manifests for attribution.
- A fifth adjacent-intent audit at `2026-08-13T11:44Z` found that the indexed [MCP memory comparison article](https://blog.mcpservers.org/posts/mcp-memory-servers) explicitly distinguishes MCP memory from document RAG, while MemHeaven's category section did not. Draft PR #19 now adds one concise factual distinction in the landing page and README: RAG searches a pre-existing corpus, while MemHeaven preserves durable cross-session facts and decisions. This is semantic intent coverage, not a product-feature claim or a new directory submission.

## Next actions

1. PR #8 review, CI, merge, and Pages deployment are complete; use the recorded 24-hour, 72-hour, and 7-day checkpoints for the new measurement clock.
2. Recheck Search Console sitemap, URL indexing, and query-impression reports after its processing interval.
3. Run the three fixed-query manifests after deployment and retain their full ordered evidence.
4. Monitor existing upstream review queues, including TensorBlock PR #1704, and recheck Official MCP Registry search propagation for version `0.1.2`; do not create duplicate catalog records.

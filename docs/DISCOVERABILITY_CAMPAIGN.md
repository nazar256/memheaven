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
- Search Console property `https://nazar256.github.io/memheaven/` is verified. The sitemap was submitted and the authenticated sitemap detail still reported at `2026-08-13T09:54Z`: `Last read 13.08.26`, `Discovered pages 0`, and `Could not read sitemap`; the Pages report still says data is processing and to retry in one day. Performance currently shows 0 clicks, 0 impressions, 0% CTR, average position 0, and no query rows for the available 11 Aug data. URL Inspection previously reported `URL is not on Google` / `Unknown to Google`; one authenticated indexing request was accepted into Google's priority crawl queue. These are process signals, not evidence of indexing or ranking, and the provider-side status remains the source of truth even though independent HTTP/XML checks succeed.
- The Official MCP Registry exact-version endpoint now has active/latest version `0.1.2` for `io.github.nazar256/memheaven`, titled `MemHeaven — Self-hosted Remote MCP Memory for ChatGPT` and pointing to the canonical Pages landing page. The prior `0.1.1` and `0.1.0` records remain historical active versions but are no longer latest. The branded `memheaven` search now returns all three versions, including `0.1.2`, but generic searches still omit the server (`memory`: 30 results; `ChatGPT`: 10; `self-hosted`: 1; `remote MCP`: 0). Treat generic search propagation as pending external cache/index work; do not publish another version merely to force refresh.
- TensorBlock’s existing factual intake issue #1703 has now produced draft catalog PR #1704. Its generated metadata identifies streamable HTTP, OAuth, ChatGPT-compatible remote clients, and the MIT license; the PR is mergeable but remains maintainer-controlled. This is propagation of an existing submission, not a new directory expansion.
- The repository already has major catalog/distribution coverage. New generic directory submissions are frozen unless a specific surface demonstrates meaningful authority, relevant discovery audience, or an important missing ecosystem presence. “Free” or “accepts submissions” alone is not sufficient.
- During indexing waits, prioritize fixed-query SERP/competitor analysis, intent/content/snippet/indexability improvements, Search Console evidence, and legitimate high-authority ecosystem references. Do not add product features automatically for this campaign.
- An unauthenticated public `site:nazar256.github.io/memheaven/` check at `2026-08-13T10:00Z` returned no results. Combined with Search Console's zero discovered pages and processing state, this confirms that the Pages origin is not visibly indexed yet; it is not evidence that the current content experiment failed. Keep the formal ranking checkpoint delayed until the page has had a meaningful crawl window.
- An adjacent-intent audit on 2026-08-13 found that pages ranking for “how to give ChatGPT persistent memory” and “self-hosted external memory for ChatGPT” lead with an explicit setup sequence, client reachability, and the boundary between built-in and external memory. The unpublished landing experiment in draft PR [#19](https://github.com/nazar256/memheaven/pull/19) now includes a concise three-step “How to give ChatGPT persistent external memory” section; the full implementation remains in the README. This is a measured content clarification, not a new feature or directory submission. Evidence: [Hindsight's ChatGPT integration](https://hindsight.vectorize.io/sdks/integrations/chatgpt) and [Memlord](https://memlord.com/).

## Next actions

1. PR #8 review, CI, merge, and Pages deployment are complete; use the recorded 24-hour, 72-hour, and 7-day checkpoints for the new measurement clock.
2. Recheck Search Console sitemap, URL indexing, and query-impression reports after its processing interval.
3. Run the three fixed-query manifests after deployment and retain their full ordered evidence.
4. Monitor existing upstream review queues, including TensorBlock PR #1704, and recheck Official MCP Registry search propagation for version `0.1.2`; do not create duplicate catalog records.

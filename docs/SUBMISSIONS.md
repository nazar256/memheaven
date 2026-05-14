# MemHeaven Submissions

This file tracks public registry, catalog, and awesome-list submissions.

## Submission status

1. Official MCP Registry
   - URL: https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.nazar256/memheaven
   - Method: Official `mcp-publisher` CLI with GitHub token auth
   - Status: Published
   - Submission/PR: Direct publish via `mcp-publisher publish`
   - Notes: `mcp-publisher validate` passed and publish succeeded for `io.github.nazar256/memheaven` version `0.1.0`.
   - Follow-up: Consider updating `websiteUrl` in `server.json` from the GitHub repo URL to the GitHub Pages landing page in a future metadata polish pass.

2. Glama
   - URL: https://glama.ai/mcp
   - Method: Public site inspection; no submission completed
   - Status: Blocked
   - Submission/PR: None
   - Notes: GitHub login exists on Glama, but no public/add-server submission flow was discoverable from the public pages we could inspect. Existing candidate listing URLs for MemHeaven returned 404.
   - Follow-up: Revisit with full browser click automation or direct maintainer guidance once an authenticated add-server flow is visible.

3. punkpeye/awesome-mcp-servers
   - URL: https://github.com/punkpeye/awesome-mcp-servers
   - Method: Fork + branch + focused README PR
   - Status: PR opened
   - Submission/PR: https://github.com/punkpeye/awesome-mcp-servers/pull/6361
   - Notes: Added a single MemHeaven entry under Knowledge & Memory, matching repo style and keeping the description narrow.
   - Follow-up: Watch PR feedback/merge result and adjust wording if maintainers request a different category or shorter description.

4. awesome-remote-mcp-servers
   - URL: https://github.com/appcypher/awesome-remote-mcp-servers
   - Method: Repo check + contribution fit review
   - Status: Skipped
   - Submission/PR: None
   - Notes: The requested `appcypher/awesome-remote-mcp-servers` repo does not exist publicly. The public `appcypher/awesome-mcp-servers` repo exists, but its categories skew toward app/service integrations and note-taking rather than remote memory servers specifically. To avoid forcing a weak-fit submission, this wave skips it.
   - Follow-up: If a clearly relevant remote-MCP curated list is identified later, submit there instead.

5. mcp.so
   - URL: https://mcp.so/submit
   - Method: GitHub issue submission in `chatmcp/mcpso`
   - Status: Submitted
   - Submission/PR: https://github.com/chatmcp/mcpso/issues/2310
   - Notes: Used the issue-based submission pattern seen in recent submissions. Description kept factual and narrow about verified ChatGPT support.
   - Follow-up: Watch the issue for maintainer action or requests for more metadata.

6. mcpservers.org
   - URL: https://mcpservers.org/submit
   - Method: Public form inspection only
   - Status: Blocked
   - Submission/PR: None
   - Notes: The submit form requires Contact Email. Per publishing-wave rules, stop when email is required and no GitHub-login path exists.
   - Follow-up: Submit only if a GitHub-login/no-email path becomes available or if the maintainer explicitly approves using email.

## Reusable blurbs

Short:
Self-hosted remote MCP memory server for ChatGPT and AI agents.

Punchy:
Bring MemPalace-style long-term memory to ChatGPT and remote AI agents.

Long:
MemHeaven is an open-source, self-hosted remote MCP memory server that gives ChatGPT and AI agents durable long-term memory over Streamable HTTP. It is inspired by MemPalace, deploys on Cloudflare Workers, and is designed for users who want hosted AI clients without surrendering memory to a third-party SaaS.

Awesome-list snippet:
- [MemHeaven](https://github.com/nazar256/memheaven) - Self-hosted remote MCP memory server with Streamable HTTP, OAuth, and shared long-term memory for ChatGPT and AI agents.

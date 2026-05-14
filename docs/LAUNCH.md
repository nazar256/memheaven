# Launch checklist

This file tracks what should be in place before MemHeaven is promoted broadly.

## Repo readiness checklist

- [x] README first screen is clear, value-led, and has quick links
- [x] `docs/GETTING_STARTED_FROM_ZERO.md` exists and is beginner-friendly
- [x] `docs/CLIENT_COMPATIBILITY.md` is honest about confirmed vs expected vs unknown clients
- [x] `docs/AGENT_MEMORY_PROTOCOL.md` exists with copy-paste instructions
- [x] `SECURITY.md` and `docs/SECURITY.md` exist
- [x] `server.json` exists for MCP registry-style discovery
- [x] `glama.json` exists for Glama listing ownership
- [x] `site/index.html` exists as a lightweight landing-page scaffold
- [x] package metadata (`description`, `repository`, `homepage`, `keywords`) is present

## Metadata checklist

- [ ] GitHub repo description set
- [ ] GitHub topics set
- [ ] website URL set
- [ ] social preview image uploaded
- [ ] release notes / first release draft prepared

## Logo and social preview checklist

- [ ] Add `assets/memheaven-logo.svg` or `assets/memheaven-logo.png`
- [ ] Add a social preview image for GitHub
- [ ] Add icon assets if you want `server.json` to advertise icons

> TODO: no logo asset exists in the repo right now. Add one before registry/catalog polish that depends on branded visuals.

## Registry and catalog checklist

- [x] Official MCP Registry submission prep (`server.json`)
- [ ] Glama listing / claim (`glama.json`)
- [ ] [`punkpeye/awesome-mcp-servers`](https://github.com/punkpeye/awesome-mcp-servers)
- [ ] [`awesome-remote-mcp-servers`](https://github.com/appcypher/awesome-remote-mcp-servers) or equivalent curated remote list
- [ ] [Glama](https://glama.ai/mcp)
- [ ] mcpservers.org
- [ ] MCP Find
- [ ] Cloudflare Workers/community listings if useful

## Low-effort promotion plan

1. Update GitHub description, topics, and social preview
2. Publish `server.json` / `glama.json`
3. Submit to official registry/catalogs
4. Submit to awesome lists
5. Post in Cursor / Roo / Cline communities **only after** the client-compatibility docs are solid
6. Consider Show HN **only after** there is either a simple demo or truly dead-simple setup

## Agent-friendly submission pack

Use these blurbs when submitting to registries and lists.

### Short description

```text
Self-hosted remote MCP memory server for ChatGPT and AI agents.
```

### Punchy description

```text
Bring MemPalace-style long-term memory to ChatGPT and remote AI agents.
```

### Registry blurb

```text
MemHeaven is an open-source, self-hosted remote MCP memory server that gives ChatGPT and AI agents durable long-term memory over Streamable HTTP. It is MemPalace-inspired, deploys on Cloudflare Workers, and is designed for users who want hosted AI clients without surrendering memory to a third-party SaaS.
```

### Awesome-list snippet

```md
- [MemHeaven](https://github.com/nazar256/memheaven) - Self-hosted remote MCP memory server with Streamable HTTP, OAuth, and shared long-term memory for ChatGPT and AI agents.
```

## GitHub settings TODOs

Recommended GitHub description:

```text
Bring MemPalace-style long-term memory to ChatGPT and remote AI agents.
```

Recommended topics:

```text
mcp
mcp-server
model-context-protocol
chatgpt
claude
ai-agents
agent-memory
long-term-memory
self-hosted
cloudflare-workers
semantic-search
streamable-http
oauth2
pkce
typescript
```

Manual settings to check:

- [ ] repository description
- [ ] repository topics
- [ ] social preview image
- [ ] website URL
- [ ] Discussions enabled if desired
- [ ] issue templates if you want contributor-friendly triage

## Client and docs TODOs still worth verifying

- [ ] Verify a stable official OpenAI documentation URL for ChatGPT custom MCP / connector setup
- [ ] Validate `server.json` with the official MCP registry publisher before submission
- [ ] Run a real Claude hosted remote connector test after callback allowlist support is expanded
- [ ] Verify Cursor callback behavior against current public docs before marking it above Experimental
- [ ] Verify VS Code / Copilot hosted OAuth flow against a live deployment before marking it above Experimental

## Videos and demos

No YouTube video is required from the maintainer for launch.

Videos are nice community upside, not a launch prerequisite.

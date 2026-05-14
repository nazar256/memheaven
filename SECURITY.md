# Security

MemHeaven is a self-hosted remote MCP memory server intended for personal use, family, friends, and other small trusted groups.

- Security model and auth details: [`docs/SECURITY.md`](docs/SECURITY.md)
- Client callback and redirect guidance: [`docs/CLIENT_COMPATIBILITY.md`](docs/CLIENT_COMPATIBILITY.md)

## Supported versions

Security fixes should be assumed to land in the latest main branch and the most recent tagged release first.

## Reporting a vulnerability

If you believe you found a security issue:

1. Avoid posting exploit details, raw tokens, raw access keys, or private memory content publicly.
2. Prefer GitHub's private vulnerability reporting flow if it is enabled for this repository.
3. If private reporting is not available, open a minimal GitHub issue asking for a private contact path and omit sensitive details.

## Scope reminder

MemHeaven aims for strong tenant separation inside one deployment, but it is not positioned as enterprise-grade isolation or compliance infrastructure. Review the threat model and limitations in [`docs/SECURITY.md`](docs/SECURITY.md) before using it for anything beyond small trusted groups.

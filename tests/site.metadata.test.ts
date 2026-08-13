import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const siteRoot = fileURLToPath(new URL('../site/', import.meta.url));
const readSiteFile = (name: string) => readFileSync(`${siteRoot}${name}`, 'utf8');

const metaContent = (html: string, attribute: 'name' | 'property', value: string) => {
  const tag = html
    .match(new RegExp(`<meta\\s+[^>]*${attribute}="${value}"[^>]*>`, 'i'))?.[0];
  if (!tag) {
    throw new Error(`Missing ${attribute} metadata: ${value}`);
  }

  const content = tag.match(/content="([^"]*)"/i)?.[1];
  if (content === undefined) {
    throw new Error(`Missing content for ${attribute} metadata: ${value}`);
  }
  return content;
};

describe('static landing-page discovery metadata', () => {
  it('publishes canonical, social, and structured metadata for the live site', () => {
    const html = readSiteFile('index.html');
    const canonicalUrl = 'https://nazar256.github.io/memheaven/';
    const description =
      'Self-hosted remote MCP memory for ChatGPT and AI agents: searchable, user-owned long-term memory on Cloudflare.';
    const socialImage =
      'https://raw.githubusercontent.com/nazar256/memheaven/main/assets/memheaven-logo.png';

    const title = 'MemHeaven — Self-hosted remote MCP long-term memory for ChatGPT';
    expect(html).toContain(`<title>${title}</title>`);
    expect((html.match(/<link rel="canonical"\s/gi) ?? []).length).toBe(1);
    expect(html).toContain(`<link rel="canonical" href="${canonicalUrl}" />`);
    expect(metaContent(html, 'name', 'description')).toBe(description);
    expect(metaContent(html, 'name', 'google-site-verification')).toBe(
      '84_pyvmKnBGTeXubRi88EMmlgFPk7bUqRznCbj5jZ_U',
    );
    expect(metaContent(html, 'property', 'og:type')).toBe('website');
    expect(metaContent(html, 'property', 'og:url')).toBe(canonicalUrl);
    expect(metaContent(html, 'property', 'og:title')).toBe(title);
    expect(metaContent(html, 'property', 'og:description')).toBe(description);
    expect(metaContent(html, 'property', 'og:image')).toBe(socialImage);
    expect(metaContent(html, 'property', 'og:image:alt')).toBe('MemHeaven logo');
    expect(metaContent(html, 'name', 'twitter:card')).toBe('summary');
    expect(metaContent(html, 'name', 'twitter:title')).toBe(title);
    expect(metaContent(html, 'name', 'twitter:description')).toBe(description);
    expect(metaContent(html, 'name', 'twitter:image')).toBe(socialImage);

    const jsonLd = html.match(
      /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i,
    )?.[1];
    if (!jsonLd) {
      throw new Error('Missing JSON-LD metadata');
    }
    expect(JSON.parse(jsonLd)).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'MemHeaven',
      description,
      url: canonicalUrl,
      codeRepository: 'https://github.com/nazar256/memheaven',
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Cloudflare Workers',
      license: 'https://opensource.org/license/mit',
      keywords: ['ChatGPT memory', 'self-hosted memory', 'remote MCP memory', 'AI agent memory'],
    });
    expect(html).toContain('Self-hosted ChatGPT memory over remote MCP');
    expect(html).toContain('<h2>ChatGPT long-term memory, under your control</h2>');
    expect(html).toContain('<h1>Self-hosted remote MCP long-term memory for ChatGPT and AI agents</h1>');
    expect(html).toContain('<h2>Remote versus local MCP memory</h2>');
    expect(html).toContain('<h2>What is an MCP memory server?</h2>');
    expect(html).toContain('stores durable information outside the current chat');
    expect(html).toContain('write, search, update, and delete scoped records');
    expect(html).toContain('<h2>How to give ChatGPT persistent external memory</h2>');
    expect(html).toContain("In ChatGPT, add an MCP connector using your deployment's authenticated <code>/mcp</code> URL");
    expect(html).toContain('How does this give ChatGPT durable memory?');
    expect(html).toContain("MemHeaven is a separate, inspectable memory layer that you deploy and control.");
    expect(html).toContain('<h2>When MemHeaven fits</h2>');
    expect(html).toContain('<h2>External memory, not a replacement for ChatGPT memory</h2>');
    expect(html).toContain('There is no shared public MemHeaven instance.');
    expect(html).toContain('MemHeaven is open source.');
    expect(html).toContain('GitHub repository contains the source and deployment docs.');
    expect(html).not.toContain('Static landing-page scaffold for MemHeaven.');
    expect(html).toContain('https://github.com/nazar256/memheaven#chatgpt-setup');
  });

  it('publishes a canonical sitemap for the GitHub Pages site', () => {
    const canonicalUrl = 'https://nazar256.github.io/memheaven/';
    const sitemap = readSiteFile('sitemap.xml');

    expect(sitemap).toContain(
      '<?xml version="1.0" encoding="UTF-8"?>',
    );
    expect(sitemap).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect((sitemap.match(/<url>/g) ?? []).length).toBe(1);
    expect((sitemap.match(/<loc>/g) ?? []).length).toBe(1);
    expect(sitemap).toContain(`<loc>${canonicalUrl}</loc>`);
  });
});

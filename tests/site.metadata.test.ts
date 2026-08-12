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
      'Self-hosted remote MCP memory for ChatGPT and AI agents: searchable, user-controlled long-term memory on Cloudflare.';
    const socialImage =
      'https://raw.githubusercontent.com/nazar256/memheaven/main/assets/memheaven-logo.png';

    expect(html).toContain('<title>MemHeaven — Self-hosted long-term memory for ChatGPT and MCP</title>');
    expect((html.match(/<link rel="canonical"\s/gi) ?? []).length).toBe(1);
    expect(html).toContain(`<link rel="canonical" href="${canonicalUrl}" />`);
    expect(metaContent(html, 'name', 'description')).toBe(description);
    expect(metaContent(html, 'property', 'og:type')).toBe('website');
    expect(metaContent(html, 'property', 'og:url')).toBe(canonicalUrl);
    expect(metaContent(html, 'property', 'og:title')).toBe(
      'MemHeaven — Self-hosted long-term memory for ChatGPT and MCP',
    );
    expect(metaContent(html, 'property', 'og:description')).toBe(description);
    expect(metaContent(html, 'property', 'og:image')).toBe(socialImage);
    expect(metaContent(html, 'property', 'og:image:alt')).toBe('MemHeaven logo');
    expect(metaContent(html, 'name', 'twitter:card')).toBe('summary');
    expect(metaContent(html, 'name', 'twitter:title')).toBe(
      'MemHeaven — Self-hosted long-term memory for ChatGPT and MCP',
    );
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
  });

  it('publishes crawler entry points for the GitHub Pages site', () => {
    const canonicalUrl = 'https://nazar256.github.io/memheaven/';
    const sitemapUrl = `${canonicalUrl}sitemap.xml`;
    const robots = readSiteFile('robots.txt');
    const sitemap = readSiteFile('sitemap.xml');

    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain(`Sitemap: ${sitemapUrl}`);
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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const siteRoot = fileURLToPath(new URL('../site/', import.meta.url));
const readSiteFile = (name: string) => readFileSync(`${siteRoot}${name}`, 'utf8');

describe('static landing-page discovery metadata', () => {
  it('publishes canonical, social, and structured metadata for the live site', () => {
    const html = readSiteFile('index.html');

    expect(html).toContain('<title>MemHeaven — Self-hosted long-term memory for ChatGPT and MCP</title>');
    expect(html).toContain('<link rel="canonical" href="https://nazar256.github.io/memheaven/" />');
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type": "SoftwareSourceCode"');
    expect(html).toContain('Self-hosted ChatGPT memory over remote MCP');
  });

  it('publishes crawler entry points for the GitHub Pages site', () => {
    expect(readSiteFile('robots.txt')).toContain('Sitemap: https://nazar256.github.io/memheaven/sitemap.xml');
    expect(readSiteFile('sitemap.xml')).toContain('<loc>https://nazar256.github.io/memheaven/</loc>');
  });
});

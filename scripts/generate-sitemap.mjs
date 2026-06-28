import { execFileSync, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = 'https://lumidermaesthetics.com';
const output = resolve('lumi-derm-website/sitemap.xml');
const routes = [
  { url: '/', file: 'lumi-derm-website/index.html', image: true },
  { url: '/pages/services.html', file: 'lumi-derm-website/pages/services.html' },
  { url: '/pages/booking.html', file: 'lumi-derm-website/pages/booking.html' },
  { url: '/pages/gallery.html', file: 'lumi-derm-website/pages/gallery.html' },
  { url: '/pages/about.html', file: 'lumi-derm-website/pages/about.html' },
  { url: '/pages/contact.html', file: 'lumi-derm-website/pages/contact.html' },
  { url: '/pages/policies.html', file: 'lumi-derm-website/pages/policies.html' },
  { url: '/pages/privacy.html', file: 'lumi-derm-website/pages/privacy.html' },
  { url: '/pages/terms.html', file: 'lumi-derm-website/pages/terms.html' },
  { url: '/pages/cookies.html', file: 'lumi-derm-website/pages/cookies.html' },
];

function lastModified(file) {
  const status = spawnSync('git', ['status', '--porcelain', '--', file], { encoding: 'utf8' });
  if (status.stdout.trim()) return new Date().toISOString().slice(0, 10);
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

const entries = routes.map(({ url, file, image }) => {
  const lastmod = lastModified(file);
  const imageXml = image
    ? `\n    <image:image>\n      <image:loc>${origin}/assets/icons/lumi-derm-logo.png</image:loc>\n      <image:title>Lumi Derm Aesthetics logo</image:title>\n    </image:image>`
    : '';
  return `  <url>\n    <loc>${origin}${url}</loc>${
    lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
  }${imageXml}\n  </url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>
`;

await writeFile(output, xml);
console.log(`Generated ${routes.length} canonical sitemap entries.`);

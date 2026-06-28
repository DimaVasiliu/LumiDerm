import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ORIGIN = 'https://lumidermaesthetics.com';
const SKIPPED_SCHEMES = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function decodeAttribute(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#38;', '&');
}

function attributesFrom(tag) {
  const attributes = new Map();
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

async function existingTarget(candidate) {
  const attempts = extname(candidate)
    ? [candidate]
    : [candidate, `${candidate}.html`, resolve(candidate, 'index.html')];
  for (const attempt of attempts) {
    try {
      if ((await stat(attempt)).isFile()) return attempt;
    } catch {
      // Try the next valid static-file form.
    }
  }
  return null;
}

function issue(code, file, message) {
  return { code, file, message };
}

export async function auditSite({ siteRoot, canonicalOrigin = DEFAULT_ORIGIN }) {
  const root = resolve(siteRoot);
  const files = await walk(root);
  const htmlFiles = files.filter((file) => extname(file).toLowerCase() === '.html');
  const issues = [];
  const idsByFile = new Map();
  const metadataByFile = new Map();

  for (const file of htmlFiles) {
    const source = await readFile(file, 'utf8');
    const displayFile = relative(root, file) || 'index.html';
    const ids = new Set();
    const duplicates = new Set();

    for (const tagMatch of source.matchAll(/<[a-z][^>]*>/gi)) {
      const tag = tagMatch[0];
      const name = /^<([a-z][\w:-]*)/i.exec(tag)?.[1].toLowerCase();
      const attributes = attributesFrom(tag);
      const id = attributes.get('id');
      if (id) {
        if (ids.has(id)) duplicates.add(id);
        ids.add(id);
      }
      if (name === 'img' && !attributes.has('alt')) {
        issues.push(
          issue('IMAGE_ALT_MISSING', displayFile, `Image is missing alt: ${tag.slice(0, 120)}`),
        );
      }
    }

    idsByFile.set(file, ids);
    const canonical = /<link\b[^>]*\brel=["']canonical["'][^>]*>/i.exec(source)?.[0];
    const canonicalHref = canonical ? attributesFrom(canonical).get('href') : undefined;
    const refresh = /<meta\b[^>]*\bhttp-equiv=["']refresh["'][^>]*>/i.test(source);
    const robotsTag = /<meta\b[^>]*\bname=["']robots["'][^>]*>/i.exec(source)?.[0];
    const robots = robotsTag ? attributesFrom(robotsTag).get('content') || '' : '';
    metadataByFile.set(file, {
      canonicalHref,
      noindex: /(?:^|,)\s*noindex\b/i.test(robots),
      refresh,
    });
    for (const id of duplicates) {
      issues.push(issue('DUPLICATE_ID', displayFile, `Duplicate id="${id}"`));
    }

    const h1Count = [...source.matchAll(/<h1\b/gi)].length;
    if (h1Count !== 1) {
      issues.push(issue('H1_COUNT', displayFile, `Expected exactly one h1; found ${h1Count}`));
    }
  }

  for (const file of htmlFiles) {
    const source = await readFile(file, 'utf8');
    const displayFile = relative(root, file) || 'index.html';

    for (const tagMatch of source.matchAll(/<[a-z][^>]*>/gi)) {
      const attributes = attributesFrom(tagMatch[0]);
      for (const attributeName of ['href', 'src']) {
        if (!attributes.has(attributeName)) continue;
        const original = decodeAttribute(attributes.get(attributeName).trim());
        if (!original || SKIPPED_SCHEMES.test(original)) continue;
        if (original.startsWith('#')) {
          const fragment = original.slice(1);
          if (fragment && !idsByFile.get(file)?.has(fragment)) {
            issues.push(
              issue(
                'FRAGMENT_MISSING',
                displayFile,
                `${attributeName}="${original}" points to a missing id`,
              ),
            );
          }
          continue;
        }

        const [pathAndQuery, fragment] = original.split('#', 2);
        const path = pathAndQuery.split('?', 1)[0];
        let decodedPath;
        try {
          decodedPath = decodeURIComponent(path);
        } catch {
          issues.push(
            issue(
              'INVALID_LOCAL_URL',
              displayFile,
              `${attributeName}="${original}" is not valid URL encoding`,
            ),
          );
          continue;
        }

        const candidate = decodedPath.startsWith('/')
          ? resolve(root, `.${decodedPath}`)
          : resolve(dirname(file), decodedPath || '.');
        if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
          issues.push(
            issue(
              'LOCAL_TARGET_OUTSIDE_ROOT',
              displayFile,
              `${attributeName}="${original}" leaves the site root`,
            ),
          );
          continue;
        }

        const target = await existingTarget(candidate);
        if (!target) {
          issues.push(
            issue(
              'LOCAL_TARGET_MISSING',
              displayFile,
              `${attributeName}="${original}" does not exist`,
            ),
          );
          continue;
        }

        if (attributeName === 'href' && fragment && extname(target).toLowerCase() === '.html') {
          const targetIds = idsByFile.get(target);
          if (targetIds && !targetIds.has(fragment)) {
            issues.push(
              issue(
                'FRAGMENT_MISSING',
                displayFile,
                `${attributeName}="${original}" points to a missing id`,
              ),
            );
          }
        }
      }
    }
  }

  const sitemap = resolve(root, 'sitemap.xml');
  try {
    const source = await readFile(sitemap, 'utf8');
    const seen = new Set();
    for (const match of source.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
      const loc = /<loc>\s*([^<]+?)\s*<\/loc>/i.exec(match[1]);
      if (!loc) {
        issues.push(issue('SITEMAP_URL_INVALID', 'sitemap.xml', 'A url entry has no loc element'));
        continue;
      }
      const raw = decodeAttribute(loc[1]);
      let url;
      try {
        url = new URL(raw);
      } catch {
        issues.push(issue('SITEMAP_URL_INVALID', 'sitemap.xml', `Invalid URL: ${raw}`));
        continue;
      }
      if (url.origin !== canonicalOrigin || url.protocol !== 'https:' || url.search || url.hash) {
        issues.push(issue('SITEMAP_URL_INVALID', 'sitemap.xml', `Non-canonical URL: ${raw}`));
      }
      if (seen.has(url.href))
        issues.push(issue('SITEMAP_URL_DUPLICATE', 'sitemap.xml', `Duplicate URL: ${raw}`));
      seen.add(url.href);
      const candidate = url.pathname.endsWith('/')
        ? resolve(root, `.${url.pathname}`, 'index.html')
        : resolve(root, `.${url.pathname}`);
      const target = await existingTarget(candidate);
      if (!target) {
        issues.push(
          issue('SITEMAP_TARGET_MISSING', 'sitemap.xml', `URL has no local page: ${raw}`),
        );
        continue;
      }
      const metadata = metadataByFile.get(target);
      if (metadata?.refresh) {
        issues.push(
          issue('SITEMAP_REDIRECT', 'sitemap.xml', `URL points to a meta-refresh page: ${raw}`),
        );
      }
      if (metadata?.noindex) {
        issues.push(
          issue('SITEMAP_NOINDEX', 'sitemap.xml', `URL points to a noindex page: ${raw}`),
        );
      }
      if (metadata?.canonicalHref) {
        try {
          const canonicalUrl = new URL(metadata.canonicalHref, raw);
          if (canonicalUrl.href !== url.href) {
            issues.push(
              issue(
                'SITEMAP_CANONICAL_MISMATCH',
                'sitemap.xml',
                `URL disagrees with page canonical (${canonicalUrl.href}): ${raw}`,
              ),
            );
          }
        } catch {
          issues.push(
            issue(
              'SITEMAP_CANONICAL_MISMATCH',
              'sitemap.xml',
              `Page has invalid canonical: ${raw}`,
            ),
          );
        }
      }
    }
  } catch {
    issues.push(issue('SITEMAP_MISSING', 'sitemap.xml', 'sitemap.xml does not exist'));
  }

  return { htmlFileCount: htmlFiles.length, issues };
}

async function main() {
  const siteRoot = process.argv[2] || 'lumi-derm-website';
  const result = await auditSite({ siteRoot });
  if (result.issues.length === 0) {
    console.log(`Site integrity: PASS (${result.htmlFileCount} HTML files)`);
    return;
  }

  console.error(
    `Site integrity: FAIL (${result.issues.length} issues across ${result.htmlFileCount} HTML files)`,
  );
  for (const item of result.issues) console.error(`- [${item.code}] ${item.file}: ${item.message}`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

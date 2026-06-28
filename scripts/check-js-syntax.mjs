import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['scripts', 'test', 'lumi-derm-website/js', 'lumi-derm-website/admin'];
const extensions = new Set(['.js', '.mjs', '.cjs']);

async function collectFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(child)));
    else if (extensions.has(extname(entry.name))) files.push(child);
  }
  return files;
}

const files = (await Promise.all(roots.map(collectFiles))).flat().sort();
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failed) process.exitCode = 1;
else console.log(`JavaScript syntax: PASS (${files.length} files)`);

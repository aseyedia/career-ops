#!/usr/bin/env node
// Custom addition (not part of upstream career-ops) -- copies a curated set
// of review-worthy markdown docs into the user's Obsidian vault. Real copies,
// not symlinks: Obsidian's indexer chokes on symlinked vaults and the repo
// has far more files (data/pipeline.md, batch/, output/) than anyone wants
// mirrored into a vault. See modes/_custom.md "Obsidian Sync" for the rule
// that tells the agent to run this.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.dirname(new URL(import.meta.url).pathname);
const VAULT_TARGET = path.join(
  os.homedir(),
  'media-center/obsidian/arta-vault/Job Hunt 2026/career-ops',
);

// Curated set only -- do NOT add scan-history.tsv, batch/, or output/ here.
// Those are working files, not review docs, and are exactly the "millions
// of little files" the vault shouldn't have to index.
const TARGETS = [
  { srcDir: 'reports', pattern: /\.md$/, destDir: 'reports' },
  { src: 'data/applications.md', dest: 'applications-tracker.md' },
  { src: 'article-digest.md', dest: 'article-digest.md' },
  { src: 'data/pipeline.md', dest: 'scan-results.md' },
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  if (!fs.existsSync(path.dirname(VAULT_TARGET))) {
    console.error(`Vault folder not found: ${path.dirname(VAULT_TARGET)}`);
    process.exit(1);
  }
  fs.mkdirSync(VAULT_TARGET, { recursive: true });

  let copied = 0;
  const log = [];

  for (const t of TARGETS) {
    if (t.srcDir) {
      const dir = path.join(REPO_ROOT, t.srcDir);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!t.pattern.test(name)) continue;
        copyFile(path.join(dir, name), path.join(VAULT_TARGET, t.destDir, name));
        copied++;
      }
      log.push(`${t.srcDir}/*.md -> career-ops/${t.destDir}/`);
    } else {
      const src = path.join(REPO_ROOT, t.src);
      if (!fs.existsSync(src)) continue;
      copyFile(src, path.join(VAULT_TARGET, t.dest));
      copied++;
      log.push(`${t.src} -> career-ops/${t.dest}`);
    }
  }

  console.log(`Synced ${copied} file(s) to ${VAULT_TARGET}`);
  log.forEach((l) => console.log(`  ${l}`));
}

main();

#!/usr/bin/env node
// Custom addition (not part of upstream career-ops) -- two-way sync between
// a curated set of review-worthy markdown docs and the user's Obsidian vault.
// Real copies, not symlinks: Obsidian's indexer chokes on symlinked vaults and
// the repo has far more files (batch/, output/) than anyone wants mirrored
// into a vault. See modes/_custom.md "Obsidian Sync" for the rule that tells
// the agent to run this.
//
// Sync direction per target:
//   - bidirectional: true  -> whichever side changed since the last sync wins;
//     if BOTH sides changed, the repo wins and the vault copy is preserved as
//     a .conflict-<timestamp>.md sidecar so nothing is silently lost.
//   - bidirectional: false -> repo always wins (one-way, repo -> vault). Used
//     for files with a canonical script-managed write path (the applications
//     tracker is only ever updated via set-status.mjs / merge-tracker.mjs --
//     see AGENTS.md "Pipeline Integrity" -- so a stray Obsidian hand-edit must
//     never flow back and race a locked, atomic write).
//
// State (last-synced mtimes per file) lives in .obsidian-sync-state.json,
// gitignored -- it's sync bookkeeping, not data.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.dirname(new URL(import.meta.url).pathname);
const VAULT_TARGET = path.join(
  os.homedir(),
  'media-center/obsidian/arta-vault/Job Hunt 2026/career-ops',
);
const STATE_FILE = path.join(REPO_ROOT, '.obsidian-sync-state.json');

// Curated set only -- do NOT add scan-history.tsv, batch/, or output/ here.
// Those are working files, not review docs, and are exactly the "millions
// of little files" the vault shouldn't have to index.
const TARGETS = [
  { srcDir: 'reports', pattern: /\.md$/, destDir: 'reports', bidirectional: true },
  { src: 'data/applications.md', dest: 'applications-tracker.md', bidirectional: false },
  { src: 'article-digest.md', dest: 'article-digest.md', bidirectional: true },
  { src: 'data/pipeline.md', dest: 'scan-results.md', bidirectional: true },
];

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function mtime(p) {
  return fs.existsSync(p) ? fs.statSync(p).mtimeMs : null;
}

// Reconcile one src<->dest pair. Mutates `state`. Returns a log line or null.
function reconcile(src, dest, key, bidirectional, state) {
  const srcExists = fs.existsSync(src);
  const destExists = fs.existsSync(dest);
  if (!srcExists && !destExists) return null;

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (!bidirectional) {
    if (!srcExists) return null; // repo file gone -- nothing to push
    const last = state[key];
    if (last && last.src === mtime(src)) return null; // unchanged since last sync
    fs.copyFileSync(src, dest);
    state[key] = { src: mtime(src), dest: mtime(dest) };
    return `repo -> vault: ${key}`;
  }

  if (srcExists && !destExists) {
    fs.copyFileSync(src, dest);
    state[key] = { src: mtime(src), dest: mtime(dest) };
    return `repo -> vault (new): ${key}`;
  }
  if (destExists && !srcExists) {
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.copyFileSync(dest, src);
    state[key] = { src: mtime(src), dest: mtime(dest) };
    return `vault -> repo (new): ${key}`;
  }

  // Both exist -- compare against last known state to see which side moved.
  const last = state[key];
  const srcM = mtime(src);
  const destM = mtime(dest);
  const srcChanged = !last || last.src == null || srcM > last.src;
  const destChanged = !last || last.dest == null || destM > last.dest;

  if (srcChanged && destChanged) {
    const conflictPath = dest.replace(/(\.md)$/, `.conflict-${Date.now()}$1`);
    fs.copyFileSync(dest, conflictPath);
    fs.copyFileSync(src, dest);
    state[key] = { src: srcM, dest: mtime(dest) };
    return `CONFLICT, repo won (vault backed up to ${path.basename(conflictPath)}): ${key}`;
  }
  if (srcChanged) {
    fs.copyFileSync(src, dest);
    state[key] = { src: srcM, dest: mtime(dest) };
    return `repo -> vault: ${key}`;
  }
  if (destChanged) {
    fs.copyFileSync(dest, src);
    state[key] = { src: mtime(src), dest: destM };
    return `vault -> repo: ${key}`;
  }
  state[key] = { src: srcM, dest: destM }; // keep bookkeeping fresh
  return null;
}

function main() {
  if (!fs.existsSync(path.dirname(VAULT_TARGET))) {
    console.error(`Vault folder not found: ${path.dirname(VAULT_TARGET)}`);
    process.exit(1);
  }
  fs.mkdirSync(VAULT_TARGET, { recursive: true });

  const state = loadState();
  const log = [];

  for (const t of TARGETS) {
    if (t.srcDir) {
      const dir = path.join(REPO_ROOT, t.srcDir);
      const destDir = path.join(VAULT_TARGET, t.destDir);
      const names = new Set();
      if (fs.existsSync(dir)) {
        for (const n of fs.readdirSync(dir)) if (t.pattern.test(n)) names.add(n);
      }
      if (fs.existsSync(destDir)) {
        for (const n of fs.readdirSync(destDir)) if (t.pattern.test(n)) names.add(n);
      }
      for (const name of names) {
        const src = path.join(dir, name);
        const dest = path.join(destDir, name);
        const result = reconcile(src, dest, `${t.srcDir}/${name}`, t.bidirectional, state);
        if (result) log.push(result);
      }
    } else {
      const src = path.join(REPO_ROOT, t.src);
      const dest = path.join(VAULT_TARGET, t.dest);
      const result = reconcile(src, dest, t.src, t.bidirectional, state);
      if (result) log.push(result);
    }
  }

  saveState(state);

  if (log.length === 0) {
    console.log('Already in sync -- nothing to do.');
  } else {
    console.log(`Synced ${log.length} change(s):`);
    log.forEach((l) => console.log(`  ${l}`));
  }
}

main();

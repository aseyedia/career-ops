#!/usr/bin/env node
// Custom addition (not part of upstream career-ops) -- regenerates a
// filtered, action-only view of data/applications.md: rows where the user
// actually applied (Applied and beyond), dropping the PDF column and
// re-ranking by how much attention the stage deserves. Synced one-way
// (repo -> vault) via sync-obsidian.mjs. Never hand-edit the output file --
// it's fully regenerated from the tracker every run. See modes/_custom.md
// "Obsidian Sync" for the rule that tells the agent to run this.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.dirname(new URL(import.meta.url).pathname);
const TRACKER = path.join(REPO_ROOT, 'data/applications.md');
const OUT_FILE = path.join(REPO_ROOT, 'output/applied-dashboard.md');

// Only statuses that mean "I did something," ranked by how much attention
// they deserve right now -- an open Offer beats a week-old Applied.
const STAGE_PRIORITY = { Offer: 0, Interview: 1, Responded: 2, Applied: 3, Rejected: 4 };

function parseTracker() {
  const lines = fs.readFileSync(TRACKER, 'utf8').split('\n');
  const headerIdx = lines.findIndex((l) => l.trim().startsWith('| #'));
  if (headerIdx === -1) return [];
  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 9) continue;
    const [num, date, company, role, score, status, , report, notes] = cells;
    // Tracker links are written relative to data/ ("../reports/x.md"); the
    // dashboard lands at the vault root next to reports/, so strip the "../".
    rows.push({ num, date, company, role, score, status, report: report.replace('](../', ']('), notes });
  }
  return rows;
}

function main() {
  const rows = parseTracker().filter((r) => r.status in STAGE_PRIORITY);
  rows.sort((a, b) => {
    const p = STAGE_PRIORITY[a.status] - STAGE_PRIORITY[b.status];
    return p !== 0 ? p : b.date.localeCompare(a.date); // newest first within a stage
  });

  const lines = [
    '# Applied Dashboard',
    '',
    "_Auto-generated from `data/applications.md` — only rows you actually took action on (Applied and beyond), ranked by stage. Edits here don't persist; update the source tracker via `set-status.mjs` instead._",
    '',
    '| # | Date | Company | Role | Score | Status | Report | Notes |',
    '|---|------|---------|------|-------|--------|--------|-------|',
    ...rows.map(
      (r) => `| ${r.num} | ${r.date} | ${r.company} | ${r.role} | ${r.score} | ${r.status} | ${r.report} | ${r.notes} |`,
    ),
    '',
  ];

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`Wrote ${rows.length} row(s) to ${path.relative(REPO_ROOT, OUT_FILE)}`);
}

main();

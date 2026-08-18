# What's different in this fork

This is a fork of [santifer/career-ops](https://github.com/santifer/career-ops),
kept in sync with upstream via `update-system.mjs` (`career-ops update` /
`node update-system.mjs check|apply`). That auto-sync means the vast majority of
this codebase — every mode, the scoring logic, the CV/cover-letter templates, the
provider scanners, the docs you're reading right now — **is** upstream career-ops,
pulled in release by release. Nothing below duplicates what upstream already does;
it's the small set of things this checkout added on top.

If you're setting up your own copy: fork [santifer/career-ops](https://github.com/santifer/career-ops)
directly (not this fork of it), run the onboarding in `AGENTS.md` / `doctor.mjs`,
then layer in whichever pieces below are useful to you. They're plain files at the
repo root — copy the ones you want, skip the rest.

## Additions

- **`generate-cover-letter-docx.py`** — renders the same cover-letter payload JSON
  that `generate-cover-letter.mjs` turns into a PDF, but as an editable `.docx`
  instead. Mirrors the PDF template section-for-section (name/contact block,
  achievements list, letterhead image or a real employer `.docx` template as the
  base, footnotes) so the two outputs stay visually in sync. Useful when a
  recipient wants a Word file, or when you want to hand-tweak a letter after
  generation without re-running the pipeline.

- **`applied-dashboard.mjs`** — regenerates `output/applied-dashboard.md`: a
  filtered view of `data/applications.md` containing only rows you actually took
  action on (`Applied` and beyond), re-ranked by how much attention the stage
  deserves (`Offer` first, `Rejected` last) rather than by date. The full tracker
  stays the source of truth; this is a read-only, fully-regenerated-every-run
  companion view for a faster "what needs me right now" glance.

- **`send-daily-report.mjs` + `cron-daily-scan.sh` + `cron-update-check.sh` +
  `daily-scan-prompt.md`** — an unattended daily scan-evaluate-email pipeline, and
  a self-updating cron job alongside it. See
  [`AUTOMATION.md` §3](AUTOMATION.md#3-full-unattended-pipeline--email-digest) for
  the full writeup, including why this is the piece that benefits from an
  always-on machine rather than a laptop.

- **`sync-obsidian.mjs` extensions** — the upstream script mirrors `reports/`,
  `data/applications.md`, `article-digest.md`, and `data/pipeline.md` into an
  Obsidian vault. This fork adds: recursive sync of `interview-prep/` (picking up
  per-company prep docs one level down, while still excluding `sessions/`, which
  holds real interviewer transcripts and stays local-only); a synced view of
  `output/applied-dashboard.md`; and routing of generated CV/cover-letter PDFs
  (plus their `.docx` twins) into `pdfs/cvs/` and `pdfs/cover-letters/{slug}/`
  instead of leaving them in `output/` for a manual `SendUserFile` each time.

- **Two small upstream-worthy fixes** that surfaced while building the above, and
  are general career-ops bugs rather than fork-specific customization — worth
  upstreaming as a PR to `santifer/career-ops` rather than carrying indefinitely as
  local diffs:
  - `generate-cover-letter.mjs` silently ignored `payload.letterhead` — the PDF
    renderer never applied header/footer images that the DOCX renderer already
    supported (#2044 on upstream). Fixed by teaching the PDF path the same
    `data:`-URI image embedding the DOCX path already used.
  - `providers/_http.mjs`'s `fetchJsonWithRetry` only handled JSON responses.
    Providers that parse HTML (not JSON) had no shared retry/backoff path, so a
    transient 429/5xx mid-sweep aborted the whole run for them. Added
    `fetchTextWithRetry` alongside it, sharing the same retry loop.

## Onboarding a coworker onto this fork specifically

1. `gh repo fork aseyedia/career-ops --clone` (or fork via the GitHub UI).
2. Run the standard onboarding — `node doctor.mjs --json`, then follow `AGENTS.md`'s
   "First Run" steps for `cv.md` / `config/profile.yml` / `portals.yml`. Personal
   data never comes from this fork; every user-layer file is gitignored (see
   `DATA_CONTRACT.md`) and you fill it in fresh.
3. Optional: wire up the daily automation from `AUTOMATION.md` §3. You'll need your
   own SMTP relay credentials (Resend, SES, a Gmail app password — anything
   `nodemailer` can talk to) and, if you want it running while your laptop is
   closed, somewhere always-on to host it.

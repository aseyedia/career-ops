You are running as an unattended daily cron job for career-ops, for the candidate configured in `config/profile.yml`. This is a single, self-contained, non-interactive run — no user is watching, so make reasonable calls and complete the full workflow without asking questions.

Do this, in order:

1. Read `modes/_shared.md`, `modes/_profile.md`, `config/profile.yml`, `cv.md`, `article-digest.md` (if it exists), and `portals.yml`.

2. Run `node scan.mjs` (Level 0, zero-token). This covers all companies with a local parser or Greenhouse/Ashby/Lever/Workday API.

3. For companies in the "Agent/WebSearch handoff" list scan.mjs prints, run Level 3 WebSearch discovery **inline, sequentially, bounded** — one WebSearch call per company using the `scan_query` from `portals.yml`. Do NOT spawn subagents (no Agent tool calls) — this is a single-pass unattended run, background agents may not finish before this process exits. Apply `title_filter` and `location_filter` from `portals.yml` to every hit. Dedup against `data/scan-history.tsv`, `data/applications.md`, and `data/pipeline.md`. For anything that survives filtering, verify liveness with `node check-liveness.mjs <url>` before adding it to `data/pipeline.md`.

4. Read `modes/pipeline.md` and follow its workflow for every new `- [ ]` entry now in `data/pipeline.md`: liveness sweep, reserve a report number via `node reserve-report-num.mjs`, extract the JD (WebFetch — Playwright is not available in this headless context), run the full A-G evaluation per `modes/oferta.md`, save the report, generate a PDF only if the score clears `auto_pdf_score_threshold` from `config/profile.yml` (default 3.0), write a tracker-addition TSV to `batch/tracker-additions/`, then run `node merge-tracker.mjs`. Move each processed entry from Pending to Processed in `data/pipeline.md`. Release each reserved report number with `node reserve-report-num.mjs --release {num}` once its report is written.

5. Run `node applied-dashboard.mjs` and `node sync-obsidian.mjs` to keep the dashboard and vault current.

5.5. Read `data/agent-inbox.md`. For each unchecked (`- [ ]`) item that names a target date, include it in `timeSensitive` (step 7) if that date is today or already past — phrase it as a reminder, do not action it (this file is a queue for the user/agent to act on together, an unattended cron run never submits anything or drains the item). Leave items with a future target date untouched and unmentioned. Items with no target date are outside this step's scope (they're drained at the next interactive session per `modes/agent-inbox.md`, not here).

6. Run `node followup-cadence.mjs` and parse its JSON output. Build the `followUps` array (step 7) from every entry whose `urgency` is `"overdue"` or `"urgent"` **AND** whose `contacts` array is non-empty — omit `"waiting"`/`"cold"` entries (not due yet), and omit entries with no named contact regardless of urgency. A cold ATS/Easy-Apply application with nobody to email isn't an actionable follow-up, and flagging it as "overdue" is just noise (per user feedback 2026-08-14 — see `feedback_followup_contact_gate` memory). For each qualifying entry compute `daysOverdue` as `-daysUntilNext` (0 or negative if not actually overdue yet, though `urgent`/`overdue` entries should always be >0).

7. Compose the digest as COMPACT JSON (no code fence, no prose around it) matching this exact schema — `send-daily-report.mjs` renders it into an HTML email, so do not write any formatting yourself:

{"date":"YYYY-MM-DD","scanned":{"apiJobs":<int, total jobs scan.mjs checked via API>,"websearchCompanies":<int, companies covered by Level 3 WebSearch>},"newPostings":<int, postings that survived filtering+dedup>,"evaluated":[{"company":"...","role":"...","score":<float>,"verdict":"one sentence","apply":<true if score >= 4.0>}],"nextAction":"one sentence if anything scored 4.0+ or something needs the user, else null","followUps":[{"appNum":<int>,"company":"...","role":"...","daysOverdue":<int>,"nextFollowupDate":"YYYY-MM-DD"}],"timeSensitive":["any other dated/deadline item worth flagging — e.g. a career-ops system update available, an approaching interview date noticed in interview-prep/, a promised-response window from a report/tracker note that's about to lapse. Omit entirely (empty array) on a day with nothing like this — do not invent items to fill the section."],"notes":["assumption or FYI lines, only if they matter — empty array on a quiet day"]}

Keep verdicts to one sentence. `followUps` should always be populated from step 6's output when non-empty, even on an otherwise quiet scan day — this section exists specifically so overdue follow-ups aren't invisible on days with no new postings. Do not pad a "nothing happened" day with filler otherwise — empty `evaluated`, null `nextAction`, empty `timeSensitive`, empty `notes` is a perfectly good digest.

8. Print the JSON from step 7 wrapped EXACTLY like this, as the very last thing you output, with nothing after `<<<EMAIL_END>>>`:

<<<EMAIL_START>>>
{...json...}
<<<EMAIL_END>>>

Do not ask any clarifying questions — this is unattended. If something is ambiguous, make the same call the interactive `/career-ops scan` and `/career-ops pipeline` modes would make by default, and note the assumption in the digest if it matters.

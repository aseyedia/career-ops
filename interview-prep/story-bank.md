# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

### [Data Quality / Ownership] Found and fixed a silent data corruption bug nobody asked me to look for

**Source:** CHOP PEDSnet — LnDv2 anthropometric pipeline rewrite

**S (Situation):** While rewriting the legacy Perl/SSH BMI and growth z-score derivation pipeline in Trino, I ran a side-by-side validation against production (Nemours v60) to confirm my rewrite matched. It didn't — row counts were off by ~1.5%, and digging into *why* surfaced something worse: the legacy pipeline had no implausible-value exclusion at all. Bad inputs (unit-mismatched heights, transcription errors) were flowing straight through into derived BMI/z-scores. Production's mean BMI z-score was −287. A real population's mean should be ~0.

**T (Task):** I wasn't asked to build a QC system — I was asked to make the new pipeline match the old one. But "match" was the wrong target once I saw the old one was silently wrong. I had to decide whether to replicate the bug for parity or fix it and prove the fix was correct, not just different.

**A (Action):** Designed a two-stage QC subsystem from scratch. Stage 1 (pre-derivation): screens raw height/weight rows using the CDC's modified z-score — a linear extrapolation past ±2 SD that keeps extreme outliers numerically distinct instead of saturating like standard LMS z-scores do (a 220-lb child mistakenly keyed as 220 kg would otherwise look identical to a legitimately heavy kid). Stage 2 (post-derivation): flags biologically implausible values on the derived BMI/z-scores themselves per CDC 2016/2022 thresholds, using a CDC-2022-extended half-normal method above the 95th percentile (Wei et al. 2020) since the classic LMS method saturates in the obese tail. Both stages flag and annotate (`|PEDSnet_BIV`, `|PEDSnet_screen:<reason>`) rather than delete — full audit trail, nothing silently dropped, reversible if a reviewer disagrees with a flag.

**R (Result):** Mean BMI z-score went from −287 (production) to 0.19 (rewrite) — a sane, expected value. Validated the broader rewrite via Bland-Altman agreement analysis against production. Documented the entire mechanism (drop reasons, BIV thresholds, MSV token format) so future maintainers don't have to reverse-engineer it. Built automated HTML QC reports (Plotly charts: drop-reason breakdown, age distribution, z-score distributions, BIV flags by age band) emailed and published to a dashboard after every run, so this never silently regresses again.

**Reflection:** "Make it match prod" is a trap when prod might be wrong. I didn't take "fix the bug" as license to delete bad data, either — flagging instead of deleting meant clinical analysts still had the full distribution and could override my judgment on any individual row. That distinction (audit trail vs. silent deletion) is what made the fix trustworthy enough to ship.

**Best for questions about:** ownership/initiative beyond assigned scope, data quality, debugging methodology, handling ambiguity, disagreeing with existing systems, designing for auditability.

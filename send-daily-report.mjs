#!/usr/bin/env node
// Sends the daily career-ops scan digest via an SMTP relay (e.g. Resend, SES,
// Gmail app password). Reads creds from ~/media-center/.env if present, else
// the process environment — SMTP_HOST/PORT/SECURE/USER/PWD, or the RALLLY_SMTP_*
// names as a fallback (this fork's own .env happens to share creds with an
// unrelated app of the same account, hence the odd fallback name).
//
// Body file may be either:
//   - JSON digest (preferred, emitted by daily-scan-prompt.md) → rendered
//     into the HTML template below, with a plain-text alternative part
//   - plain text (legacy / fallback path in cron-daily-scan.sh) → sent as-is
//
// Usage: node send-daily-report.mjs <path-to-report-body> [to] [from]

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { load } from 'js-yaml';

dotenv.config({ path: path.join(homedir(), 'media-center', '.env') });

function profileEmail() {
  const profilePath = path.resolve('config/profile.yml');
  if (!existsSync(profilePath)) return null;
  const profile = load(readFileSync(profilePath, 'utf8'));
  return profile?.candidate?.email || null;
}

const bodyPath = process.argv[2];
if (!bodyPath) {
  console.error('Usage: node send-daily-report.mjs <path-to-report-body.txt>');
  process.exit(1);
}

const raw = readFileSync(bodyPath, 'utf8').trim();
const today = new Date().toISOString().slice(0, 10);

// ---------- digest parsing ----------

function tryParseDigest(text) {
  // tolerate the agent wrapping JSON in a code fence
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!stripped.startsWith('{')) return null;
  try {
    const d = JSON.parse(stripped);
    return typeof d === 'object' && d !== null ? d : null;
  } catch {
    return null;
  }
}

// ---------- rendering ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function scoreBadge(score) {
  const n = Number(score);
  const color = n >= 4.0 ? '#1a7f37' : n >= 3.0 ? '#9a6700' : '#6e7781';
  const bg = n >= 4.0 ? '#dafbe1' : n >= 3.0 ? '#fff8c5' : '#f6f8fa';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-weight:700;font-size:13px;color:${color};background:${bg};">${esc(n.toFixed(1))}/5</span>`;
}

function renderHtml(d) {
  const date = esc(d.date || today);
  const scanned = d.scanned || {};
  const evaluated = Array.isArray(d.evaluated) ? d.evaluated : [];
  const notes = Array.isArray(d.notes) ? d.notes : d.notes ? [d.notes] : [];

  const statCell = (label, value) => `
    <td align="center" style="padding:14px 8px;background:#f6f8fa;border-radius:8px;">
      <div style="font-size:26px;font-weight:800;color:#1f2328;line-height:1.1;">${esc(value)}</div>
      <div style="font-size:11px;color:#57606a;text-transform:uppercase;letter-spacing:.06em;margin-top:4px;">${esc(label)}</div>
    </td>`;

  const evalRows = evaluated.map((e) => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #d8dee4;vertical-align:top;">
        <div style="font-weight:700;color:#1f2328;font-size:14px;">${esc(e.company)} — ${esc(e.role)}</div>
        <div style="color:#57606a;font-size:13px;margin-top:3px;">${esc(e.verdict || '')}</div>
      </td>
      <td style="padding:12px 14px;border-bottom:1px solid #d8dee4;vertical-align:top;text-align:right;white-space:nowrap;">
        ${scoreBadge(e.score)}
        ${e.apply ? '<div style="color:#1a7f37;font-weight:700;font-size:12px;margin-top:6px;">APPLY</div>' : ''}
      </td>
    </tr>`).join('');

  const evalSection = evaluated.length
    ? `<h2 style="font-size:15px;color:#1f2328;margin:26px 0 10px;font-family:inherit;">Evaluated today</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d8dee4;border-radius:8px;border-collapse:separate;overflow:hidden;">
         ${evalRows}
       </table>`
    : `<p style="color:#57606a;font-size:14px;margin:26px 0 0;">Nothing new cleared the filters today — no evaluations run.</p>`;

  const nextAction = d.nextAction
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
         <tr><td style="padding:14px 16px;background:#ddf4ff;border-left:4px solid #0969da;border-radius:6px;">
           <div style="font-size:11px;font-weight:800;color:#0969da;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Recommended next action</div>
           <div style="font-size:14px;color:#1f2328;">${esc(d.nextAction)}</div>
         </td></tr>
       </table>`
    : '';

  const notesSection = notes.length
    ? `<h2 style="font-size:13px;color:#57606a;margin:24px 0 6px;font-family:inherit;">Notes</h2>
       <ul style="margin:0;padding-left:18px;color:#57606a;font-size:13px;line-height:1.6;">
         ${notes.map((n) => `<li>${esc(n)}</li>`).join('')}
       </ul>`
    : '';

  const followUps = Array.isArray(d.followUps) ? d.followUps : [];
  const followUpRows = followUps.map((f) => {
    const overdue = Number(f.daysOverdue) > 0;
    const badge = overdue
      ? `<span style="color:#cf222e;font-weight:700;">${esc(f.daysOverdue)}d overdue</span>`
      : `<span style="color:#9a6700;font-weight:700;">due ${esc(f.nextFollowupDate || '')}</span>`;
    return `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #d8dee4;vertical-align:top;">
        <div style="font-weight:700;color:#1f2328;font-size:13px;">#${esc(f.appNum)} ${esc(f.company)} — ${esc(f.role)}</div>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #d8dee4;vertical-align:top;text-align:right;white-space:nowrap;font-size:12px;">
        ${badge}
      </td>
    </tr>`;
  }).join('');

  const followUpSection = followUps.length
    ? `<h2 style="font-size:15px;color:#1f2328;margin:26px 0 10px;font-family:inherit;">Outstanding follow-ups (${followUps.length})</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d8dee4;border-radius:8px;border-collapse:separate;overflow:hidden;">
         ${followUpRows}
       </table>`
    : '';

  const timeSensitive = Array.isArray(d.timeSensitive) ? d.timeSensitive : d.timeSensitive ? [d.timeSensitive] : [];
  const timeSensitiveSection = timeSensitive.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
         <tr><td style="padding:14px 16px;background:#fff8c5;border-left:4px solid #9a6700;border-radius:6px;">
           <div style="font-size:11px;font-weight:800;color:#9a6700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Time-sensitive</div>
           <ul style="margin:0;padding-left:18px;color:#1f2328;font-size:13px;line-height:1.6;">
             ${timeSensitive.map((t) => `<li>${esc(t)}</li>`).join('')}
           </ul>
         </td></tr>
       </table>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef1f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="background:#1f2328;padding:22px 28px;">
    <div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-.01em;">career-ops <span style="font-weight:400;color:#8b949e;">daily scan</span></div>
    <div style="color:#8b949e;font-size:13px;margin-top:2px;">${date}</div>
  </td></tr>
  <tr><td style="padding:24px 28px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;">
      <tr>
        ${statCell('jobs scanned', scanned.apiJobs ?? '—')}
        ${statCell('websearch cos.', scanned.websearchCompanies ?? '—')}
        ${statCell('new postings', d.newPostings ?? 0)}
        ${statCell('evaluated', evaluated.length)}
      </tr>
    </table>
    ${evalSection}
    ${nextAction}
    ${timeSensitiveSection}
    ${followUpSection}
    ${notesSection}
  </td></tr>
  <tr><td style="padding:14px 28px;background:#f6f8fa;border-top:1px solid #d8dee4;">
    <div style="color:#8b949e;font-size:11px;">Automated by career-ops · runs daily via cron</div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function renderText(d) {
  const lines = [`career-ops daily scan — ${d.date || today}`, ''];
  const s = d.scanned || {};
  lines.push(`Scanned: ${s.apiJobs ?? '?'} jobs via API, ${s.websearchCompanies ?? '?'} companies via websearch. New postings: ${d.newPostings ?? 0}.`);
  const evaluated = Array.isArray(d.evaluated) ? d.evaluated : [];
  if (evaluated.length) {
    lines.push('', 'Evaluated:');
    for (const e of evaluated) lines.push(`  - ${e.company} — ${e.role}: ${e.score}/5${e.apply ? ' [APPLY]' : ''} — ${e.verdict || ''}`);
  } else {
    lines.push('Nothing new cleared the filters — no evaluations run.');
  }
  if (d.nextAction) lines.push('', `Next action: ${d.nextAction}`);
  const timeSensitive = Array.isArray(d.timeSensitive) ? d.timeSensitive : d.timeSensitive ? [d.timeSensitive] : [];
  if (timeSensitive.length) lines.push('', 'Time-sensitive:', ...timeSensitive.map((t) => `  - ${t}`));
  const followUps = Array.isArray(d.followUps) ? d.followUps : [];
  if (followUps.length) {
    lines.push('', `Outstanding follow-ups (${followUps.length}):`);
    for (const f of followUps) {
      const status = Number(f.daysOverdue) > 0 ? `${f.daysOverdue}d overdue` : `due ${f.nextFollowupDate || ''}`;
      lines.push(`  - #${f.appNum} ${f.company} — ${f.role}: ${status}`);
    }
  }
  const notes = Array.isArray(d.notes) ? d.notes : d.notes ? [d.notes] : [];
  if (notes.length) lines.push('', 'Notes:', ...notes.map((n) => `  - ${n}`));
  return lines.join('\n');
}

// ---------- send ----------

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || process.env.RALLLY_SMTP_HOST,
  port: Number(process.env.SMTP_PORT || process.env.RALLLY_SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || process.env.RALLLY_SMTP_SECURE || 'true') === 'true',
  auth: {
    user: process.env.SMTP_USER || process.env.RALLLY_SMTP_USER,
    pass: process.env.SMTP_PWD || process.env.RALLLY_SMTP_PWD,
  },
});

const to = process.argv[3] || profileEmail();
const from = process.argv[4] || process.env.CAREER_OPS_FROM_EMAIL;

if (!to) {
  console.error('No recipient: pass one as the 2nd arg or set candidate.email in config/profile.yml');
  process.exit(1);
}
if (!from) {
  console.error('No sender: pass one as the 3rd arg or set CAREER_OPS_FROM_EMAIL');
  process.exit(1);
}

const digest = tryParseDigest(raw);
const mail = {
  from: `career-ops <${from}>`,
  to,
  subject: `career-ops daily scan — ${digest?.date || today}`,
};
if (digest) {
  mail.text = renderText(digest);
  mail.html = renderHtml(digest);
} else {
  mail.text = raw; // legacy plain-text / fallback path
}

try {
  const info = await transporter.sendMail(mail);
  console.log(`Sent: ${info.messageId}${digest ? ' (html)' : ' (plain fallback)'}`);
} catch (err) {
  console.error(`Send failed: ${err.message}`);
  process.exit(1);
}

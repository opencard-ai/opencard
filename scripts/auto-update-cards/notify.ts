/**
 * Sends a summary email via AgentMail after a pipeline run.
 */

import type { CardResult } from "./index";

interface AgentMailMessage {
  to: string;
  from?: string;
  subject: string;
  html: string;
}

async function sendAgentMail(msg: AgentMailMessage): Promise<void> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY not set");

  const inboxId = process.env.AGENTMAIL_FROM_INBOX;
  if (!inboxId) throw new Error("AGENTMAIL_FROM_INBOX not set");

  const response = await fetch(`https://api.agentmail.to/v0/inboxes/${inboxId}/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AgentMail error ${response.status}: ${text}`);
  }
}

export async function sendSummaryEmail(
  results: CardResult[],
  runDir: string
): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL || process.env.VERCELILITY?.split("@")[0] || "opencard@opencardai.com";

  if (results.length === 0) {
    console.log("   ℹ️  No results — skipping email");
    return;
  }

  const prResults = results.filter((r) => r.prUrl);
  const changes = results.filter((r) => r.hasChanges);
  const highRisk = results.filter((r) => r.risk === "HIGH").length;

  if (changes.length === 0) {
    console.log("   ℹ️  No changes — skipping email");
    return;
  }

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prRows = changes
    .map((r) => {
      const diffLines = r.diff?.changes
        .map((c) => `<li><code>${c.field}</code>: <del>${c.from}</del> → <strong>${c.to}</strong></li>`)
        .join("") || "";
      const prLink = r.prUrl
        ? `<a href="${r.prUrl}">#${r.prUrl.split("/").pop()}</a>`
        : "<em>DRY RUN</em>";
      return `
      <tr>
        <td><span class="badge ${r.risk?.toLowerCase()}">${r.risk}</span></td>
        <td>${r.cardName}</td>
        <td>${r.diff?.confidence ? `<span title="confidence">${(r.diff.confidence * 100).toFixed(0)}%</span>` : "—"}</td>
        <td><ul style="margin:0;padding-left:16px">${diffLines}</ul></td>
        <td>${prLink}</td>
      </tr>`;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; color: #1e293b; }
    h2 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th { background: #f8fafc; text-align: left; padding: 10px 12px; border: 1px solid #e2e8f0; }
    td { padding: 10px 12px; border: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge.high { background: #fee2e2; color: #991b1b; }
    .badge.med { background: #fef3c7; color: #92400e; }
    .badge.low { background: #dcfce7; color: #166534; }
    .summary { display: flex; gap: 24px; margin: 16px 0; }
    .stat { background: #f1f5f9; padding: 12px 16px; border-radius: 8px; }
    .stat .num { font-size: 24px; font-weight: 700; color: #0f172a; }
    .stat .label { font-size: 12px; color: #64748b; }
    code { background: #f1f5f9; padding: 1px 4px; border-radius: 4px; font-size: 13px; }
    del { color: #dc2626; text-decoration: line-through; }
    strong { color: #166534; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h2>📊 OpenCard Auto-Update Report — ${date}</h2>

  <div class="summary">
    <div class="stat"><div class="num">${changes.length}</div><div class="label">PRs Opened</div></div>
    <div class="stat"><div class="num">${highRisk}</div><div class="label">HIGH Risk</div></div>
    <div class="stat"><div class="num">${results.length}</div><div class="label">Cards Scanned</div></div>
  </div>

  <h3>Changes Detected</h3>
  <table>
    <thead>
      <tr>
        <th>Risk</th>
        <th>Card</th>
        <th>Confidence</th>
        <th>Changes</th>
        <th>PR</th>
      </tr>
    </thead>
    <tbody>
      ${prRows}
    </tbody>
  </table>

  <p style="margin-top:24px;color:#64748b;font-size:12px">
    OpenCard auto-updater · <a href="https://github.com/opencard-ai/opencard">View Repo</a>
  </p>
</body>
</html>`;

  const subject = `[OpenCard auto-updater] ${changes.length} PRs opened, ${highRisk} HIGH-risk`;

  try {
    await sendAgentMail({ to: ownerEmail, subject, html });
    console.log(`   ✅ Email sent to ${ownerEmail}`);
  } catch (err) {
    console.warn(`   ⚠️  Email send failed: ${(err as Error).message}`);
  }
}

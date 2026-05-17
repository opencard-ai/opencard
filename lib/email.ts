export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: "resend" | "agentmail" | "none";
  status?: number;
  error?: string;
}

const DEFAULT_EMAIL_FROM = "OpenCard.ai <verify@opencardai.com>";

function normalizeRecipients(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

async function errorText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, provider: "resend", error: "Missing RESEND_API_KEY" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
      to: normalizeRecipients(input.to),
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    }),
  });

  if (!res.ok) {
    return { ok: false, provider: "resend", status: res.status, error: await errorText(res) };
  }

  return { ok: true, provider: "resend", status: res.status };
}

async function sendViaAgentMail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const inbox = process.env.AGENTMAIL_FROM_INBOX;
  if (!apiKey || !inbox) {
    return { ok: false, provider: "agentmail", error: "Missing AGENTMAIL_API_KEY or AGENTMAIL_FROM_INBOX" };
  }

  const res = await fetch(`https://api.agentmail.to/v0/inboxes/${inbox}/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to: normalizeRecipients(input.to),
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    }),
  });

  if (!res.ok) {
    return { ok: false, provider: "agentmail", status: res.status, error: await errorText(res) };
  }

  return { ok: true, provider: "agentmail", status: res.status };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = (process.env.EMAIL_PROVIDER || "agentmail").toLowerCase();

  if (provider === "resend") {
    const resend = await sendViaResend(input);
    if (resend.ok || process.env.EMAIL_FALLBACK_AGENTMAIL !== "true") return resend;

    const fallback = await sendViaAgentMail(input);
    if (!fallback.ok) {
      console.error("Email send failed via Resend and AgentMail fallback", {
        resend: { status: resend.status, error: resend.error },
        fallback: { status: fallback.status, error: fallback.error },
      });
    }
    return fallback;
  }

  if (provider === "agentmail") return sendViaAgentMail(input);

  return { ok: false, provider: "none", error: `Unsupported EMAIL_PROVIDER: ${provider}` };
}

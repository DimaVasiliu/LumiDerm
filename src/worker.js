/**
 * Lumi Derm — Cloudflare Worker
 * ---------------------------------------------------------------
 * Serves the static site (via the ASSETS binding) and adds a small
 * API for sending marketing email from the admin page.
 *
 * Routes:
 *   GET  /api/health              — is the API alive + configured?
 *   POST /api/campaign/send       — send a campaign (requires SEND_KEY)
 *   GET  /api/unsubscribe         — one-click unsubscribe landing page
 *   POST /api/unsubscribe         — RFC 8058 one-click unsubscribe
 *
 * Secrets (set with `npx wrangler secret put NAME`):
 *   RESEND_API_KEY   — from resend.com
 *   SEND_KEY         — long random string; pasted into the admin page
 *   UNSUB_SECRET     — long random string; signs unsubscribe links
 *
 * Vars (in wrangler.jsonc):
 *   FROM_EMAIL       — e.g. "Lumi Derm Aesthetics <hello@lumidermaesthetics.com>"
 *   REPLY_TO         — e.g. "hello@lumidermaesthetics.com"
 *
 * KV:
 *   SUPPRESSION      — stores unsubscribed addresses. Never send to these.
 */

const MAX_RECIPIENTS = 500;
const BATCH_SIZE = 100; // Resend's batch endpoint limit

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          resend: Boolean(env.RESEND_API_KEY),
          sendKey: Boolean(env.SEND_KEY),
          unsubSecret: Boolean(env.UNSUB_SECRET),
          suppression: Boolean(env.SUPPRESSION),
          from: env.FROM_EMAIL || null,
        });
      }

      if (url.pathname === "/api/unsubscribe") {
        return handleUnsubscribe(request, env, url);
      }

      if (url.pathname === "/api/campaign/send") {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleSend(request, env, url);
      }

      return json({ error: "Not found." }, 404);
    } catch (err) {
      return json({ error: (err && err.message) || "Server error." }, 500);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

async function handleSend(request, env, url) {
  if (!env.SEND_KEY) {
    return json({ error: "Server not configured: SEND_KEY is missing." }, 500);
  }
  if (!env.RESEND_API_KEY) {
    return json({ error: "Server not configured: RESEND_API_KEY is missing." }, 500);
  }

  const provided = request.headers.get("x-lumi-key") || "";
  if (!timingSafeEqual(provided, env.SEND_KEY)) {
    return json({ error: "Unauthorised. Check the send key in Settings." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const subject = String(body.subject || "").trim();
  const html = String(body.html || "");
  const isTest = body.test === true;
  const incoming = Array.isArray(body.recipients) ? body.recipients : [];

  if (!subject) return json({ error: "Subject is required." }, 400);
  if (!html) return json({ error: "Email body is required." }, 400);
  if (!incoming.length) return json({ error: "No recipients." }, 400);
  if (incoming.length > MAX_RECIPIENTS) {
    return json(
      { error: `Too many recipients in one send (max ${MAX_RECIPIENTS}). Split the list.` },
      400
    );
  }
  // A test must never accidentally go to the whole client list.
  if (isTest && incoming.length > 1) {
    return json({ error: "A test send takes exactly one recipient." }, 400);
  }

  // Clean + de-duplicate.
  const seen = new Set();
  const clean = [];
  let invalid = 0;
  for (const row of incoming) {
    const email = String((row && row.email) || "").trim().toLowerCase();
    if (!isEmail(email)) {
      invalid += 1;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    clean.push({ email, name: String((row && row.name) || "").trim() });
  }
  if (!clean.length) return json({ error: "No valid email addresses." }, 400);

  // Honour the suppression list. This is not optional.
  const kept = [];
  let suppressed = 0;
  for (const person of clean) {
    if (env.SUPPRESSION) {
      const hit = await env.SUPPRESSION.get(suppressionKey(person.email));
      if (hit) {
        suppressed += 1;
        continue;
      }
    }
    kept.push(person);
  }
  if (!kept.length) {
    return json({ error: "Everyone on this list has unsubscribed.", sent: 0, suppressed }, 400);
  }

  const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <hello@lumidermaesthetics.com>";
  const replyTo = env.REPLY_TO || null;

  const messages = [];
  for (const person of kept) {
    const unsubUrl = await buildUnsubscribeUrl(env, url.origin, person.email);
    const personalised = html
      .replaceAll("{{name}}", escapeHtml(firstName(person.name) || "there"))
      .replaceAll("{{unsubscribe}}", unsubUrl);

    const message = {
      from,
      to: [person.email],
      subject,
      html: personalised,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
    if (replyTo) message.reply_to = replyTo;
    messages.push(message);
  }

  let sent = 0;
  const errors = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    if (res.ok) {
      sent += chunk.length;
    } else {
      const text = await res.text();
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${res.status} ${text.slice(0, 300)}`);
    }
  }

  return json({
    ok: errors.length === 0,
    sent,
    suppressed,
    invalid,
    errors,
  });
}

/* ------------------------------------------------------------------ */
/* Unsubscribe                                                         */
/* ------------------------------------------------------------------ */

async function handleUnsubscribe(request, env, url) {
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase();
  const token = String(url.searchParams.get("t") || "");

  if (!isEmail(email) || !token) {
    return htmlPage("Invalid link", "This unsubscribe link is not valid.", 400);
  }

  const expected = await signEmail(env, email);
  if (!timingSafeEqual(token, expected)) {
    return htmlPage("Invalid link", "This unsubscribe link is not valid.", 400);
  }

  if (env.SUPPRESSION) {
    await env.SUPPRESSION.put(
      suppressionKey(email),
      JSON.stringify({ at: new Date().toISOString() })
    );
  }

  return htmlPage(
    "You're unsubscribed",
    `We've removed <strong>${escapeHtml(email)}</strong> from our marketing emails. You won't hear from us again unless you ask.<br><br>Appointment confirmations and reminders are separate and will still reach you.`,
    200
  );
}

async function buildUnsubscribeUrl(env, origin, email) {
  const token = await signEmail(env, email);
  return `${origin}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${token}`;
}

async function signEmail(env, email) {
  const secret = env.UNSUB_SECRET || env.SEND_KEY || "lumi-derm-fallback";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email));
  return base64Url(sig);
}

function suppressionKey(email) {
  return `unsub:${email}`;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function htmlPage(title, message, status = 200) {
  const body = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Lumi Derm Aesthetics</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f4f1ee;color:#1c1a18;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;padding:24px;}
  .card{background:#fff;max-width:460px;padding:44px 40px;border-radius:4px;text-align:center;}
  .brand{font-family:Georgia,serif;font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#a2968a;margin:0 0 24px;}
  h1{font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 16px;}
  p{font-size:15px;line-height:1.7;color:#4a443e;margin:0 0 24px;}
  a{display:inline-block;padding:14px 30px;background:#1c1a18;color:#fff;text-decoration:none;
    font-size:12px;letter-spacing:.16em;text-transform:uppercase;border-radius:2px;}
</style></head>
<body><div class="card">
  <p class="brand">Lumi&nbsp;Derm</p>
  <h1>${escapeHtml(title)}</h1>
  <p>${message}</p>
  <a href="/">Back to the website</a>
</div></body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function base64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

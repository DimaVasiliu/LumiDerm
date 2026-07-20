/**
 * Lumi Derm — Cloudflare Worker
 * ---------------------------------------------------------------
 * Serves the static site (via the ASSETS binding) and adds a small
 * API for sending marketing email from the admin page.
 *
 * Routes:
 *   GET  /api/health              — is the API alive + configured?
 *   POST /api/campaign/send       — send a campaign (requires SEND_KEY)
 *   GET  /api/campaign/history    — admin: recent send history (requires SEND_KEY)
 *   GET  /api/unsubscribe         — one-click unsubscribe landing page
 *   POST /api/unsubscribe         — RFC 8058 one-click unsubscribe
 *   POST /api/subscribe           — newsletter signup (double opt-in)
 *   GET  /api/subscribe/confirm   — double opt-in confirmation link
 *   GET  /api/subscribers         — admin: list subscribers (requires SEND_KEY)
 *   POST /api/subscribers/delete  — admin: erase a subscriber (requires SEND_KEY)
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
 * D1:
 *   SUBSCRIBERS      — newsletter subscribers + consent records.
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
          subscribers: Boolean(env.SUBSCRIBERS),
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

      if (url.pathname === "/api/campaign/history") {
        return handleCampaignHistory(request, env);
      }

      if (url.pathname === "/api/subscribe") {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleSubscribe(request, env, url);
      }

      // Clean, mail-safe confirmation link: /api/confirm/<token> (no query string).
      if (url.pathname.startsWith("/api/confirm/")) {
        return handleConfirmByToken(env, url.pathname.slice("/api/confirm/".length));
      }
      // Legacy query-string confirm link (kept so older emails still work).
      if (url.pathname === "/api/subscribe/confirm") {
        return handleConfirm(request, env, url);
      }

      if (url.pathname === "/api/subscribers") {
        return handleListSubscribers(request, env);
      }

      if (url.pathname === "/api/subscribers/delete") {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleDeleteSubscriber(request, env);
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
  const audienceSource = String(body.audienceSource || (isTest ? "test" : "manual")).slice(0, 80);

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
    const who = firstName(person.name) || "there";
    const personalised = html
      .replaceAll("{{name}}", escapeHtml(who))
      .replaceAll("{{unsubscribe}}", unsubUrl);
    // Subject is a plain-text header — personalise but do not HTML-escape.
    const personalisedSubject = subject.replaceAll("{{name}}", who);

    const message = {
      from,
      to: [person.email],
      subject: personalisedSubject,
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

  const payload = {
    ok: errors.length === 0,
    sent,
    suppressed,
    invalid,
    errors,
  };

  await recordCampaignSend(env, {
    subject,
    audienceSource,
    isTest,
    requested: incoming.length,
    sent,
    suppressed,
    invalid,
    status: errors.length ? "partial" : "sent",
    errors,
  });

  return json(payload);
}

async function recordCampaignSend(env, detail) {
  if (!env.SUBSCRIBERS) return;
  try {
    await env.SUBSCRIBERS.prepare(
      `INSERT INTO campaign_sends
        (subject, audience_source, is_test, requested_count, sent_count, suppressed_count,
         invalid_count, status, error_summary, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
    ).bind(
      String(detail.subject || "").slice(0, 240),
      String(detail.audienceSource || "manual").slice(0, 80),
      detail.isTest ? 1 : 0,
      detail.requested || 0,
      detail.sent || 0,
      detail.suppressed || 0,
      detail.invalid || 0,
      String(detail.status || "sent").slice(0, 24),
      (detail.errors || []).join(" | ").slice(0, 1000),
      new Date().toISOString()
    ).run();
  } catch (err) {
    // History is useful, but a logging failure must not block a real email send.
  }
}

async function handleCampaignHistory(request, env) {
  if (!authorised(request, env)) return json({ error: "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Campaign history isn't set up yet." }, 500);

  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, subject, audience_source, is_test, requested_count, sent_count,
            suppressed_count, invalid_count, status, error_summary, created_at
     FROM campaign_sends
     ORDER BY created_at DESC
     LIMIT 50`
  ).all();

  return json({ ok: true, history: results || [] });
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

  // Also reflect it in the subscriber list, if present.
  if (env.SUBSCRIBERS) {
    try {
      await env.SUBSCRIBERS.prepare(
        "UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?1 WHERE email = ?2"
      ).bind(new Date().toISOString(), email).run();
    } catch (err) { /* non-fatal */ }
  }

  return htmlPage(
    "You're unsubscribed",
    `We've removed <strong>${escapeHtml(email)}</strong> from our marketing emails. You won't hear from us again unless you ask.<br><br>Appointment confirmations and reminders are separate and will still reach you.`,
    200
  );
}

/* ------------------------------------------------------------------ */
/* Newsletter signup (double opt-in)                                   */
/* ------------------------------------------------------------------ */

async function handleSubscribe(request, env, url) {
  if (!env.SUBSCRIBERS) {
    return json({ error: "Signups aren't set up yet." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // Honeypot: real people leave this empty. Pretend success for bots.
  if (String(body.company || "").trim() !== "") {
    return json({ ok: true, message: "Thanks — please check your inbox." });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const firstNameVal = String(body.first_name || "").trim().slice(0, 60);
  const lastNameVal = String(body.last_name || "").trim().slice(0, 60);
  const interest = String(body.interest || "").trim().slice(0, 40);
  const birthDay = clampInt(body.birth_day, 1, 31);
  const birthMonth = clampInt(body.birth_month, 1, 12);
  const consent = body.consent_email === true;

  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (!firstNameVal) return json({ error: "Please enter your first name." }, 400);
  if (!consent) return json({ error: "Please tick the consent box to subscribe." }, 400);

  // If they already unsubscribed before, honour the suppression list —
  // they must opt in again deliberately, which this flow does.
  const now = new Date().toISOString();
  const token = randomToken();
  const wording = String(body.consent_wording || "").slice(0, 300);
  const source = String(body.source || "website").slice(0, 60);
  const ip = request.headers.get("cf-connecting-ip") || "";

  // Is this email already confirmed?
  const existing = await env.SUBSCRIBERS.prepare(
    "SELECT status FROM subscribers WHERE email = ?1"
  ).bind(email).first();

  if (existing && existing.status === "confirmed") {
    return json({ ok: true, already: true, message: "You're already subscribed — thank you!" });
  }

  // Insert or reset to pending with a fresh confirmation token.
  await env.SUBSCRIBERS.prepare(
    `INSERT INTO subscribers
       (email, first_name, last_name, birth_day, birth_month, interest, status,
        consent_email, consent_wording, consent_source, signup_ip, confirm_token, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,'pending',?7,?8,?9,?10,?11,?12)
     ON CONFLICT(email) DO UPDATE SET
       first_name=?2, last_name=?3, birth_day=?4, birth_month=?5, interest=?6,
       status='pending', consent_email=?7, consent_wording=?8, consent_source=?9,
       signup_ip=?10, confirm_token=?11, created_at=?12, unsubscribed_at=NULL`
  ).bind(
    email, firstNameVal, lastNameVal, birthDay, birthMonth, interest,
    consent ? 1 : 0, wording, source, ip, token, now
  ).run();

  // Send the double opt-in confirmation email.
  if (env.RESEND_API_KEY) {
    const confirmUrl = `${url.origin}/api/confirm/${token}`;
    const html = confirmEmailHtml(firstNameVal, confirmUrl);
    const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <info@lumidermaesthetics.com>";
    const message = {
      from,
      to: [email],
      subject: "Confirm your subscription to Lumi Derm",
      html,
    };
    if (env.REPLY_TO) message.reply_to = env.REPLY_TO;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: "Could not send the confirmation email. " + text.slice(0, 160) }, 502);
    }
  }

  return json({ ok: true, message: "Thanks! Please check your inbox to confirm." });
}

// Confirm using a single opaque token in the path — no query string, so the
// link survives every mail client and quoted-printable encoding intact.
async function handleConfirmByToken(env, rawToken) {
  if (!env.SUBSCRIBERS) return htmlPage("Not available", "Signups aren't set up yet.", 500);

  const token = String(rawToken || "").trim();
  if (!token || token.length < 10) {
    return htmlPage("Invalid link", "This confirmation link is not valid.", 400);
  }

  const row = await env.SUBSCRIBERS.prepare(
    "SELECT email, status FROM subscribers WHERE confirm_token = ?1"
  ).bind(token).first();

  if (!row) {
    // No pending row with this token — either already confirmed, or the link is old.
    return htmlPage(
      "Link already used",
      "This confirmation link has already been used or has expired. If you're not sure you're subscribed, just sign up again.",
      200
    );
  }

  await env.SUBSCRIBERS.prepare(
    "UPDATE subscribers SET status='confirmed', confirmed_at=?1, confirm_token=NULL WHERE confirm_token=?2"
  ).bind(new Date().toISOString(), token).run();

  return htmlPage(
    "You're subscribed",
    `Thank you — <strong>${escapeHtml(row.email)}</strong> is confirmed. You'll be first to hear about our offers.<br><br>You can unsubscribe from any email at any time.`,
    200
  );
}

async function handleConfirm(request, env, url) {
  if (!env.SUBSCRIBERS) return htmlPage("Not available", "Signups aren't set up yet.", 500);

  const email = String(url.searchParams.get("e") || "").trim().toLowerCase();
  const token = String(url.searchParams.get("t") || "");
  if (!isEmail(email) || !token) {
    return htmlPage("Invalid link", "This confirmation link is not valid.", 400);
  }

  const row = await env.SUBSCRIBERS.prepare(
    "SELECT confirm_token, status FROM subscribers WHERE email = ?1"
  ).bind(email).first();

  if (!row) return htmlPage("Invalid link", "This confirmation link is not valid.", 400);

  if (row.status === "confirmed") {
    return htmlPage(
      "Already confirmed",
      `<strong>${escapeHtml(email)}</strong> is already on the list. See you soon!`,
      200
    );
  }
  if (!row.confirm_token || !timingSafeEqual(token, row.confirm_token)) {
    return htmlPage("Invalid link", "This confirmation link is not valid or has expired.", 400);
  }

  await env.SUBSCRIBERS.prepare(
    "UPDATE subscribers SET status='confirmed', confirmed_at=?1, confirm_token=NULL WHERE email=?2"
  ).bind(new Date().toISOString(), email).run();

  return htmlPage(
    "You're subscribed",
    `Thank you — <strong>${escapeHtml(email)}</strong> is confirmed. You'll be first to hear about our offers.<br><br>You can unsubscribe from any email at any time.`,
    200
  );
}

async function handleListSubscribers(request, env) {
  if (!authorised(request, env)) return json({ error: "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Signups aren't set up yet." }, 500);

  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT email, first_name, last_name, birth_day, birth_month, interest,
            status, consent_email, consent_wording, consent_source, created_at, confirmed_at, unsubscribed_at
     FROM subscribers ORDER BY created_at DESC`
  ).all();

  const list = results || [];
  const counts = { confirmed: 0, pending: 0, unsubscribed: 0 };
  list.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });

  return json({ ok: true, counts, total: list.length, subscribers: list });
}

async function handleDeleteSubscriber(request, env) {
  if (!authorised(request, env)) return json({ error: "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Signups aren't set up yet." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const email = String(body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Invalid email." }, 400);

  await env.SUBSCRIBERS.prepare("DELETE FROM subscribers WHERE email = ?1").bind(email).run();
  return json({ ok: true });
}

function authorised(request, env) {
  const provided = request.headers.get("x-lumi-key") || "";
  return Boolean(env.SEND_KEY) && timingSafeEqual(provided, env.SEND_KEY);
}

function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < min || n > max) return null;
  return n;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64Url(bytes.buffer);
}

function confirmEmailHtml(firstName, confirmUrl) {
  const name = escapeHtml(firstName || "there");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border-radius:4px;">
<tr><td align="center" style="padding:40px 40px 8px;">
<p style="margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:.16em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p>
<p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#a2968a;">Aesthetics &middot; London Docklands</p>
</td></tr>
<tr><td style="padding:24px 40px 8px;">
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:26px;color:#1c1a18;">One quick click to confirm</h1>
<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#4a443e;">Hi ${name},</p>
<p style="margin:0 0 26px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#4a443e;">Thanks for signing up to hear about our offers and news. Please confirm your email address so we can add you to the list.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#1c1a18" style="border-radius:2px;">
<a href="${confirmUrl.replace(/&/g, "&amp;")}" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#fff;text-decoration:none;">Confirm subscription</a>
</td></tr></table>
<p style="margin:26px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#a2968a;">If you didn't sign up, just ignore this email — nothing will happen and you won't be added.</p>
</td></tr>
<tr><td style="padding:30px 40px 36px;">
<p style="margin:0;border-top:1px solid #e8e2db;padding-top:22px;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#a2968a;">Lumi Derm Aesthetics &middot; London Docklands</p>
</td></tr>
</table></td></tr></table></body></html>`;
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

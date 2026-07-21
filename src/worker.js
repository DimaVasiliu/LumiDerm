/**
 * Lumi Derm — Cloudflare Worker
 * ---------------------------------------------------------------
 * Serves the static site (via the ASSETS binding) and adds a small
 * API for sending marketing email from the admin page.
 *
 * Routes:
 *   GET  /api/health              — is the public API alive + configured?
 *   GET  /admin/api/health        — admin: Access session + API config
 *   POST /admin/api/campaign/send — admin: send a campaign
 *   GET  /admin/api/campaign/history — admin: recent send history
 *   GET  /admin/api/campaign/drafts — admin: list saved campaign drafts
 *   POST /admin/api/campaign/drafts — admin: save campaign draft
 *   POST /admin/api/campaign/drafts/delete — admin: delete campaign draft
 *   GET  /api/unsubscribe         — one-click unsubscribe landing page
 *   POST /api/unsubscribe         — RFC 8058 one-click unsubscribe
 *   POST /api/subscribe           — newsletter signup (double opt-in)
 *   GET  /api/subscribe/confirm   — double opt-in confirmation link
 *   GET  /admin/api/subscribers   — admin: list subscribers
 *   POST /admin/api/subscribers/delete — admin: erase a subscriber
 *   POST /admin/api/campaign/schedule — admin: queue a campaign for later
 *   GET  /admin/api/campaign/scheduled — admin: list scheduled/sent queued campaigns
 *   POST /admin/api/campaign/scheduled/cancel — admin: cancel a queued campaign
 *   GET/POST /admin/api/settings/birthday — admin: birthday-email config
 *   POST /admin/api/settings/birthday/test — admin: send birthday preview
 *   POST /admin/api/github        — admin: GitHub publish proxy (token stays server-side)
 *   GET  /admin/api/github/health — admin: is server-side publishing configured?
 *   GET  /admin/api/audit         — admin: recent audit-log entries
 *   POST /admin/api/audit         — admin: record a client-only action (e.g. CSV export)
 *   GET  /media/<key>             — public: serve an uploaded image from R2
 *   POST /admin/api/media/upload  — admin: upload an image to R2 (multipart)
 *   GET  /admin/api/media         — admin: list uploaded images
 *   POST /admin/api/media/delete  — admin: delete an uploaded image
 *
 * R2:
 *   MEDIA            — uploaded images (offer photos, email banners, etc.).
 *
 * D1 also stores an admin_audit_log (who/what/when) — see logAudit().
 *
 * Cron (wrangler triggers, hourly): scheduled() sends due queued campaigns and,
 * at the configured hour, the day's birthday emails.
 *
 * Secrets (set with `npx wrangler secret put NAME`):
 *   RESEND_API_KEY   — from resend.com
 *   UNSUB_SECRET     — long random string; signs unsubscribe links
 *   GITHUB_TOKEN     — fine-grained PAT (Contents: read & write on this repo only).
 *                      Used by the /admin/api/github publish proxy so the token is
 *                      never stored in the browser.
 *
 * Vars:
 *   ADMIN_EMAILS     — optional comma-separated Access emails allowed for admin API.
 *                      If omitted, any Cloudflare Access-authenticated user is accepted.
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
    const isPublicApi = url.pathname.startsWith("/api/");
    const isAdminApi = url.pathname.startsWith("/admin/api/");
    const apiPath = isAdminApi ? url.pathname.replace("/admin/api", "/api") : url.pathname;

    // Public image serving from R2 (offers, pages, emails all use /media/<key>).
    if (url.pathname.startsWith("/media/")) {
      return handleMediaServe(request, env, url);
    }

    if (!isPublicApi && !isAdminApi) {
      return env.ASSETS.fetch(request);
    }

    try {
      // Central admin gate: every /admin/api/* call needs a valid Access user in
      // ADMIN_EMAILS. Log access failures (OWASP) and stop here on denial.
      if (isAdminApi) {
        const gate = authorised(request, env);
        if (!gate.ok) {
          await logAudit(env, request, { actor: adminEmail(request), action: "auth.denied", detail: apiPath, status: "denied" });
          return json({ error: gate.reason || "Unauthorised." }, 401);
        }
      }

      if (apiPath === "/api/health") {
        if (isAdminApi) {
          const admin = authorised(request, env);
          if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
          return json({
            ok: true,
            adminEmail: admin.email,
            resend: Boolean(env.RESEND_API_KEY),
            unsubSecret: Boolean(env.UNSUB_SECRET),
            suppression: Boolean(env.SUPPRESSION),
            subscribers: Boolean(env.SUBSCRIBERS),
            github: Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO),
            from: env.FROM_EMAIL || null,
            deploy: deployInfo(env),
            lastSend: await lastSuccessfulSend(env),
          });
        }
        return json({
          ok: true,
          resend: Boolean(env.RESEND_API_KEY),
          unsubSecret: Boolean(env.UNSUB_SECRET),
          suppression: Boolean(env.SUPPRESSION),
          subscribers: Boolean(env.SUBSCRIBERS),
          from: env.FROM_EMAIL || null,
        });
      }

      if (apiPath === "/api/unsubscribe" && isPublicApi) {
        return handleUnsubscribe(request, env, url);
      }

      if (apiPath === "/api/campaign/send" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleSend(request, env, url);
      }

      if (apiPath === "/api/campaign/history" && isAdminApi) {
        return handleCampaignHistory(request, env);
      }

      if (apiPath === "/api/campaign/drafts" && isAdminApi) {
        if (request.method === "GET") return handleListCampaignDrafts(request, env);
        if (request.method === "POST") return handleSaveCampaignDraft(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      if (apiPath === "/api/campaign/drafts/delete" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleDeleteCampaignDraft(request, env);
      }

      if (apiPath === "/api/campaign/schedule" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleScheduleCampaign(request, env);
      }

      if (apiPath === "/api/campaign/scheduled" && isAdminApi) {
        return handleListScheduled(request, env);
      }

      if (apiPath === "/api/campaign/scheduled/cancel" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleCancelScheduled(request, env);
      }

      if (apiPath === "/api/settings/birthday" && isAdminApi) {
        if (request.method === "GET") return handleGetBirthday(request, env);
        if (request.method === "POST") return handleSetBirthday(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      if (apiPath === "/api/settings/birthday/test" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleTestBirthday(request, env);
      }

      if (apiPath === "/api/github/health" && isAdminApi) {
        return handleGithubHealth(request, env);
      }

      if (apiPath === "/api/github" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleGithubProxy(request, env);
      }

      if (apiPath === "/api/audit" && isAdminApi) {
        if (request.method === "GET") return handleAuditList(request, env);
        if (request.method === "POST") return handleAuditLogClient(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      if (apiPath === "/api/media" && isAdminApi) {
        return handleMediaList(request, env);
      }
      if (apiPath === "/api/media/upload" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleMediaUpload(request, env);
      }
      if (apiPath === "/api/media/delete" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleMediaDelete(request, env);
      }

      if (apiPath === "/api/subscribe" && isPublicApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleSubscribe(request, env, url);
      }

      // Clean, mail-safe confirmation link: /api/confirm/<token> (no query string).
      if (url.pathname.startsWith("/api/confirm/") && isPublicApi) {
        return handleConfirmByToken(env, url.pathname.slice("/api/confirm/".length));
      }
      // Legacy query-string confirm link (kept so older emails still work).
      if (apiPath === "/api/subscribe/confirm" && isPublicApi) {
        return handleConfirm(request, env, url);
      }

      if (apiPath === "/api/subscribers" && isAdminApi) {
        return handleListSubscribers(request, env);
      }

      if (apiPath === "/api/subscribers/delete" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleDeleteSubscriber(request, env);
      }

      return json({ error: "Not found." }, 404);
    } catch (err) {
      return json({ error: (err && err.message) || "Server error." }, 500);
    }
  },

  // Hourly cron (see wrangler.jsonc triggers): send due scheduled campaigns,
  // and — at the configured hour — the day's birthday emails.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(event, env));
  },
};

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

async function handleSend(request, env, url) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);

  if (!env.RESEND_API_KEY) {
    return json({ error: "Server not configured: RESEND_API_KEY is missing." }, 500);
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

  await logAudit(env, request, {
    action: isTest ? "campaign.test" : "campaign.send",
    detail: '"' + subject + '" — sent ' + sent + "/" + incoming.length + (suppressed ? ", " + suppressed + " suppressed" : ""),
    status: errors.length ? "error" : "ok",
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
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
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

async function handleListCampaignDrafts(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Campaign drafts aren't set up yet." }, 500);

  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, name, payload, created_at, updated_at
     FROM campaign_drafts
     ORDER BY updated_at DESC
     LIMIT 100`
  ).all();

  const drafts = (results || []).map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload || "{}");
    } catch {
      payload = {};
    }
    return {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...payload,
    };
  });

  return json({ ok: true, drafts });
}

async function handleSaveCampaignDraft(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Campaign drafts aren't set up yet." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) return json({ error: "Campaign name is required." }, 400);

  const id = String(body.id || randomId()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || randomId();
  const now = new Date().toISOString();
  const payload = {
    mail: safeObject(body.mail),
    selected: safeObject(body.selected),
    audienceSource: String(body.audienceSource || "website").slice(0, 40),
    segment: safeObject(body.segment),
  };

  await env.SUBSCRIBERS.prepare(
    `INSERT INTO campaign_drafts (id, name, payload, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(id) DO UPDATE SET
       name=?2,
       payload=?3,
       updated_at=?4`
  ).bind(id, name, JSON.stringify(payload).slice(0, 50000), now).run();

  return json({ ok: true, draft: { id, name, updated_at: now, ...payload } });
}

async function handleDeleteCampaignDraft(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Campaign drafts aren't set up yet." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const id = String(body.id || "").trim();
  if (!id) return json({ error: "Draft id is required." }, 400);

  await env.SUBSCRIBERS.prepare("DELETE FROM campaign_drafts WHERE id = ?1").bind(id).run();
  return json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* Shared delivery (used by scheduled sends + birthday emails)         */
/* ------------------------------------------------------------------ */

// Clean + de-duplicate + honour suppression + personalise + send + record.
// Returns { ok, sent, suppressed, invalid, errors }. No auth here — callers
// (the cron, and endpoints that already checked auth) are trusted.
async function deliverCampaign(env, origin, opts) {
  const subject = String((opts && opts.subject) || "").trim();
  const html = String((opts && opts.html) || "");
  const incoming = Array.isArray(opts && opts.recipients) ? opts.recipients : [];
  const audienceSource = String((opts && opts.audienceSource) || "scheduled").slice(0, 80);

  if (!subject || !html) return { ok: false, sent: 0, suppressed: 0, invalid: 0, errors: ["Missing subject or body."] };
  if (!env.RESEND_API_KEY) return { ok: false, sent: 0, suppressed: 0, invalid: 0, errors: ["RESEND_API_KEY missing."] };

  const seen = new Set();
  const clean = [];
  let invalid = 0;
  for (const row of incoming.slice(0, MAX_RECIPIENTS)) {
    const email = String((row && row.email) || "").trim().toLowerCase();
    if (!isEmail(email)) { invalid += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    clean.push({ email, name: String((row && row.name) || "").trim() });
  }
  if (!clean.length) return { ok: false, sent: 0, suppressed: 0, invalid, errors: ["No valid recipients."] };

  const kept = [];
  let suppressed = 0;
  for (const person of clean) {
    if (env.SUPPRESSION) {
      const hit = await env.SUPPRESSION.get(suppressionKey(person.email));
      if (hit) { suppressed += 1; continue; }
    }
    kept.push(person);
  }
  if (!kept.length) return { ok: false, sent: 0, suppressed, invalid, errors: ["All recipients have unsubscribed."] };

  const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <info@lumidermaesthetics.com>";
  const replyTo = env.REPLY_TO || null;
  const messages = [];
  for (const person of kept) {
    const unsubUrl = await buildUnsubscribeUrl(env, origin, person.email);
    const who = firstName(person.name) || "there";
    const personalised = html.replaceAll("{{name}}", escapeHtml(who)).replaceAll("{{unsubscribe}}", unsubUrl);
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
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (res.ok) sent += chunk.length;
    else {
      const text = await res.text();
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${res.status} ${text.slice(0, 200)}`);
    }
  }

  await recordCampaignSend(env, {
    subject, audienceSource, isTest: false,
    requested: incoming.length, sent, suppressed, invalid,
    status: errors.length ? "partial" : "sent", errors,
  });

  return { ok: errors.length === 0, sent, suppressed, invalid, errors };
}

/* ------------------------------------------------------------------ */
/* Cron: scheduled sends + birthday emails                             */
/* ------------------------------------------------------------------ */

async function runCron(event, env) {
  const origin = env.SITE_ORIGIN || "https://lumidermaesthetics.com";
  try { await sendDueScheduledCampaigns(env, origin); } catch (err) { /* keep going */ }
  try { await runBirthdayEmails(env, origin, event); } catch (err) { /* keep going */ }
}

async function sendDueScheduledCampaigns(env, origin) {
  if (!env.SUBSCRIBERS) return;
  const nowIso = new Date().toISOString();
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, subject, html, audience_source, recipients
       FROM scheduled_campaigns
      WHERE status='queued' AND send_at <= ?1
      ORDER BY send_at ASC LIMIT 10`
  ).bind(nowIso).all();

  for (const row of results || []) {
    // Claim it first so an overlapping run can't send it twice.
    const claim = await env.SUBSCRIBERS.prepare(
      "UPDATE scheduled_campaigns SET status='sending' WHERE id=?1 AND status='queued'"
    ).bind(row.id).run();
    if (!claim.meta || claim.meta.changes === 0) continue;

    let recips = [];
    try { recips = JSON.parse(row.recipients || "[]"); } catch { recips = []; }
    const result = await deliverCampaign(env, origin, {
      subject: row.subject, html: row.html,
      recipients: recips, audienceSource: row.audience_source || "scheduled",
    });
    const status = result.errors && result.errors.length ? "error" : "sent";
    const summary = ("Sent " + (result.sent || 0) +
      (result.suppressed ? " · " + result.suppressed + " suppressed" : "") +
      (result.errors && result.errors.length ? " · " + result.errors.join(" | ") : "")).slice(0, 300);
    await env.SUBSCRIBERS.prepare(
      "UPDATE scheduled_campaigns SET status=?1, sent_at=?2, result=?3 WHERE id=?4"
    ).bind(status, new Date().toISOString(), summary, row.id).run();
  }
}

async function runBirthdayEmails(env, origin, event) {
  if (!env.SUBSCRIBERS) return;
  const cfg = await getBirthdayConfig(env);
  if (!cfg.enabled) return;

  const now = new Date(event && event.scheduledTime ? event.scheduledTime : Date.now());
  const sendHour = Number.isInteger(cfg.hour) ? cfg.hour : 8;
  if (now.getUTCHours() !== sendHour) return; // once a day, at the send hour (UTC)

  const day = now.getUTCDate();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT email, first_name FROM subscribers
      WHERE status='confirmed' AND consent_email=1
        AND birth_day=?1 AND birth_month=?2
        AND (birthday_sent_year IS NULL OR birthday_sent_year < ?3)
      LIMIT ?4`
  ).bind(day, month, year, MAX_RECIPIENTS).all();

  const people = (results || []).map((r) => ({ email: r.email, name: r.first_name || "" }));
  if (!people.length) return;

  await deliverCampaign(env, origin, {
    subject: cfg.subject || "Happy birthday from Lumi Derm",
    html: cfg.html || defaultBirthdayHtml(),
    recipients: people, audienceSource: "birthday",
  });

  // Mark everyone matched (even if suppressed) so we never retry them this year.
  for (const p of people) {
    await env.SUBSCRIBERS.prepare(
      "UPDATE subscribers SET birthday_sent_year=?1 WHERE email=?2"
    ).bind(year, p.email).run();
  }
}

async function getBirthdayConfig(env) {
  const def = { enabled: false, subject: "Happy birthday from Lumi Derm 🎂", html: defaultBirthdayHtml(), hour: 8 };
  if (!env.SUBSCRIBERS) return def;
  try {
    const row = await env.SUBSCRIBERS.prepare("SELECT value FROM app_settings WHERE key='birthday'").first();
    if (row && row.value) {
      const v = JSON.parse(row.value);
      return {
        enabled: v.enabled === true,
        subject: typeof v.subject === "string" && v.subject ? v.subject : def.subject,
        html: typeof v.html === "string" && v.html ? v.html : def.html,
        hour: Number.isInteger(v.hour) ? v.hour : def.hour,
      };
    }
  } catch { /* fall through to default */ }
  return def;
}

function defaultBirthdayHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border-radius:4px;">
<tr><td align="center" style="padding:40px 40px 8px;">
<p style="margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:.16em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p>
</td></tr>
<tr><td style="padding:20px 40px 8px;">
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:26px;color:#1c1a18;">Happy birthday, {{name}}!</h1>
<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#4a443e;">Wishing you a wonderful day from all of us at Lumi Derm. To help you celebrate, enjoy a little birthday treat on your next visit this month.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#1c1a18" style="border-radius:2px;">
<a href="https://lumidermaesthetics.com/pages/booking.html" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#fff;text-decoration:none;">Book your birthday treat</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:28px 40px 36px;">
<p style="margin:0;border-top:1px solid #e8e2db;padding-top:22px;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#a2968a;">Lumi Derm Aesthetics &middot; London Docklands &middot; <a href="{{unsubscribe}}" style="color:#a2968a;">unsubscribe</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Admin: scheduling + birthday config endpoints                       */
/* ------------------------------------------------------------------ */

async function handleScheduleCampaign(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Scheduling isn't set up yet." }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }

  const subject = String(body.subject || "").trim();
  const html = String(body.html || "");
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  const audienceSource = String(body.audienceSource || "scheduled").slice(0, 80);
  const sendAtRaw = String(body.sendAt || "").trim();

  if (!subject) return json({ error: "Subject is required." }, 400);
  if (!html) return json({ error: "Email body is required." }, 400);
  if (!recipients.length) return json({ error: "No recipients." }, 400);
  if (recipients.length > MAX_RECIPIENTS) return json({ error: `Too many recipients (max ${MAX_RECIPIENTS}).` }, 400);

  const when = new Date(sendAtRaw);
  if (isNaN(when.getTime())) return json({ error: "Pick a valid date and time." }, 400);
  if (when.getTime() < Date.now() - 60 * 1000) return json({ error: "That time is in the past — pick a future time." }, 400);

  const cleanRecipients = recipients
    .map((r) => ({ email: String((r && r.email) || "").trim().toLowerCase(), name: String((r && r.name) || "").trim() }))
    .filter((r) => isEmail(r.email));
  if (!cleanRecipients.length) return json({ error: "No valid recipients." }, 400);

  await env.SUBSCRIBERS.prepare(
    `INSERT INTO scheduled_campaigns (subject, html, audience_source, recipients, send_at, status, created_at)
     VALUES (?1,?2,?3,?4,?5,'queued',?6)`
  ).bind(
    subject.slice(0, 240), html, audienceSource,
    JSON.stringify(cleanRecipients), when.toISOString(), new Date().toISOString()
  ).run();

  await logAudit(env, request, {
    action: "campaign.schedule",
    detail: '"' + subject + '" for ' + when.toISOString() + " — " + cleanRecipients.length + " recipients",
    status: "ok",
  });
  return json({ ok: true, scheduledFor: when.toISOString(), recipients: cleanRecipients.length });
}

async function handleListScheduled(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Scheduling isn't set up yet." }, 500);

  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, subject, audience_source, send_at, status, created_at, sent_at, result, recipients
       FROM scheduled_campaigns
      ORDER BY (status='queued') DESC, send_at DESC
      LIMIT 40`
  ).all();

  const list = (results || []).map((r) => {
    let count = 0;
    try { count = JSON.parse(r.recipients || "[]").length; } catch { count = 0; }
    return {
      id: r.id, subject: r.subject, audience_source: r.audience_source,
      send_at: r.send_at, status: r.status, created_at: r.created_at,
      sent_at: r.sent_at, result: r.result, recipient_count: count,
    };
  });
  return json({ ok: true, scheduled: list });
}

async function handleCancelScheduled(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Scheduling isn't set up yet." }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const id = parseInt(body.id, 10);
  if (!id) return json({ error: "Campaign id is required." }, 400);

  const res = await env.SUBSCRIBERS.prepare(
    "UPDATE scheduled_campaigns SET status='cancelled' WHERE id=?1 AND status='queued'"
  ).bind(id).run();
  const changed = res.meta && res.meta.changes ? res.meta.changes : 0;
  if (!changed) return json({ error: "That campaign has already sent or been cancelled." }, 409);
  await logAudit(env, request, { action: "campaign.cancel", detail: "scheduled campaign id " + id, status: "ok" });
  return json({ ok: true });
}

async function handleGetBirthday(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  const cfg = await getBirthdayConfig(env);
  return json({ ok: true, birthday: cfg });
}

async function handleSetBirthday(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Settings aren't set up yet." }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }

  const hour = clampInt(body.hour, 0, 23);
  const cfg = {
    enabled: body.enabled === true,
    subject: String(body.subject || "").slice(0, 240) || "Happy birthday from Lumi Derm",
    html: String(body.html || "") || defaultBirthdayHtml(),
    hour: hour === null ? 8 : hour,
  };
  const now = new Date().toISOString();
  await env.SUBSCRIBERS.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('birthday', ?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value=?1, updated_at=?2`
  ).bind(JSON.stringify(cfg), now).run();

  await logAudit(env, request, {
    action: "birthday.config",
    detail: "enabled=" + cfg.enabled + ", hour=" + cfg.hour,
    status: "ok",
  });
  return json({ ok: true, birthday: cfg });
}

// Send the birthday email to one address (the admin, or a supplied one) as a preview.
async function handleTestBirthday(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.RESEND_API_KEY) return json({ error: "RESEND_API_KEY is missing." }, 500);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const to = String(body.to || admin.email || "").trim().toLowerCase();
  if (!isEmail(to)) return json({ error: "No valid address to send the test to." }, 400);

  const cfg = await getBirthdayConfig(env);
  const origin = env.SITE_ORIGIN || "https://lumidermaesthetics.com";
  // Preview the on-screen (possibly unsaved) content if provided, else the saved config.
  const subjectRaw = String(body.subject || "").trim() || cfg.subject || "Happy birthday from Lumi Derm";
  const htmlRaw = String(body.html || "") || cfg.html || defaultBirthdayHtml();
  // Bypass suppression for a test to the admin's own inbox.
  const unsubUrl = await buildUnsubscribeUrl(env, origin, to);
  const who = firstName(body.name) || "there";
  const html = htmlRaw.replaceAll("{{name}}", escapeHtml(who)).replaceAll("{{unsubscribe}}", unsubUrl);
  const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <info@lumidermaesthetics.com>";
  const message = { from, to: [to], subject: subjectRaw.replaceAll("{{name}}", who), html };
  if (env.REPLY_TO) message.reply_to = env.REPLY_TO;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) { const t = await res.text(); return json({ error: "Test send failed: " + t.slice(0, 200) }, 502); }
  await logAudit(env, request, { action: "birthday.test", detail: "to " + to, status: "ok" });
  return json({ ok: true, sentTo: to });
}

/* ------------------------------------------------------------------ */
/* Admin: GitHub publishing proxy                                      */
/* ------------------------------------------------------------------ */
/* The admin publishes site data (offers/reviews/prices/page text/images)
   by committing to GitHub. The token is a Cloudflare secret (GITHUB_TOKEN),
   never sent to the browser. The admin calls this proxy (behind Access +
   ADMIN_EMAILS); the Worker injects the token, owns the repo/branch, and
   only allows writes to the site's own data + page files. */

const GITHUB_PATH_ALLOW = [
  /^lumi-derm-website\/assets\/data\/(offers|reviews|prices|content)\.json$/,
  /^lumi-derm-website\/index\.html$/,
  /^lumi-derm-website\/pages\/[a-z0-9-]+\.html$/,
  /^lumi-derm-website\/assets\/images\/[A-Za-z0-9._-]+\.(webp|jpe?g|png|gif|avif)$/i,
];
function githubPathAllowed(path) {
  return GITHUB_PATH_ALLOW.some((re) => re.test(path));
}

async function handleGithubHealth(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);

  const configured = Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO);
  const base = { ok: true, configured, repo: env.GITHUB_REPO || null, branch: env.GITHUB_BRANCH || "main" };

  // Cheap check (page load): just report whether the secret + repo are set.
  const url = new URL(request.url);
  if (url.searchParams.get("probe") !== "1" || !configured) return json(base);

  // Live probe (button): actually call GitHub with the token to confirm it works
  // and can write. Reading the repo object returns a permissions.push flag for the
  // token — a non-destructive way to verify write access.
  try {
    const res = await fetch("https://api.github.com/repos/" + env.GITHUB_REPO, {
      headers: {
        Authorization: "Bearer " + env.GITHUB_TOKEN,
        Accept: "application/vnd.github+json",
        "User-Agent": "LumiDerm-Admin-Worker",
      },
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const canWrite = data && data.permissions ? Boolean(data.permissions.push || data.permissions.admin) : null;
      return json({ ...base, probed: true, reachable: true, status: res.status, canWrite });
    }
    let message = "";
    try { message = (await res.json()).message || ""; } catch { /* ignore */ }
    return json({ ...base, probed: true, reachable: false, status: res.status, error: message });
  } catch (err) {
    return json({ ...base, probed: true, reachable: false, error: (err && err.message) || "Network error." });
  }
}

async function handleGithubProxy(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return json({ error: "GitHub publishing isn't configured on the server yet. Ask Dima to set the GITHUB_TOKEN secret." }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }

  const method = String(body.method || "GET").toUpperCase();
  if (["GET", "PUT", "DELETE"].indexOf(method) === -1) return json({ error: "Method not allowed." }, 405);

  const path = String(body.path || "").replace(/^\/+/, "");
  if (!githubPathAllowed(path)) return json({ error: "That file path is not allowed for publishing." }, 403);

  const branch = env.GITHUB_BRANCH || "main";
  let url = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/" + path;
  const init = {
    method,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "LumiDerm-Admin-Worker",
      "Content-Type": "application/json",
    },
  };
  if (method === "GET") {
    url += "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now();
  } else {
    const payload = { branch };
    if (typeof body.message === "string") payload.message = body.message;
    if (typeof body.content === "string") payload.content = body.content;
    if (typeof body.sha === "string" && body.sha) payload.sha = body.sha;
    init.body = JSON.stringify(payload);
  }

  const ghRes = await fetch(url, init);
  if (method !== "GET") {
    const act = githubAction(path, method);
    if (act) await logAudit(env, request, { action: act, detail: path, status: ghRes.ok ? "ok" : ("error " + ghRes.status) });
  }
  // Forward GitHub's status + JSON body verbatim, so the admin's existing publish
  // logic (sha handling, 409 retry, base64 decode) keeps working unchanged.
  const text = await ghRes.text();
  return new Response(text, {
    status: ghRes.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/* ------------------------------------------------------------------ */
/* Admin: audit log                                                    */
/* ------------------------------------------------------------------ */
// Best-effort, server-side record of who did what. Never throws — a logging
// failure must not break the real action.
async function logAudit(env, request, entry) {
  if (!env.SUBSCRIBERS) return;
  try {
    await env.SUBSCRIBERS.prepare(
      `INSERT INTO admin_audit_log (created_at, actor, action, detail, ip, status)
       VALUES (?1,?2,?3,?4,?5,?6)`
    ).bind(
      new Date().toISOString(),
      String((entry && entry.actor) || (request ? adminEmail(request) : "") || "").slice(0, 160),
      String((entry && entry.action) || "unknown").slice(0, 80),
      String((entry && entry.detail) || "").slice(0, 500),
      request ? (request.headers.get("cf-connecting-ip") || "") : "",
      String((entry && entry.status) || "ok").slice(0, 24)
    ).run();
  } catch (err) { /* audit logging is best-effort */ }
}

// Friendly action name for a GitHub publish path. Only the data files + images
// are logged (rendered .html files are part of a json publish already logged).
function githubAction(path, method) {
  if (method === "DELETE") return "delete.image";
  if (/offers\.json$/.test(path)) return "publish.offers";
  if (/reviews\.json$/.test(path)) return "publish.reviews";
  if (/prices\.json$/.test(path)) return "publish.prices";
  if (/content\.json$/.test(path)) return "publish.pages";
  if (/assets\/images\//.test(path)) return "upload.image";
  return null; // .html files: skip (already covered by the json publish)
}

async function handleAuditList(request, env) {
  // auth already enforced by the central gate
  if (!env.SUBSCRIBERS) return json({ error: "Audit log isn't set up yet." }, 500);
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, created_at, actor, action, detail, ip, status
       FROM admin_audit_log ORDER BY created_at DESC LIMIT 100`
  ).all();
  return json({ ok: true, entries: results || [] });
}

// Lets the admin record a client-only action (e.g. CSV export) in the log.
async function handleAuditLogClient(request, env) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const action = String(body.action || "").slice(0, 80);
  if (!action) return json({ error: "action is required." }, 400);
  await logAudit(env, request, { action, detail: String(body.detail || "").slice(0, 500), status: "ok" });
  return json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* System status helpers                                               */
/* ------------------------------------------------------------------ */
function deployInfo(env) {
  const v = env.CF_VERSION_METADATA;
  if (!v) return null;
  return { id: v.id ? String(v.id).slice(0, 8) : null, tag: v.tag || null, timestamp: v.timestamp || null };
}

async function lastSuccessfulSend(env) {
  if (!env.SUBSCRIBERS) return null;
  try {
    const row = await env.SUBSCRIBERS.prepare(
      `SELECT subject, sent_count, created_at FROM campaign_sends
        WHERE status IN ('sent','partial') AND sent_count > 0
        ORDER BY created_at DESC LIMIT 1`
    ).first();
    if (!row) return null;
    return { subject: row.subject, sent: row.sent_count, at: row.created_at };
  } catch (err) { return null; }
}

/* ------------------------------------------------------------------ */
/* Media library (Cloudflare R2)                                       */
/* ------------------------------------------------------------------ */
// Uploaded images live in R2 under "uploads/". They're served publicly at
// /media/<key> (used by offer cards, page content, and email campaigns).

const MEDIA_PREFIX = "uploads/";
const MEDIA_MAX_BYTES = 6 * 1024 * 1024; // 6MB

function extFromType(type) {
  const map = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
  return map[String(type).toLowerCase()] || "img";
}
function randHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Public: serve an image from R2 with long cache headers.
async function handleMediaServe(request, env, url) {
  if (!env.MEDIA) return new Response("Media storage not configured.", { status: 404 });
  const key = decodeURIComponent(url.pathname.slice("/media/".length));
  if (!key || key.indexOf("..") !== -1 || !key.startsWith(MEDIA_PREFIX)) {
    return new Response("Not found.", { status: 404 });
  }
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Not found.", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (obj.httpEtag) headers.set("etag", obj.httpEtag);
  return new Response(obj.body, { headers });
}

// Admin: upload an image (multipart/form-data, field "file") to R2.
async function handleMediaUpload(request, env) {
  if (!env.MEDIA) return json({ error: "Media storage isn't set up yet. Ask Dima to create the R2 bucket." }, 503);
  const ctype = request.headers.get("content-type") || "";
  if (ctype.indexOf("multipart/form-data") === -1) return json({ error: "Upload must be multipart/form-data." }, 400);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Could not read the upload." }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "No image file was sent." }, 400);
  const type = file.type || "";
  if (!/^image\//i.test(type)) return json({ error: "That file is not an image." }, 400);
  if (file.size > MEDIA_MAX_BYTES) return json({ error: "That image is larger than 6MB — please use a smaller one." }, 400);

  const key = MEDIA_PREFIX + Date.now().toString(36) + "-" + randHex(4) + "." + extFromType(type);
  const buf = await file.arrayBuffer();
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  await logAudit(env, request, { action: "media.upload", detail: key + " (" + Math.round(file.size / 1024) + "KB)", status: "ok" });

  const origin = new URL(request.url).origin;
  return json({ ok: true, key, url: "/media/" + key, absoluteUrl: origin + "/media/" + key });
}

// Admin: list uploaded images (newest first).
async function handleMediaList(request, env) {
  if (!env.MEDIA) return json({ ok: true, media: [], configured: false });
  const listing = await env.MEDIA.list({ prefix: MEDIA_PREFIX, limit: 1000 });
  const media = (listing.objects || []).map((o) => ({
    key: o.key, url: "/media/" + o.key, size: o.size, uploaded: o.uploaded,
  }));
  media.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());
  return json({ ok: true, media, configured: true });
}

// Admin: delete an uploaded image.
async function handleMediaDelete(request, env) {
  if (!env.MEDIA) return json({ error: "Media storage isn't set up yet." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const key = String(body.key || "");
  if (!key.startsWith(MEDIA_PREFIX) || key.indexOf("..") !== -1) return json({ error: "That image can't be deleted." }, 400);
  await env.MEDIA.delete(key);
  await logAudit(env, request, { action: "media.delete", detail: key, status: "ok" });
  return json({ ok: true });
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

  // A completed double opt-in is a fresh, deliberate consent (only the mailbox
  // owner can click the link), so clear any prior unsubscribe suppression.
  if (env.SUPPRESSION) { try { await env.SUPPRESSION.delete(suppressionKey(row.email)); } catch (err) { /* non-fatal */ } }

  await logAudit(env, null, { actor: row.email, action: "subscriber.optin", detail: "double opt-in confirmed", status: "ok" });

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

  if (env.SUPPRESSION) { try { await env.SUPPRESSION.delete(suppressionKey(email)); } catch (err) { /* non-fatal */ } }
  await logAudit(env, null, { actor: email, action: "subscriber.optin", detail: "double opt-in confirmed (legacy link)", status: "ok" });

  return htmlPage(
    "You're subscribed",
    `Thank you — <strong>${escapeHtml(email)}</strong> is confirmed. You'll be first to hear about our offers.<br><br>You can unsubscribe from any email at any time.`,
    200
  );
}

async function handleListSubscribers(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
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
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
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
  await logAudit(env, request, { action: "subscriber.delete", detail: email, status: "ok" });
  return json({ ok: true });
}

function authorised(request, env) {
  const email = adminEmail(request);
  if (!email) {
    return { ok: false, reason: "Cloudflare Access sign-in is required." };
  }

  const allowed = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length && !allowed.includes(email.toLowerCase())) {
    return { ok: false, reason: "This Access user is not allowed to manage admin data." };
  }

  return { ok: true, email };
}

function adminEmail(request) {
  return String(
    request.headers.get("cf-access-authenticated-user-email") ||
    request.headers.get("CF-Access-Authenticated-User-Email") ||
    request.headers.get("cf-access-user-email") ||
    ""
  ).trim().toLowerCase();
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

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "draft_" + base64Url(bytes.buffer);
}

function safeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
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
  const secret = env.UNSUB_SECRET || "lumi-derm-fallback";
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

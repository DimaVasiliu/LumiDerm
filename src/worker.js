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
 *   GET  /admin/api/campaign/history — admin: recent send history (with unique clicks, CTR, attribution)
 *   GET  /admin/api/campaign/analytics?id= — admin: per-link clicks for one campaign
 *   POST /admin/api/campaign/attribution — admin: record bookings/revenue for a campaign
 *   GET  /admin/api/campaign/drafts — admin: list saved campaign drafts
 *   POST /admin/api/campaign/drafts — admin: save campaign draft
 *   POST /admin/api/campaign/drafts/delete — admin: delete campaign draft
 *   GET  /api/unsubscribe         — one-click unsubscribe landing page
 *   POST /api/unsubscribe         — RFC 8058 one-click unsubscribe
 *   GET  /api/preferences         — subscriber preference centre
 *   POST /api/preferences         — save subscriber preferences
 *   GET  /api/click               — tracked campaign-link redirect
 *   POST /api/subscribe           — newsletter signup (double opt-in)
 *   GET  /api/reviews             — public: live homepage reviews (approved, featured first)
 *   POST /api/reviews             — public: submit a client review (pending moderation)
 *   GET  /admin/api/reviews       — admin: all reviews + summary (manager UI)
 *   POST /admin/api/reviews/save  — admin: replace reviews + summary (instant, live)
 *   GET  /admin/api/reviews/google — admin: recent Google Business reviews to import
 *   GET  /admin/api/revisions     — admin: recent version-history snapshots (metadata)
 *   POST /admin/api/revisions     — admin: record a snapshot (offers/prices/content)
 *   GET  /admin/api/revisions/item?id= — admin: one snapshot incl. payload (for restore)
 *   GET  /admin/api/deploy-status — admin: latest commit (repo HEAD) + live deploy version
 *   GET  /admin/api/reviews/submissions — admin: pending website review submissions
 *   POST /admin/api/reviews/submissions/resolve — admin: import/reject a submission
 *   GET  /api/subscribe/confirm   — double opt-in confirmation link
 *   GET  /admin/api/subscribers   — admin: list subscribers
 *   POST /admin/api/subscribers/import — admin: import consented subscribers from CSV
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
 *   GET  /admin/api/birthdays     — admin: subscribers with a birthday today / soon
 *   POST /admin/api/birthdays/send — admin: send the birthday email to one person
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
 *   GOOGLE_PLACES_API_KEY — optional: Google Places API key, to import Google
 *                      Business reviews. Set with: npx wrangler secret put GOOGLE_PLACES_API_KEY
 *   GOOGLE_PLACE_ID  — optional: the clinic's Google Place ID (a Var, not secret).
 *   RESEND_WEBHOOK_SECRET — optional: Svix signing secret (whsec_...) from the
 *                      Resend webhook. When set, POST /api/resend-webhook
 *                      auto-suppresses hard bounces + spam complaints.
 *
 * Vars:
 *   ADMIN_EMAILS     — optional comma-separated Access emails allowed for admin API.
 *                      If omitted, any Cloudflare Access-authenticated user is accepted.
 *   ADMIN_OWNER_EMAILS — optional comma-separated owner emails. If set, only owners
 *                      can send, publish, export/import/delete personal data.
 *   ADMIN_EDITOR_EMAILS — optional comma-separated assistant/editor emails.
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
const GOOGLE_REVIEW_URL = "https://www.google.com/search?client=mobilesearchapp&sca_esv=89317be53c67f56a&channel=iss&cs=0&hl=en_GB&rlz=1MDAPLA_en-GBGB1173GB1173&v=432.8.954074404&output=search&kgmid=%2Fg%2F11zkv1js2p&q=Lumi%20Derm%20Aesthetics&shem=epsd1%2Cltae%2Crimspwouoe&shndl=30&source=sh%2Fx%2Floc%2Fact%2Fm1%2F5&kgs=0f7f27e36b2d2ca9";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonical host: send www.* to the bare domain (301), preserving path +
    // query. Only fires if a www request actually reaches the Worker (i.e. www
    // is routed here); harmless otherwise.
    if (url.hostname.startsWith("www.")) {
      const apex = url.hostname.slice(4);
      return Response.redirect(
        "https://" + apex + url.pathname + url.search,
        301
      );
    }

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
            role: admin.role || "owner",
            resend: Boolean(env.RESEND_API_KEY),
            unsubSecret: Boolean(env.UNSUB_SECRET),
            suppression: Boolean(env.SUPPRESSION),
            subscribers: Boolean(env.SUBSCRIBERS),
            github: Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO),
            media: Boolean(env.MEDIA),
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
      if (apiPath === "/api/preferences" && isPublicApi) {
        if (request.method === "GET") return handlePreferencesGet(request, env, url);
        if (request.method === "POST") return handlePreferencesPost(request, env, url);
        return json({ error: "Use GET or POST." }, 405);
      }
      if (apiPath === "/api/click" && isPublicApi) {
        return handleTrackedClick(request, env, url);
      }
      // Resend delivery webhooks: hard bounces + complaints auto-suppress the
      // address, protecting sender reputation. Signature-verified (Svix).
      if (apiPath === "/api/resend-webhook" && isPublicApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleResendWebhook(request, env);
      }

      if (apiPath === "/api/campaign/send" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "send campaigns");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleSend(request, env, url);
      }

      if (apiPath === "/api/campaign/history" && isAdminApi) {
        return handleCampaignHistory(request, env);
      }

      if (apiPath === "/api/campaign/analytics" && isAdminApi) {
        return handleCampaignAnalytics(request, env, url);
      }
      if (apiPath === "/api/campaign/attribution" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "record booking/revenue attribution");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleCampaignAttribution(request, env);
      }

      if (apiPath === "/api/campaign/drafts" && isAdminApi) {
        if (request.method === "GET") return handleListCampaignDrafts(request, env);
        if (request.method === "POST") return handleSaveCampaignDraft(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      if (apiPath === "/api/campaign/drafts/delete" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "delete saved campaigns");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleDeleteCampaignDraft(request, env);
      }

      if (apiPath === "/api/campaign/schedule" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "schedule campaigns");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleScheduleCampaign(request, env);
      }

      if (apiPath === "/api/campaign/scheduled" && isAdminApi) {
        return handleListScheduled(request, env);
      }

      if (apiPath === "/api/campaign/scheduled/cancel" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "cancel scheduled campaigns");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleCancelScheduled(request, env);
      }

      if (apiPath === "/api/settings/birthday" && isAdminApi) {
        if (request.method === "GET") return handleGetBirthday(request, env);
        const owner = requireOwner(request, env, "change birthday automation");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        if (request.method === "POST") return handleSetBirthday(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      if (apiPath === "/api/settings/birthday/test" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "send birthday previews");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleTestBirthday(request, env);
      }

      if (apiPath === "/api/github/health" && isAdminApi) {
        return handleGithubHealth(request, env);
      }

      if (apiPath === "/api/deploy-status" && isAdminApi) {
        return handleDeployStatus(request, env);
      }
      if (apiPath === "/api/alerts" && isAdminApi) {
        return handleAlerts(request, env);
      }

      if (apiPath === "/api/github" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "publish website changes");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleGithubProxy(request, env);
      }

      // Atomic publish: commit every changed file in ONE commit and keep the
      // CSP JSON-LD hash in sync, so a publish can never half-apply or break CI.
      if (apiPath === "/api/publish" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "publish website changes");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleAtomicPublish(request, env);
      }

      if (apiPath === "/api/audit" && isAdminApi) {
        if (request.method === "GET") return handleAuditList(request, env);
        const owner = requireOwner(request, env, "record export actions");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        if (request.method === "POST") return handleAuditLogClient(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      if (apiPath === "/api/reviews/submissions" && isAdminApi) {
        // Submissions carry client names + emails (personal data) → owner only.
        const owner = requireOwner(request, env, "view client review submissions");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleReviewSubmissions(request, env);
      }
      if (apiPath === "/api/reviews/submissions/resolve" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "moderate review submissions");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleReviewResolve(request, env);
      }
      if (apiPath === "/api/reviews" && isAdminApi) {
        // Reading the review list (no personal data) is fine for assistants.
        if (request.method === "GET") return handleAdminReviewsList(env);
        return json({ error: "Use GET." }, 405);
      }
      if (apiPath === "/api/reviews/save" && isAdminApi) {
        // Saving publishes reviews live on the homepage → owner only.
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "publish reviews");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleAdminReviewsSave(request, env);
      }
      if (apiPath === "/api/reviews/google" && isAdminApi) {
        return handleGoogleReviews(request, env);
      }

      // Durable version history (offers / prices / page text / reviews).
      if (apiPath === "/api/revisions/item" && isAdminApi) {
        return handleRevisionItem(request, env, url);
      }
      if (apiPath === "/api/revisions" && isAdminApi) {
        if (request.method === "GET") return handleRevisionsList(request, env, url);
        if (request.method === "POST") return handleRevisionCreate(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      if (apiPath === "/api/birthdays" && isAdminApi) {
        const owner = requireOwner(request, env, "view birthday subscriber data");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleBirthdaysList(request, env);
      }
      if (apiPath === "/api/birthdays/send" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "send birthday emails");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleBirthdaysSend(request, env);
      }
      // Birthday vouchers: list (owner), redeem/cancel (owner), capture campaign.
      if (apiPath === "/api/birthday/vouchers" && isAdminApi) {
        const owner = requireOwner(request, env, "view birthday vouchers");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleVoucherList(request, env);
      }
      if (apiPath === "/api/birthday/vouchers/resolve" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "redeem birthday vouchers");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleVoucherResolve(request, env);
      }
      if (apiPath === "/api/birthday/collect-campaign" && isAdminApi) {
        const owner = requireOwner(request, env, "send the birthday-collection email");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleBirthdayCollectCampaign(request, env);
      }

      if (apiPath === "/api/media" && isAdminApi) {
        return handleMediaList(request, env);
      }
      if (apiPath === "/api/media/upload" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "upload media");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleMediaUpload(request, env);
      }
      if (apiPath === "/api/media/delete" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "delete media");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleMediaDelete(request, env);
      }

      if (apiPath === "/api/subscribe" && isPublicApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleSubscribe(request, env, url);
      }

      if (apiPath === "/api/reviews" && isPublicApi) {
        if (request.method === "GET") return handlePublicReviews(env);
        if (request.method === "POST") return handleReviewSubmit(request, env);
        return json({ error: "Use GET or POST." }, 405);
      }

      // Public: "Ask us a question" form on the homepage FAQ. Emails the clinic.
      if (apiPath === "/api/ask" && isPublicApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleAskQuestion(request, env);
      }

      // Public: birthday voucher — validate a link token and take a venue-only
      // appointment request (never routes to Treatwell).
      if (apiPath === "/api/birthday/voucher" && isPublicApi) {
        if (request.method !== "GET") return json({ error: "Use GET." }, 405);
        return handleVoucherLookup(request, env, url);
      }
      if (apiPath === "/api/birthday/request" && isPublicApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleVoucherRequest(request, env);
      }
      // Public: "add your birthday" capture form (tokenised link from an email).
      if (apiPath === "/api/birthday/collect" && isPublicApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        return handleBirthdayCollect(request, env);
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
        const owner = requireOwner(request, env, "view subscriber personal data");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleListSubscribers(request, env);
      }

      if (apiPath === "/api/subscribers/import" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "import subscribers");
        if (!owner.ok) return json({ error: owner.reason }, 403);
        return handleImportSubscribers(request, env);
      }

      if (apiPath === "/api/subscribers/delete" && isAdminApi) {
        if (request.method !== "POST") return json({ error: "Use POST." }, 405);
        const owner = requireOwner(request, env, "delete subscribers");
        if (!owner.ok) return json({ error: owner.reason }, 403);
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
  const topic = String(body.topic || "").trim().toLowerCase();

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

  // Respect topic opt-ins, pause and the monthly cap (test sends bypass this).
  const pref = await filterByPreferences(env, kept, { topic, isTest });
  const audience = pref.kept;
  if (!audience.length) {
    return json({ error: "No one left after preferences (paused, topic turned off, or once-a-month cap).", sent: 0, suppressed, skipped: { paused: pref.paused, topicOut: pref.topicOut, capped: pref.capped } }, 400);
  }

  const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <hello@lumidermaesthetics.com>";
  const replyTo = env.REPLY_TO || null;
  const campaignId = isTest ? "test_" + randomId() : "cmp_" + randomId();

  const messages = [];
  for (const person of audience) {
    const unsubUrl = await buildUnsubscribeUrl(env, url.origin, person.email, campaignId);
    const preferencesUrl = await buildPreferencesUrl(env, url.origin, person.email);
    const who = firstName(person.name) || "there";
    let personalised = html
      .replaceAll("{{name}}", escapeHtml(who))
      .replaceAll("{{unsubscribe}}", unsubUrl)
      .replaceAll("{{preferences}}", preferencesUrl);
    personalised = await trackCampaignLinks(env, url.origin, personalised, campaignId, person.email);
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

  if (!isTest && sent > 0) await markEmailed(env, audience.map((p) => p.email));

  const payload = {
    ok: errors.length === 0,
    sent,
    suppressed,
    invalid,
    errors,
    skipped: { paused: pref.paused, topicOut: pref.topicOut, capped: pref.capped },
  };
  if (errors.length) {
    await recordCampaignEvent(env, { campaignId, eventType: "failed", detail: errors.join(" | ").slice(0, 500) });
  }

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
    campaignId,
    topic,
  });

  await logAudit(env, request, {
    action: isTest ? "campaign.test" : "campaign.send",
    detail: '"' + subject + '" — sent ' + sent + "/" + incoming.length + (suppressed ? ", " + suppressed + " suppressed" : ""),
    status: errors.length ? "error" : "ok",
  });

  return json({ ...payload, campaignId });
}

async function recordCampaignSend(env, detail) {
  if (!env.SUBSCRIBERS) return;
  try {
    await env.SUBSCRIBERS.prepare(
      `INSERT INTO campaign_sends
        (subject, audience_source, is_test, requested_count, sent_count, suppressed_count,
         invalid_count, status, error_summary, created_at, campaign_id, topic)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
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
      new Date().toISOString(),
      String(detail.campaignId || "").slice(0, 80),
      detail.topic ? String(detail.topic).slice(0, 40) : null
    ).run();
  } catch (err) {
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
    } catch (inner) { /* history must not block a real email send */ }
  }
}

async function handleCampaignHistory(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Campaign history isn't set up yet." }, 500);

  let results;
  try {
    ({ results } = await env.SUBSCRIBERS.prepare(
      `SELECT s.id, s.campaign_id, s.subject, s.audience_source, s.topic, s.is_test, s.requested_count, s.sent_count,
              s.suppressed_count, s.invalid_count, s.status, s.error_summary, s.created_at,
              COALESCE(SUM(CASE WHEN e.event_type='click' THEN 1 ELSE 0 END), 0) AS click_count,
              COUNT(DISTINCT CASE WHEN e.event_type='click' THEN e.email END) AS unique_clicks,
              COALESCE(SUM(CASE WHEN e.event_type='click' AND e.detail LIKE '%booking%' THEN 1 ELSE 0 END), 0) AS booking_clicks,
              COALESCE(SUM(CASE WHEN e.event_type='unsubscribe' THEN 1 ELSE 0 END), 0) AS unsubscribe_count,
              COALESCE(SUM(CASE WHEN e.event_type='failed' THEN 1 ELSE 0 END), 0) AS failed_count,
              a.bookings AS bookings, a.revenue AS revenue
       FROM campaign_sends s
       LEFT JOIN campaign_events e ON e.campaign_id = s.campaign_id
       LEFT JOIN campaign_attribution a ON a.campaign_id = s.campaign_id
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT 50`
    ).all());
  } catch {
    ({ results } = await env.SUBSCRIBERS.prepare(
      `SELECT id, subject, audience_source, is_test, requested_count, sent_count,
              suppressed_count, invalid_count, status, error_summary, created_at
       FROM campaign_sends
       ORDER BY created_at DESC
       LIMIT 50`
    ).all());
  }

  return json({ ok: true, history: results || [] });
}

// Per-campaign detail: which links were clicked, and by how many unique people.
async function handleCampaignAnalytics(request, env, url) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Analytics aren't set up yet." }, 500);
  const campaignId = String(url.searchParams.get("id") || "").slice(0, 80);
  if (!campaignId) return json({ error: "Missing campaign id." }, 400);

  const { results: links } = await env.SUBSCRIBERS.prepare(
    `SELECT detail AS url, COUNT(*) AS clicks, COUNT(DISTINCT email) AS unique_clicks
       FROM campaign_events
      WHERE campaign_id=?1 AND event_type='click'
      GROUP BY detail ORDER BY clicks DESC LIMIT 50`
  ).bind(campaignId).all();

  const totals = await env.SUBSCRIBERS.prepare(
    `SELECT COUNT(*) AS total_clicks,
            COUNT(DISTINCT CASE WHEN event_type='click' THEN email END) AS unique_clicks,
            COALESCE(SUM(CASE WHEN event_type='unsubscribe' THEN 1 ELSE 0 END),0) AS unsubscribes
       FROM campaign_events WHERE campaign_id=?1`
  ).bind(campaignId).first();

  const attribution = await env.SUBSCRIBERS.prepare(
    "SELECT bookings, revenue, note FROM campaign_attribution WHERE campaign_id=?1"
  ).bind(campaignId).first();

  return json({ ok: true, links: links || [], totals: totals || {}, attribution: attribution || null });
}

// Save the bookings + revenue a campaign is credited with (manual attribution).
async function handleCampaignAttribution(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Not set up yet." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const campaignId = String(body.campaign_id || "").slice(0, 80);
  if (!campaignId) return json({ error: "Missing campaign id." }, 400);
  const bookings = Math.max(0, parseInt(body.bookings, 10) || 0);
  const revenue = Math.max(0, Number(body.revenue) || 0);
  const note = String(body.note || "").slice(0, 300);
  await env.SUBSCRIBERS.prepare(
    `INSERT INTO campaign_attribution (campaign_id, bookings, revenue, note, updated_at)
     VALUES (?1,?2,?3,?4,?5)
     ON CONFLICT(campaign_id) DO UPDATE SET bookings=?2, revenue=?3, note=?4, updated_at=?5`
  ).bind(campaignId, bookings, revenue, note, new Date().toISOString()).run();
  await logAudit(env, request, { action: "campaign.attribution", detail: campaignId + " → " + bookings + " bookings, £" + revenue, status: "ok" });
  return json({ ok: true, bookings, revenue });
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
/* ---- Subscriber preferences: topic / pause / monthly cap enforcement ---- */
function topicColumn(topic) {
  return ({ offers: "pref_offers", skintips: "pref_skintips", news: "pref_news", birthday: "pref_birthday" })[topic] || null;
}

// Load preference rows for a set of emails into a Map keyed by lowercase email.
async function loadPreferenceMap(env, emails) {
  const map = new Map();
  if (!env.SUBSCRIBERS || !emails.length) return map;
  const uniq = [...new Set(emails.map((e) => String(e || "").toLowerCase()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const ph = chunk.map((_, j) => "?" + (j + 1)).join(",");
    try {
      const { results } = await env.SUBSCRIBERS.prepare(
        `SELECT email, pref_offers, pref_skintips, pref_news, pref_birthday, pref_frequency, pause_until, last_emailed_at
           FROM subscribers WHERE email IN (${ph})`
      ).bind(...chunk).all();
      (results || []).forEach((r) => map.set(String(r.email).toLowerCase(), r));
    } catch { /* columns may not exist pre-migration — treat as no preferences */ }
  }
  return map;
}

// Filter recipients by their preferences. Test sends bypass everything. Returns
// the kept list plus counts of who was skipped and why (for reporting).
async function filterByPreferences(env, people, opts) {
  opts = opts || {};
  if (opts.isTest) return { kept: people, paused: 0, topicOut: 0, capped: 0 };
  const map = await loadPreferenceMap(env, people.map((p) => p.email));
  if (!map.size) return { kept: people, paused: 0, topicOut: 0, capped: 0 };
  const nowMs = Date.now();
  const col = topicColumn(opts.topic);
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const kept = [];
  let paused = 0, topicOut = 0, capped = 0;
  for (const p of people) {
    const r = map.get(String(p.email).toLowerCase());
    if (r) {
      if (r.pause_until && Date.parse(r.pause_until) > nowMs) { paused += 1; continue; }
      if (col && Number(r[col]) === 0) { topicOut += 1; continue; }
      if (String(r.pref_frequency) === "monthly" && r.last_emailed_at && (nowMs - Date.parse(r.last_emailed_at)) < monthMs) { capped += 1; continue; }
    }
    kept.push(p);
  }
  return { kept, paused, topicOut, capped };
}

// Stamp last_emailed_at after a real send so the monthly cap works next time.
async function markEmailed(env, emails) {
  if (!env.SUBSCRIBERS || !emails.length) return;
  const now = new Date().toISOString();
  const uniq = [...new Set(emails.map((e) => String(e || "").toLowerCase()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const ph = chunk.map((_, j) => "?" + (j + 2)).join(",");
    try {
      await env.SUBSCRIBERS.prepare(
        `UPDATE subscribers SET last_emailed_at=?1 WHERE email IN (${ph})`
      ).bind(now, ...chunk).run();
    } catch { /* pre-migration: ignore */ }
  }
}

async function deliverCampaign(env, origin, opts) {
  const subject = String((opts && opts.subject) || "").trim();
  const incoming = Array.isArray(opts && opts.recipients) ? opts.recipients : [];
  const audienceSource = String((opts && opts.audienceSource) || "scheduled").slice(0, 80);
  const html = isBirthdayAudience(audienceSource)
    ? sanitizeBirthdayEmailHtml(opts && opts.html)
    : String((opts && opts.html) || "");

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

  // Honour topic opt-ins, pause, and the monthly frequency cap. Birthday sends
  // pass skipPreferenceFilter — their own opt-in + pause is already applied and
  // a birthday greeting shouldn't be blocked by the monthly cap.
  const pref = (opts && opts.skipPreferenceFilter)
    ? { kept, paused: 0, topicOut: 0, capped: 0 }
    : await filterByPreferences(env, kept, { topic: opts && opts.topic, isTest: false });
  const audience = pref.kept;
  if (!audience.length) return { ok: false, sent: 0, suppressed, invalid, errors: ["No recipients after preferences (paused, topic off, or frequency cap)."] };

  const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <info@lumidermaesthetics.com>";
  const replyTo = env.REPLY_TO || null;
  const campaignId = "cmp_" + randomId();
  const messages = [];
  for (const person of audience) {
    const unsubUrl = await buildUnsubscribeUrl(env, origin, person.email, campaignId);
    const preferencesUrl = await buildPreferencesUrl(env, origin, person.email);
    const who = firstName(person.name) || "there";
    let personalised = html
      .replaceAll("{{name}}", escapeHtml(who))
      .replaceAll("{{unsubscribe}}", unsubUrl)
      .replaceAll("{{preferences}}", preferencesUrl);
    if (personalised.includes("{{birthday_capture}}")) {
      personalised = personalised.replaceAll("{{birthday_capture}}", await buildBirthdayCaptureUrl(env, origin, person.email));
    }
    // Birthday sends: mint a unique venue-only voucher per recipient and inject
    // the code + tokenised redemption link (with a fallback block if the template
    // forgot the tokens).
    if (isBirthdayAudience(audienceSource)) {
      try {
        const voucher = await mintBirthdayVoucher(env, origin, person);
        if (voucher) personalised = applyVoucherTokens(personalised, voucher);
      } catch (err) { /* if minting fails, still send the greeting */ }
    }
    personalised = await trackCampaignLinks(env, origin, personalised, campaignId, person.email);
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

  if (sent > 0) await markEmailed(env, audience.map((p) => p.email));

  await recordCampaignSend(env, {
    subject, audienceSource, isTest: false,
    requested: incoming.length, sent, suppressed, invalid,
    status: errors.length ? "partial" : "sent", errors, campaignId,
    topic: (opts && opts.topic) || null,
  });
  if (errors.length) {
    await recordCampaignEvent(env, { campaignId, eventType: "failed", detail: errors.join(" | ").slice(0, 500) });
  }

  return { ok: errors.length === 0, sent, suppressed, invalid, errors, campaignId, skipped: { paused: pref.paused, topicOut: pref.topicOut, capped: pref.capped } };
}

const BIRTHDAY_REQUEST_URL = "https://lumidermaesthetics.com/pages/birthday-treat.html";
function isBirthdayAudience(source) {
  return /^birthday\b/i.test(String(source || ""));
}
function sanitizeBirthdayEmailHtml(html) {
  return String(html || "")
    .replace(/href="https?:\/\/(?:www\.)?treatwell\.co\.uk[^"]*"/gi, 'href="' + BIRTHDAY_REQUEST_URL + '"')
    .replace(/href="https?:\/\/lumidermaesthetics\.com\/pages\/booking\.html[^"]*"/gi, 'href="' + BIRTHDAY_REQUEST_URL + '"')
    .replace(/>Book your birthday treat</g, ">Request your birthday treat<")
    .replace(/>Book</g, ">Contact<");
}

/* ---- Birthday vouchers: unique venue-only 15% code, 30-day window ---- */
const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
const VOUCHER_DAYS = 30;
const VOUCHER_DISCOUNT = 15;

function randomFromAlphabet(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < n; i += 1) out += VOUCHER_ALPHABET[bytes[i] % VOUCHER_ALPHABET.length];
  return out;
}
function randomVoucherToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function formatVoucherDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: LONDON_TIME_ZONE });
}
function birthdayPageLink(origin, token) {
  return `${origin}/pages/birthday-treat.html?t=${token}`;
}

// Create one voucher row and return the code + tokenised link for the email.
async function mintBirthdayVoucher(env, origin, person) {
  if (!env.SUBSCRIBERS) return null;
  const issued = new Date();
  const expires = new Date(issued.getTime() + VOUCHER_DAYS * 24 * 60 * 60 * 1000);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = "BDAY-" + randomFromAlphabet(5);
    const token = randomVoucherToken();
    try {
      await env.SUBSCRIBERS.prepare(
        `INSERT INTO birthday_vouchers (code, token, email, subscriber_id, name, discount, status, issued_at, expires_at)
         VALUES (?1,?2,?3,(SELECT id FROM subscribers WHERE email=?3),?4,?5,'active',?6,?7)`
      ).bind(code, token, person.email, person.name || "", VOUCHER_DISCOUNT, issued.toISOString(), expires.toISOString()).run();
      return { code, token, discount: VOUCHER_DISCOUNT, link: birthdayPageLink(origin, token), expiryLabel: formatVoucherDate(expires.toISOString()) };
    } catch (err) {
      if (attempt === 5) throw err; // unique collision — retried with fresh values
    }
  }
  return null;
}

// A throwaway voucher for the admin test/preview send (nothing is stored).
function sampleVoucher(origin) {
  const expires = new Date(Date.now() + VOUCHER_DAYS * 24 * 60 * 60 * 1000);
  return {
    code: "BDAY-SAMPLE", token: "sample" + randomVoucherToken().slice(0, 10),
    discount: VOUCHER_DISCOUNT, link: birthdayPageLink(origin, "sample" + randomVoucherToken().slice(0, 10)),
    expiryLabel: formatVoucherDate(expires.toISOString()),
  };
}

// Fill the {{birthday_*}} tokens; if the template forgot them, append a block so
// every birthday email always carries the code + redemption link.
function applyVoucherTokens(html, v) {
  let out = String(html || "")
    .replaceAll("{{birthday_code}}", escapeHtml(v.code))
    .replaceAll("{{birthday_link}}", v.link)
    .replaceAll("{{birthday_expiry}}", escapeHtml(v.expiryLabel))
    .replaceAll("{{discount}}", String(v.discount));
  if (!out.includes(v.code)) {
    const block = voucherFallbackBlock(v);
    out = out.includes("</body>") ? out.replace("</body>", block + "</body>") : out + block;
  }
  return out;
}

function voucherFallbackBlock(v) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;"><tr><td align="center" style="padding:8px 16px 32px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border-radius:4px;">
<tr><td align="center" style="padding:28px 40px 32px;">
<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#a2968a;">Your birthday treat</p>
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;color:#1c1a18;">${v.discount}% off one treatment</p>
<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;color:#4a443e;">Code <strong>${escapeHtml(v.code)}</strong> &middot; valid until ${escapeHtml(v.expiryLabel)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td align="center" bgcolor="#1c1a18" style="border-radius:2px;">
<a href="${v.link}" style="display:inline-block;padding:14px 34px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#fff;text-decoration:none;">Request birthday appointment</a>
</td></tr></table>
<p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#a2968a;">Redeemed and paid for at Lumi Derm only. Not valid for Treatwell bookings.</p>
</td></tr></table></td></tr></table>`;
}

/* ------------------------------------------------------------------ */
/* Cron: scheduled sends + birthday emails                             */
/* ------------------------------------------------------------------ */

async function runCron(event, env) {
  const origin = env.SITE_ORIGIN || "https://lumidermaesthetics.com";
  try { await sendDueScheduledCampaigns(env, origin); } catch (err) { /* keep going */ }
  try { await runBirthdayEmails(env, origin, event); } catch (err) { /* keep going */ }
}

const LONDON_TIME_ZONE = "Europe/London";
function londonDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = {};
  parts.forEach((p) => { if (p.type !== "literal") map[p.type] = Number(p.value); });
  return { year: map.year, month: map.month, day: map.day, hour: map.hour };
}

async function sendDueScheduledCampaigns(env, origin) {
  if (!env.SUBSCRIBERS) return;
  const nowIso = new Date().toISOString();
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, subject, html, audience_source, recipients, topic
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
      topic: row.topic || "",
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
  const london = londonDateParts(now);
  if (london.hour !== sendHour) return; // once a day, at the configured UK hour

  const day = london.day;
  const month = london.month;
  const year = london.year;

  const nowIso = now.toISOString();
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT email, first_name FROM subscribers
      WHERE status='confirmed' AND consent_email=1
        AND birth_day=?1 AND birth_month=?2
        AND (birthday_sent_year IS NULL OR birthday_sent_year < ?3)
        AND pref_birthday=1
        AND (pause_until IS NULL OR pause_until <= ?5)
      LIMIT ?4`
  ).bind(day, month, year, MAX_RECIPIENTS, nowIso).all();

  const people = (results || []).map((r) => ({ email: r.email, name: r.first_name || "" }));
  if (!people.length) return;

  await deliverCampaign(env, origin, {
    subject: cfg.subject || "Happy birthday from Lumi Derm",
    html: cfg.html || defaultBirthdayHtml(),
    recipients: people, audienceSource: "birthday", skipPreferenceFilter: true,
  });

  // Mark everyone matched (even if suppressed) so we never retry them this year.
  for (const p of people) {
    await env.SUBSCRIBERS.prepare(
      "UPDATE subscribers SET birthday_sent_year=?1 WHERE email=?2"
    ).bind(year, p.email).run();
  }
}

const DEFAULT_BIRTHDAY_FIELDS = {
  headline: "Happy birthday, {{name}}!",
  body: "Wishing you a wonderful day from all of us at Lumi Derm. To help you celebrate, enjoy 15% off one treatment within 30 days of your birthday. This birthday treat is redeemed at the venue and cannot be applied to Treatwell bookings.",
  ctaLabel: "Request your birthday treat",
  ctaUrl: "https://lumidermaesthetics.com/#faq",
};

/* ------------------------------------------------------------------ */
/* Client review submissions (public form -> admin moderation)         */
/* ------------------------------------------------------------------ */

// Public: a visitor submits a review from the homepage. Stored 'pending'.
async function handleReviewSubmit(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Reviews aren't set up yet." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

  // Honeypot: real people leave this empty. Pretend success for bots.
  if (String(body.company || "").trim() !== "") return json({ ok: true, message: "Thank you!" });

  const name = String(body.name || "").trim().slice(0, 80);
  const rating = clampInt(body.rating, 1, 5);
  const treatment = String(body.treatment || "").trim().slice(0, 80);
  const text = String(body.text || "").trim().slice(0, 1500);
  const email = String(body.email || "").trim().slice(0, 160);
  if (!name) return json({ error: "Please add your name." }, 400);
  if (rating === null) return json({ error: "Please choose a star rating." }, 400);
  if (text.length < 4) return json({ error: "Please write a short review." }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "";
  // Rate limit: at most 5 submissions per IP per hour, and block exact duplicate
  // text from the same IP, to blunt spam. (Honeypot above handles naive bots.)
  if (ip) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = await env.SUBSCRIBERS.prepare(
        "SELECT COUNT(*) AS c FROM review_submissions WHERE ip=?1 AND created_at >= ?2"
      ).bind(ip, since).first();
      if (recent && recent.c >= 5) {
        return json({ error: "Thanks! You've sent a few reviews already — please try again later." }, 429);
      }
      const dupe = await env.SUBSCRIBERS.prepare(
        "SELECT COUNT(*) AS c FROM review_submissions WHERE ip=?1 AND text=?2 AND created_at >= ?3"
      ).bind(ip, text, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).first();
      if (dupe && dupe.c > 0) {
        return json({ ok: true, message: "Thank you! Your review has been sent to us for approval." });
      }
    } catch { /* if the check fails, don't block a genuine submission */ }
  }

  await env.SUBSCRIBERS.prepare(
    `INSERT INTO review_submissions (name, rating, treatment, text, email, status, ip, created_at)
     VALUES (?1,?2,?3,?4,?5,'pending',?6,?7)`
  ).bind(name, rating, treatment, text, email, ip, new Date().toISOString()).run();
  await logAudit(env, null, { actor: email || name, action: "review.submitted", detail: name + " (" + rating + "★)", status: "ok" });

  return json({ ok: true, message: "Thank you! Your review has been sent to us for approval." });
}

// Public: homepage "Ask us a question" form. Emails the clinic inbox with the
// visitor's address as reply-to, so a reply goes straight back to them. Nothing
// is stored beyond a best-effort activity-log entry (used for rate limiting too).
async function handleAskQuestion(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

  // Honeypot: real people leave this empty. Pretend success for bots.
  if (String(body.company || "").trim() !== "") return json({ ok: true, message: "Thank you!" });

  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().slice(0, 160);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const treatment = String(body.treatment || "").trim().slice(0, 80);
  const question = String(body.question || body.text || "").trim().slice(0, 2000);
  if (!name) return json({ error: "Please add your name." }, 400);
  if (!isEmail(email)) return json({ error: "Please add a valid email so we can reply." }, 400);
  if (question.length < 5) return json({ error: "Please type your question." }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "";
  // Rate limit: at most 5 questions per IP per hour (honeypot handles naive bots).
  if (ip && env.SUBSCRIBERS) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = await env.SUBSCRIBERS.prepare(
        "SELECT COUNT(*) AS c FROM admin_audit_log WHERE ip=?1 AND action='question.asked' AND created_at >= ?2"
      ).bind(ip, since).first();
      if (recent && recent.c >= 5) {
        return json({ error: "Thanks! You've sent a few questions already — please email us directly or try again a little later." }, 429);
      }
    } catch { /* if the check fails, don't block a genuine question */ }
  }

  const auditDetail = name + " <" + email + ">" + (treatment ? " · " + treatment : "");

  if (!env.RESEND_API_KEY) {
    // No mailer configured — don't block the visitor; record it so it isn't lost.
    await logAudit(env, request, { actor: email || name, action: "question.asked", detail: auditDetail, status: "no-mailer" });
    return json({ ok: true, message: "Thanks! Your question has been received — we'll be in touch soon." });
  }

  const admins = csvEmails(env.ADMIN_EMAILS);
  const clinicTo = env.CONTACT_EMAIL || admins.find((e) => /lumiderm/i.test(e)) || env.REPLY_TO || admins[0] || "info@lumidermaesthetics.co.uk";
  const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <info@lumidermaesthetics.com>";
  const cleanSubject = ("New website question from " + name + (treatment ? " · " + treatment : "")).replace(/[\r\n]+/g, " ").slice(0, 160);
  const message = {
    from,
    to: [clinicTo],
    reply_to: email,
    subject: cleanSubject,
    html: questionEmailHtml({ name, email, phone, treatment, question }),
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text();
    await logAudit(env, request, { actor: email || name, action: "question.asked", detail: auditDetail, status: "error " + res.status });
    return json({ error: "Sorry — we couldn't send that just now. Please email info@lumidermaesthetics.co.uk directly. (" + text.slice(0, 120) + ")" }, 502);
  }
  await logAudit(env, request, { actor: email || name, action: "question.asked", detail: auditDetail, status: "ok" });
  return json({ ok: true, message: "Thanks! Your question is on its way to the team — we'll reply by email soon." });
}

// The internal email the clinic receives for a homepage question.
function questionEmailHtml(q) {
  const row = (label, value) => value
    ? `<tr><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#a2968a;width:140px;vertical-align:top;">${label}</td>` +
      `<td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1c1a18;">${escapeHtml(value)}</td></tr>`
    : "";
  const questionHtml = escapeHtml(q.question).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#f6f1ec;padding:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="padding:26px 34px 8px;">
<p style="margin:0 0 2px;font-family:Georgia,serif;font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p>
<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.06em;color:#a2968a;">New question from the website</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row("Name", q.name)}${row("Email", q.email)}${row("Phone", q.phone)}${row("Treatment", q.treatment)}
</table>
</td></tr>
<tr><td style="padding:6px 34px 26px;">
<p style="margin:16px 0 6px;font-family:Arial,sans-serif;font-size:13px;color:#a2968a;">Their question</p>
<div style="border-left:3px solid #b77b72;padding:6px 0 6px 14px;font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#1c1a18;">${questionHtml}</div>
<p style="margin:22px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#a2968a;">Reply straight to this email and it goes back to ${escapeHtml(q.name)}.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Birthday vouchers: public lookup + venue-only request + capture      */
/* ------------------------------------------------------------------ */

function voucherEffectiveStatus(row, nowIso) {
  if (!row) return "missing";
  if (row.status === "redeemed") return "redeemed";
  if (row.status === "cancelled") return "cancelled";
  if (row.expires_at && row.expires_at < (nowIso || new Date().toISOString())) return "expired";
  return row.status === "requested" ? "requested" : "active";
}

// Public: validate a birthday link token, return the code + status for the page.
async function handleVoucherLookup(request, env, url) {
  if (!env.SUBSCRIBERS) return json({ error: "Not available." }, 503);
  const token = String(url.searchParams.get("t") || "").trim();
  if (!/^[a-z0-9]{8,40}$/i.test(token)) return json({ ok: false, status: "missing" }, 404);
  const row = await env.SUBSCRIBERS.prepare(
    "SELECT code, name, discount, status, expires_at FROM birthday_vouchers WHERE token=?1"
  ).bind(token).first();
  if (!row) return json({ ok: false, status: "missing" }, 404);
  const status = voucherEffectiveStatus(row);
  return json({
    ok: status === "active" || status === "requested",
    status, code: row.code, name: row.name || "",
    discount: row.discount || VOUCHER_DISCOUNT, expires: formatVoucherDate(row.expires_at),
  });
}

// Public: venue-only appointment request against a voucher token.
async function handleVoucherRequest(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Not available." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (String(body.company || "").trim() !== "") return json({ ok: true, message: "Thank you!" }); // honeypot

  const token = String(body.token || "").trim();
  if (!/^[a-z0-9]{8,40}$/i.test(token)) return json({ error: "This link isn't valid." }, 400);
  const row = await env.SUBSCRIBERS.prepare(
    "SELECT id, code, name, email, discount, status, expires_at FROM birthday_vouchers WHERE token=?1"
  ).bind(token).first();
  if (!row) return json({ error: "This birthday code wasn't found." }, 404);
  const status = voucherEffectiveStatus(row);
  if (status === "redeemed") return json({ error: "This code has already been redeemed." }, 409);
  if (status === "cancelled") return json({ error: "This code is no longer active." }, 409);
  if (status === "expired") return json({ error: "This birthday offer has expired." }, 410);

  const treatment = String(body.treatment || "").trim().slice(0, 120);
  const times = String(body.times || "").trim().slice(0, 300);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const message = String(body.message || "").trim().slice(0, 1000);
  if (!phone && !message) return json({ error: "Please add a phone number or a message so we can reach you." }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = await env.SUBSCRIBERS.prepare(
        "SELECT COUNT(*) AS c FROM admin_audit_log WHERE ip=?1 AND action='birthday.request' AND created_at >= ?2"
      ).bind(ip, since).first();
      if (recent && recent.c >= 8) return json({ error: "Thanks! We've got your request — please email us if it's urgent." }, 429);
    } catch { /* ignore */ }
  }

  await env.SUBSCRIBERS.prepare(
    `UPDATE birthday_vouchers SET status='requested', req_treatment=?1, req_times=?2, req_phone=?3, req_message=?4, requested_at=?5
      WHERE id=?6 AND status IN ('active','requested')`
  ).bind(treatment, times, phone, message, new Date().toISOString(), row.id).run();

  if (env.RESEND_API_KEY) {
    const admins = csvEmails(env.ADMIN_EMAILS);
    const clinicTo = env.CONTACT_EMAIL || admins.find((e) => /lumiderm/i.test(e)) || env.REPLY_TO || admins[0] || "info@lumidermaesthetics.co.uk";
    const from = env.FROM_EMAIL || "Lumi Derm Aesthetics <info@lumidermaesthetics.com>";
    const msg = {
      from, to: [clinicTo],
      subject: ("Birthday appointment request — " + row.code).replace(/[\r\n]+/g, " ").slice(0, 160),
      html: voucherRequestEmailHtml({ code: row.code, name: row.name || "", email: row.email, discount: row.discount || VOUCHER_DISCOUNT, treatment, times, phone, message }),
    };
    if (isEmail(row.email)) msg.reply_to = row.email;
    await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(msg) }).catch(() => {});
  }
  await logAudit(env, request, { action: "birthday.request", detail: row.code + " " + (row.email || ""), status: "ok" });
  return json({ ok: true, message: "Thanks! Your birthday appointment request is with the team — we'll be in touch to confirm a time." });
}

function voucherRequestEmailHtml(r) {
  const line = (label, value) => value
    ? `<tr><td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:#a2968a;width:130px;vertical-align:top;">${label}</td><td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1c1a18;">${escapeHtml(value)}</td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f1ec;padding:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;">
<tr><td style="padding:26px 32px 20px;">
<p style="margin:0 0 2px;font-family:Georgia,serif;font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p>
<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:12px;color:#a2968a;">Birthday appointment request</p>
<p style="margin:0 0 14px;font-family:Georgia,serif;font-size:20px;color:#1c1a18;">${escapeHtml(r.code)} &middot; ${r.discount}% off one treatment</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${line("Name", r.name)}${line("Email", r.email)}${line("Phone", r.phone)}${line("Treatment", r.treatment)}${line("Preferred times", r.times)}${line("Message", r.message)}
</table>
<p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#a2968a;">Reply to reach ${escapeHtml(r.name || "the client")}. Venue-only — not a Treatwell booking. Mark the code redeemed in the admin after their visit.</p>
</td></tr></table></td></tr></table></body></html>`;
}

// Public: "add your birthday" capture (tokenised link from the collect email).
async function handleBirthdayCollect(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Not available." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (String(body.company || "").trim() !== "") return json({ ok: true, message: "Thank you!" }); // honeypot
  const email = String(body.email || "").trim().toLowerCase();
  const token = String(body.token || "");
  if (!isEmail(email)) return json({ error: "Please add a valid email." }, 400);
  if (!(await validEmailToken(env, email, token))) return json({ error: "This link isn't valid — use the button in your latest email." }, 400);
  const day = clampInt(body.birth_day, 1, 31);
  const month = clampInt(body.birth_month, 1, 12);
  if (!day || !month) return json({ error: "Please choose your birth day and month." }, 400);
  const res = await env.SUBSCRIBERS.prepare(
    "UPDATE subscribers SET birth_day=?1, birth_month=?2 WHERE email=?3 AND status='confirmed'"
  ).bind(day, month, email).run();
  if (!(res.meta && res.meta.changes)) return json({ error: "We couldn't find your subscription." }, 404);
  await logAudit(env, request, { action: "birthday.collected", detail: email, status: "ok" });
  return json({ ok: true, message: "Thank you! We've saved your birthday — look out for a treat when it comes around." });
}

/* ---- Admin: voucher list, redeem/cancel, and the capture campaign ---- */

async function handleVoucherList(request, env) {
  if (!env.SUBSCRIBERS) return json({ ok: true, vouchers: [] });
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, code, email, name, discount, status, issued_at, expires_at,
            req_treatment, req_times, req_phone, req_message, requested_at, redeemed_at, redeemed_by
       FROM birthday_vouchers ORDER BY issued_at DESC LIMIT 300`
  ).all();
  const now = new Date().toISOString();
  return json({ ok: true, vouchers: (results || []).map((r) => ({ ...r, effective_status: voucherEffectiveStatus(r, now) })) });
}

async function handleVoucherResolve(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Not set up." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const id = parseInt(body.id, 10);
  const action = String(body.action || "");
  if (!id || ["redeem", "cancel", "reactivate"].indexOf(action) === -1) return json({ error: "Bad request." }, 400);
  let sql, params, act;
  if (action === "redeem") {
    sql = "UPDATE birthday_vouchers SET status='redeemed', redeemed_at=?1, redeemed_by=?2 WHERE id=?3 AND status!='redeemed'";
    params = [new Date().toISOString(), adminEmail(request) || "admin", id]; act = "birthday.redeemed";
  } else if (action === "cancel") {
    sql = "UPDATE birthday_vouchers SET status='cancelled' WHERE id=?1"; params = [id]; act = "birthday.cancelled";
  } else {
    sql = "UPDATE birthday_vouchers SET status='active', redeemed_at=NULL, redeemed_by=NULL WHERE id=?1"; params = [id]; act = "birthday.reactivated";
  }
  const res = await env.SUBSCRIBERS.prepare(sql).bind(...params).run();
  await logAudit(env, request, { action: act, detail: "voucher " + id, status: "ok" });
  return json({ ok: true, changed: res.meta && res.meta.changes ? res.meta.changes : 0 });
}

// GET = count of confirmed subscribers with no birthday; POST = send the capture email.
async function handleBirthdayCollectCampaign(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Not set up." }, 500);
  const { results } = await env.SUBSCRIBERS.prepare(
    "SELECT email, first_name FROM subscribers WHERE status='confirmed' AND consent_email=1 AND (birth_day IS NULL OR birth_month IS NULL) LIMIT 500"
  ).all();
  const people = (results || []).map((r) => ({ email: r.email, name: r.first_name || "" }));
  if (request.method === "GET") return json({ ok: true, count: people.length });
  if (!people.length) return json({ ok: true, sent: 0, message: "Everyone already has a birthday on file." });
  const origin = env.SITE_ORIGIN || "https://lumidermaesthetics.com";
  const result = await deliverCampaign(env, origin, {
    subject: "Add your birthday for a yearly treat",
    html: birthdayCollectEmailHtml(),
    recipients: people, audienceSource: "collect-birthday",
  });
  await logAudit(env, request, { action: "birthday.collect_send", detail: (result.sent || 0) + " sent", status: result.ok ? "ok" : "partial" });
  return json({ ok: result.ok, sent: result.sent || 0, errors: result.errors });
}

function birthdayCollectEmailHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border-radius:4px;">
<tr><td align="center" style="padding:40px 40px 8px;"><p style="margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:.16em;text-transform:uppercase;color:#1c1a18;">Lumi&nbsp;Derm</p></td></tr>
<tr><td style="padding:20px 40px 8px;">
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:26px;color:#1c1a18;">When's your birthday, {{name}}?</h1>
<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#4a443e;">Add your birthday and we'll send you a little treat each year &mdash; 15% off a treatment, our gift to you. It takes ten seconds.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#1c1a18" style="border-radius:2px;">
<a href="{{birthday_capture}}" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#fff;text-decoration:none;">Add my birthday</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:28px 40px 36px;"><p style="margin:0;border-top:1px solid #e8e2db;padding-top:22px;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#a2968a;">Lumi Derm Aesthetics &middot; London Docklands &middot; <a href="{{unsubscribe}}" style="color:#a2968a;">unsubscribe</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

// Admin: list pending website submissions.
async function handleReviewSubmissions(request, env) {
  if (!env.SUBSCRIBERS) return json({ ok: true, submissions: [] });
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, name, rating, treatment, text, email, created_at
       FROM review_submissions WHERE status='pending' ORDER BY created_at DESC LIMIT 200`
  ).all();
  return json({ ok: true, submissions: results || [] });
}

// Admin: mark a submission imported (added to the review list) or rejected.
async function handleReviewResolve(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Not set up yet." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const id = parseInt(body.id, 10);
  const action = String(body.action || "");
  if (!id || ["imported", "rejected"].indexOf(action) === -1) return json({ error: "Bad request." }, 400);
  const res = await env.SUBSCRIBERS.prepare(
    "UPDATE review_submissions SET status=?1 WHERE id=?2 AND status='pending'"
  ).bind(action, id).run();
  const changed = res.meta && res.meta.changes ? res.meta.changes : 0;
  await logAudit(env, request, { action: action === "imported" ? "review.imported" : "review.rejected", detail: "submission " + id, status: "ok" });
  return json({ ok: true, changed });
}

/* ------------------------------------------------------------------ */
/* Live reviews served from D1 (approve/hide/feature is instant)       */
/* ------------------------------------------------------------------ */

async function readReviewSummary(env) {
  const summary = { rating: "5.0", count: 47, label: "Treatwell reviews" };
  try {
    const { results } = await env.SUBSCRIBERS.prepare("SELECT key, value FROM review_meta").all();
    (results || []).forEach((row) => {
      if (row.key === "count") summary.count = parseInt(row.value, 10) || summary.count;
      else if (row.key === "rating" || row.key === "label") summary[row.key] = row.value;
    });
  } catch { /* table may not exist yet */ }
  return summary;
}

// Public: the homepage review feed. Only approved reviews, featured first.
// The homepage feed = the established Treatwell reviews (baseline in
// assets/data/reviews.json) PLUS any new approved reviews managed in the admin
// (D1), merged and de-duplicated. The admin only manages the new/upcoming ones.
async function handlePublicReviews(env) {
  const normalise = (r) => ({
    name: r.name || "",
    initial: r.initial || (r.name || "?").charAt(0).toUpperCase(),
    rating: Number(r.rating) || 5,
    treatment: r.treatment || "",
    source: r.source || "Client feedback",
    text: r.text || "",
    featured: r.featured === 1 || r.featured === true,
  });

  const baselineData = await fallbackReviewsFromAssets(env);
  const baseline = (baselineData.reviews || []).map(normalise);
  let summary = baselineData.summary || { rating: "5.0", count: 47, label: "Treatwell reviews" };

  const d1Featured = [];
  const d1Rest = [];
  if (env.SUBSCRIBERS) {
    try {
      const metaSummary = await readReviewSummary(env);
      if (metaSummary) summary = metaSummary;
      const { results } = await env.SUBSCRIBERS.prepare(
        `SELECT name, initial, rating, treatment, source, text, featured
           FROM reviews WHERE status='approved'
          ORDER BY featured DESC, sort_order ASC, id ASC`
      ).all();
      (results || []).forEach((row) => {
        const rv = normalise(row);
        (rv.featured ? d1Featured : d1Rest).push(rv);
      });
    } catch { /* D1 unavailable → baseline only */ }
  }

  // Featured new reviews first, then the Treatwell baseline, then other new ones.
  const key = (r) => String(r.name || "").trim().toLowerCase() + "|" +
    String(r.text || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  const seen = new Set();
  const reviews = [];
  for (const r of [...d1Featured, ...baseline, ...d1Rest]) {
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    reviews.push(r);
  }
  return json({ summary, reviews });
}

async function fallbackReviewsFromAssets(env) {
  const fallback = { summary: { rating: "5.0", count: 47, label: "Treatwell reviews" }, reviews: [] };
  if (!env.ASSETS) return fallback;
  try {
    const origin = env.SITE_ORIGIN || "https://lumidermaesthetics.com";
    const response = await env.ASSETS.fetch(new Request(origin + "/assets/data/reviews.json"));
    if (!response.ok) return fallback;
    const data = await response.json();
    return {
      summary: data && data.summary ? data.summary : fallback.summary,
      reviews: Array.isArray(data && data.reviews) ? data.reviews : [],
    };
  } catch {
    return fallback;
  }
}

// Admin: fetch recent reviews from the clinic's Google Business listing (via the
// Places API). Needs GOOGLE_PLACES_API_KEY + GOOGLE_PLACE_ID set as secrets.
// Returns up to ~5 recent reviews for the team to import into the queue.
async function handleGoogleReviews(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  const key = env.GOOGLE_PLACES_API_KEY;
  const placeId = env.GOOGLE_PLACE_ID;
  if (!key || !placeId) return json({ ok: true, configured: false, reviews: [] });
  try {
    const url = "https://maps.googleapis.com/maps/api/place/details/json?place_id=" +
      encodeURIComponent(placeId) + "&fields=reviews&reviews_no_translations=true&key=" + encodeURIComponent(key);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK") {
      return json({ ok: true, configured: true, reviews: [], error: data.error_message || data.status || "Google returned no data." });
    }
    const reviews = ((data.result && data.result.reviews) || []).map((r) => ({
      name: String(r.author_name || "Google client").slice(0, 80),
      rating: clampInt(r.rating, 1, 5) || 5,
      text: String(r.text || "").slice(0, 1500),
      source: "Google",
      treatment: "",
      when: r.relative_time_description || "",
    })).filter((r) => r.text.length >= 2);
    return json({ ok: true, configured: true, reviews });
  } catch (err) {
    return json({ ok: true, configured: true, reviews: [], error: (err && err.message) || "Network error." });
  }
}

// Admin: every review (all statuses) + the summary badge, for the manager UI.
async function handleAdminReviewsList(env) {
  if (!env.SUBSCRIBERS) return json({ ok: true, summary: {}, reviews: [] });
  const summary = await readReviewSummary(env);
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT id, name, initial, rating, treatment, source, text, status, featured
       FROM reviews ORDER BY sort_order ASC, id ASC`
  ).all();
  const reviews = (results || []).map((r) => ({
    id: r.id, name: r.name || "", initial: r.initial || "",
    rating: Number(r.rating) || 5, treatment: r.treatment || "",
    source: r.source || "Client feedback", text: r.text || "",
    status: r.status || "pending", featured: r.featured === 1 || r.featured === true,
  }));
  return json({ ok: true, summary, reviews });
}

// Admin: replace the whole review set + summary in one transaction. Instant + live.
async function handleAdminReviewsSave(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Reviews aren't set up yet." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const list = Array.isArray(body.reviews) ? body.reviews : [];
  const summary = body.summary || {};

  // Snapshot the reviews as they are now (a rollback point) before replacing.
  await snapshotReviewsRevision(env, request);

  const stmts = [env.SUBSCRIBERS.prepare("DELETE FROM reviews")];
  const insert = env.SUBSCRIBERS.prepare(
    `INSERT INTO reviews (name, initial, rating, treatment, source, text, status, featured, sort_order, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
  );
  list.forEach((r, i) => {
    const name = String(r.name || "").slice(0, 80);
    const status = ["approved", "pending", "hidden"].indexOf(r.status) === -1 ? "pending" : r.status;
    stmts.push(insert.bind(
      name,
      String(r.initial || name.charAt(0).toUpperCase() || "?").slice(0, 2),
      clampInt(r.rating, 1, 5) || 5,
      String(r.treatment || "").slice(0, 80),
      String(r.source || "Client feedback").slice(0, 80),
      String(r.text || "").slice(0, 1500),
      status,
      r.featured === true ? 1 : 0,
      i,
      new Date().toISOString()
    ));
  });
  // Summary badge
  ["rating", "count", "label"].forEach((k) => {
    if (summary[k] != null) {
      stmts.push(env.SUBSCRIBERS.prepare(
        "INSERT INTO review_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).bind(k, String(summary[k])));
    }
  });

  await env.SUBSCRIBERS.batch(stmts);
  const live = list.filter((r) => r.status === "approved").length;
  await logAudit(env, request, { action: "reviews.saved", detail: list.length + " reviews (" + live + " live)", status: "ok" });
  return json({ ok: true, saved: list.length, live });
}

/* ------------------------------------------------------------------ */
/* Durable version history (revisions)                                 */
/* ------------------------------------------------------------------ */

const REVISION_KINDS = ["offers", "prices", "content", "reviews"];
const REVISIONS_PER_KIND = 40;

// Insert a revision and prune old ones so each kind keeps at most N snapshots.
async function insertRevision(env, kind, label, payload, actor) {
  if (!env.SUBSCRIBERS) return;
  const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload ?? null);
  if (payloadJson.length > 400000) return; // guardrail against runaway payloads
  await env.SUBSCRIBERS.prepare(
    `INSERT INTO revisions (kind, label, payload, actor, created_at) VALUES (?1,?2,?3,?4,?5)`
  ).bind(kind, String(label || "Snapshot").slice(0, 120), payloadJson, String(actor || "").slice(0, 160), new Date().toISOString()).run();
  // Keep the newest REVISIONS_PER_KIND for this kind.
  await env.SUBSCRIBERS.prepare(
    `DELETE FROM revisions WHERE kind=?1 AND id NOT IN (
       SELECT id FROM revisions WHERE kind=?1 ORDER BY id DESC LIMIT ?2
     )`
  ).bind(kind, REVISIONS_PER_KIND).run();
}

// Before a review save, capture the current reviews as a rollback point — but at
// most once every few minutes so a burst of edits doesn't flood the history.
async function snapshotReviewsRevision(env, request) {
  if (!env.SUBSCRIBERS) return;
  try {
    const last = await env.SUBSCRIBERS.prepare(
      "SELECT created_at FROM revisions WHERE kind='reviews' ORDER BY id DESC LIMIT 1"
    ).first();
    if (last && last.created_at && (Date.now() - Date.parse(last.created_at)) < 3 * 60 * 1000) return;
    const summary = await readReviewSummary(env);
    const { results } = await env.SUBSCRIBERS.prepare(
      `SELECT name, initial, rating, treatment, source, text, status, featured
         FROM reviews ORDER BY sort_order ASC, id ASC`
    ).all();
    const reviews = (results || []).map((r) => ({
      name: r.name || "", initial: r.initial || "", rating: Number(r.rating) || 5,
      treatment: r.treatment || "", source: r.source || "Client feedback", text: r.text || "",
      status: r.status || "pending", featured: r.featured === 1 || r.featured === true,
    }));
    if (!reviews.length) return; // nothing worth snapshotting yet
    await insertRevision(env, "reviews", "Before a review change", { summary, reviews }, adminEmail(request));
  } catch { /* history is a safety net, never block the save */ }
}

// Admin: record a snapshot (offers / prices / content) sent from the browser.
async function handleRevisionCreate(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "History isn't set up yet." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const kind = String(body.kind || "");
  if (REVISION_KINDS.indexOf(kind) === -1) return json({ error: "Unknown revision kind." }, 400);
  if (body.payload == null) return json({ error: "Nothing to snapshot." }, 400);
  await insertRevision(env, kind, body.label, body.payload, adminEmail(request));
  return json({ ok: true });
}

// Admin: recent snapshots (metadata only — payloads are fetched on restore).
async function handleRevisionsList(request, env, url) {
  if (!env.SUBSCRIBERS) return json({ ok: true, revisions: [] });
  const kind = String(url.searchParams.get("kind") || "");
  const limit = clampInt(url.searchParams.get("limit"), 1, 50) || 20;
  let stmt;
  if (REVISION_KINDS.indexOf(kind) !== -1) {
    stmt = env.SUBSCRIBERS.prepare(
      "SELECT id, kind, label, actor, created_at FROM revisions WHERE kind=?1 ORDER BY id DESC LIMIT ?2"
    ).bind(kind, limit);
  } else {
    stmt = env.SUBSCRIBERS.prepare(
      "SELECT id, kind, label, actor, created_at FROM revisions ORDER BY id DESC LIMIT ?1"
    ).bind(limit);
  }
  const { results } = await stmt.all();
  return json({ ok: true, revisions: results || [] });
}

// Admin: one revision including its payload, for restoring into a draft.
async function handleRevisionItem(request, env, url) {
  if (!env.SUBSCRIBERS) return json({ error: "History isn't set up yet." }, 500);
  const id = clampInt(url.searchParams.get("id"), 1, 2000000000);
  if (!id) return json({ error: "Bad revision id." }, 400);
  const row = await env.SUBSCRIBERS.prepare(
    "SELECT id, kind, label, actor, created_at, payload FROM revisions WHERE id=?1"
  ).bind(id).first();
  if (!row) return json({ error: "That revision no longer exists." }, 404);
  let payload = null;
  try { payload = JSON.parse(row.payload); } catch { payload = null; }
  return json({ ok: true, revision: { id: row.id, kind: row.kind, label: row.label, actor: row.actor, created_at: row.created_at, payload } });
}

// Confirmed + consented subscribers whose birthday is today or within the next 7 days.
async function handleBirthdaysList(request, env) {
  if (!env.SUBSCRIBERS) return json({ ok: true, birthdays: [], today: 0 });
  const now = new Date();
  const london = londonDateParts(now);
  const nowIso = now.toISOString();
  const { results } = await env.SUBSCRIBERS.prepare(
    `SELECT email, first_name, birth_day, birth_month, birthday_sent_year
       FROM subscribers
      WHERE status='confirmed' AND consent_email=1
        AND pref_birthday=1
        AND (pause_until IS NULL OR pause_until <= ?1)
        AND birth_day IS NOT NULL AND birth_month IS NOT NULL
      LIMIT 3000`
  ).bind(nowIso).all();

  const year = london.year;
  const startOfToday = Date.UTC(year, london.month - 1, london.day);
  const WINDOW = 7;
  const list = [];
  for (const r of results || []) {
    const bd = Number(r.birth_day), bm = Number(r.birth_month);
    if (!bd || !bm || bm < 1 || bm > 12 || bd < 1 || bd > 31) continue;
    let occ = Date.UTC(year, bm - 1, bd);
    if (occ < startOfToday) occ = Date.UTC(year + 1, bm - 1, bd);
    const daysUntil = Math.round((occ - startOfToday) / 86400000);
    if (daysUntil <= WINDOW) {
      list.push({
        email: r.email, name: r.first_name || "",
        birth_day: bd, birth_month: bm, daysUntil,
        alreadySent: Number(r.birthday_sent_year) === year,
      });
    }
  }
  list.sort((a, b) => a.daysUntil - b.daysUntil || String(a.name).localeCompare(String(b.name)));
  return json({ ok: true, birthdays: list, today: list.filter((x) => x.daysUntil === 0).length });
}

// Send the birthday email to a single subscriber (from the reminder), mark the year.
async function handleBirthdaysSend(request, env) {
  if (!env.SUBSCRIBERS) return json({ error: "Not set up yet." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Invalid email." }, 400);

  const row = await env.SUBSCRIBERS.prepare(
    "SELECT email, first_name, status, consent_email, pref_birthday, pause_until FROM subscribers WHERE email = ?1"
  ).bind(email).first();
  if (!row) return json({ error: "That subscriber wasn't found." }, 404);
  if (row.status !== "confirmed" || !row.consent_email) {
    return json({ error: "That person hasn't confirmed marketing consent, so we can't email them." }, 400);
  }
  if (Number(row.pref_birthday) === 0) {
    return json({ error: "That person has opted out of birthday treats." }, 400);
  }
  if (row.pause_until && Date.parse(row.pause_until) > Date.now()) {
    return json({ error: "That person has paused marketing emails until " + String(row.pause_until).slice(0, 10) + "." }, 400);
  }

  const cfg = await getBirthdayConfig(env);
  const origin = env.SITE_ORIGIN || "https://lumidermaesthetics.com";
  const result = await deliverCampaign(env, origin, {
    subject: cfg.subject || "Happy birthday from Lumi Derm",
    html: cfg.html || defaultBirthdayHtml(),
    recipients: [{ email: row.email, name: row.first_name || "" }],
    audienceSource: "birthday-manual", skipPreferenceFilter: true,
  });
  if (!result.sent) return json({ error: (result.errors && result.errors[0]) || "Could not send." }, 502);

  const year = londonDateParts(new Date()).year;
  await env.SUBSCRIBERS.prepare("UPDATE subscribers SET birthday_sent_year=?1 WHERE email=?2").bind(year, row.email).run();
  await logAudit(env, request, { action: "birthday.manual_send", detail: email, status: "ok" });
  return json({ ok: true, sentTo: email });
}

async function getBirthdayConfig(env) {
  const def = {
    enabled: false, subject: "Happy birthday from Lumi Derm 🎂",
    html: defaultBirthdayHtml(), hour: 8, fields: { ...DEFAULT_BIRTHDAY_FIELDS },
  };
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
        fields: (v.fields && typeof v.fields === "object") ? { ...DEFAULT_BIRTHDAY_FIELDS, ...v.fields } : { ...DEFAULT_BIRTHDAY_FIELDS },
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
<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#4a443e;">Wishing you a wonderful day from all of us at Lumi Derm. To help you celebrate, enjoy <strong>15% off one treatment</strong> as your birthday treat.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td align="center" style="border:1px dashed #c9a196;border-radius:6px;padding:16px;">
<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#a2968a;">Your birthday code</p>
<p style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;letter-spacing:.08em;color:#1c1a18;">{{birthday_code}}</p>
<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#7d746b;">Valid until {{birthday_expiry}}</p>
</td></tr></table>
<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#7d746b;">This birthday treat is redeemed and paid for at Lumi Derm only, and cannot be applied to Treatwell bookings.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#1c1a18" style="border-radius:2px;">
<a href="{{birthday_link}}" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#fff;text-decoration:none;">Request birthday appointment</a>
</td></tr></table>
<p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#7d746b;">If you enjoyed your Lumi Derm visit, it would mean so much if you could leave a quick Google review: <a href="${GOOGLE_REVIEW_URL}" style="color:#7d746b;text-decoration:underline;">write a review</a>.</p>
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
  const topic = String(body.topic || "").trim().toLowerCase().slice(0, 40);
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
    `INSERT INTO scheduled_campaigns (subject, html, audience_source, recipients, send_at, status, created_at, topic)
     VALUES (?1,?2,?3,?4,?5,'queued',?6,?7)`
  ).bind(
    subject.slice(0, 240), html, audienceSource,
    JSON.stringify(cleanRecipients), when.toISOString(), new Date().toISOString(), topic || null
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
  const inFields = (body.fields && typeof body.fields === "object") ? body.fields : {};
  const cfg = {
    enabled: body.enabled === true,
    subject: String(body.subject || "").slice(0, 240) || "Happy birthday from Lumi Derm",
    html: String(body.html || "") || defaultBirthdayHtml(),
    hour: hour === null ? 8 : hour,
    fields: {
      headline: String(inFields.headline || DEFAULT_BIRTHDAY_FIELDS.headline).slice(0, 240),
      body: String(inFields.body || DEFAULT_BIRTHDAY_FIELDS.body).slice(0, 2000),
      ctaLabel: String(inFields.ctaLabel || DEFAULT_BIRTHDAY_FIELDS.ctaLabel).slice(0, 120),
      ctaUrl: String(inFields.ctaUrl || DEFAULT_BIRTHDAY_FIELDS.ctaUrl).slice(0, 400),
    },
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
  const htmlSafe = sanitizeBirthdayEmailHtml(htmlRaw);
  // Bypass suppression for a test to the admin's own inbox.
  const unsubUrl = await buildUnsubscribeUrl(env, origin, to);
  const who = firstName(body.name) || "there";
  let html = htmlSafe.replaceAll("{{name}}", escapeHtml(who)).replaceAll("{{unsubscribe}}", unsubUrl);
  html = applyVoucherTokens(html, sampleVoucher(origin)); // preview shows a sample code + link
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
  /^lumi-derm-website\/_headers$/, // FAQ publish updates the CSP JSON-LD hash here
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

// Professional publish/deploy status: the latest commit on the branch (repo HEAD)
// plus the version Cloudflare is actually running. The admin compares the two to
// show pending / deployed / delayed. Works from any device (no local state).
async function handleDeployStatus(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);

  const deploy = deployInfo(env);
  const configured = Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO);
  if (!configured) return json({ ok: true, configured: false, commit: null, deploy });

  const branch = env.GITHUB_BRANCH || "main";
  try {
    const res = await fetch(
      "https://api.github.com/repos/" + env.GITHUB_REPO + "/commits/" + encodeURIComponent(branch),
      {
        headers: {
          Authorization: "Bearer " + env.GITHUB_TOKEN,
          Accept: "application/vnd.github+json",
          "User-Agent": "LumiDerm-Admin-Worker",
        },
      }
    );
    if (!res.ok) {
      let message = "";
      try { message = (await res.json()).message || ""; } catch { /* ignore */ }
      return json({ ok: true, configured: true, commit: null, deploy, error: message || ("GitHub returned " + res.status) });
    }
    const c = await res.json();
    const commit = {
      sha: c.sha ? String(c.sha).slice(0, 7) : null,
      message: c.commit && c.commit.message ? String(c.commit.message).split("\n")[0].slice(0, 140) : "",
      author: c.commit && c.commit.author ? c.commit.author.name : (c.author && c.author.login) || "",
      date: c.commit && c.commit.author ? c.commit.author.date : null,
      url: c.html_url || null,
    };
    return json({ ok: true, configured: true, commit, deploy });
  } catch (err) {
    return json({ ok: true, configured: true, commit: null, deploy, error: (err && err.message) || "Network error." });
  }
}

// Dashboard alerts: things that need attention, computed from live data.
async function handleAlerts(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ ok: true, alerts: [] });
  const alerts = [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Missing D1 migration: probe artifacts from the most recent migrations.
  let migrationsOk = true;
  const probes = [
    "SELECT pref_offers FROM subscribers LIMIT 1",
    "SELECT id FROM reviews LIMIT 1",
    "SELECT id FROM revisions LIMIT 1",
    "SELECT topic FROM campaign_sends LIMIT 1",
  ];
  for (const q of probes) {
    try { await env.SUBSCRIBERS.prepare(q).all(); } catch { migrationsOk = false; }
  }
  if (!migrationsOk) {
    alerts.push({ level: "error", title: "Database update needed", detail: "A recent feature needs its database migration applied. Ask Dima to run the latest D1 migrations." });
  }

  // Campaign send problems in the last 7 days.
  try {
    const row = await env.SUBSCRIBERS.prepare(
      "SELECT COUNT(*) AS c FROM campaign_sends WHERE is_test=0 AND status IN ('partial','error','failed') AND created_at >= ?1"
    ).bind(new Date(Date.now() - 7 * 864e5).toISOString()).first();
    if (row && row.c) alerts.push({ level: "error", title: row.c + " campaign" + (row.c > 1 ? "s" : "") + " had send problems", detail: "Check Send email → recent campaigns for details.", tab: "sender" });
  } catch { /* ignore */ }

  // Campaign scheduled to go out today.
  try {
    const { results } = await env.SUBSCRIBERS.prepare(
      "SELECT subject, send_at FROM scheduled_campaigns WHERE status='queued' AND substr(send_at,1,10)=?1 ORDER BY send_at ASC LIMIT 5"
    ).bind(todayStr).all();
    (results || []).forEach((r) => alerts.push({ level: "info", title: "Campaign scheduled today", detail: '"' + (r.subject || "Untitled") + '" at ' + String(r.send_at || "").slice(11, 16), tab: "sender" }));
  } catch { /* ignore */ }

  // Birthday automation switched off.
  try {
    const cfg = await getBirthdayConfig(env);
    if (!cfg.enabled) alerts.push({ level: "warn", title: "Birthday automation is off", detail: "Automatic birthday emails won't send. Turn it on in Send email → Birthdays.", tab: "sender" });
  } catch { /* ignore */ }

  // New website reviews awaiting moderation.
  try {
    const row = await env.SUBSCRIBERS.prepare("SELECT COUNT(*) AS c FROM review_submissions WHERE status='pending'").first();
    if (row && row.c) alerts.push({ level: "info", title: row.c + " new review" + (row.c > 1 ? "s" : "") + " to check", detail: "Approve or reject them in the Reviews tab.", tab: "reviews" });
  } catch { /* ignore */ }

  return json({ ok: true, alerts, checkedAt: now.toISOString() });
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
/* Atomic publish: one commit per publish, CSP hash always in sync     */
/* ------------------------------------------------------------------ */

const JSONLD_BLOCK_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

async function sha256Base64(str) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToUtf8(b64) {
  const bin = atob(String(b64 || "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function ghApi(env, method, apiPath, body) {
  return fetch("https://api.github.com/repos/" + env.GITHUB_REPO + apiPath, {
    method,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "LumiDerm-Admin-Worker",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function ghReadFileText(env, branch, repoPath) {
  const res = await ghApi(env, "GET", "/contents/" + repoPath + "?ref=" + encodeURIComponent(branch) + "&_=" + Date.now());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not read " + repoPath + " (" + res.status + ").");
  const data = await res.json();
  return b64ToUtf8(data.content || "");
}

// If index.html is being published and its JSON-LD block changed, recompute the
// sha256 in _headers so the CSP always matches the page (adds/patches _headers in
// the same commit). This is the safeguard that a contact/hero/FAQ edit can no
// longer silently break the structured-data hash and block the deploy.
async function syncCspHeaders(env, branch, files) {
  const idx = files.find((f) => f.path === "lumi-derm-website/index.html");
  if (!idx) return files;
  const newMatch = idx.content.match(JSONLD_BLOCK_RE);
  if (!newMatch) return files;
  const newHash = await sha256Base64(newMatch[1]);

  let oldHash = null;
  const currentIndex = await ghReadFileText(env, branch, "lumi-derm-website/index.html").catch(() => null);
  if (currentIndex) {
    const cm = currentIndex.match(JSONLD_BLOCK_RE);
    if (cm) oldHash = await sha256Base64(cm[1]);
  }
  if (oldHash && oldHash === newHash) return files; // structured data unchanged

  let headersEntry = files.find((f) => f.path === "lumi-derm-website/_headers");
  let headersText = headersEntry ? headersEntry.content : await ghReadFileText(env, branch, "lumi-derm-website/_headers");
  if (!headersText) return files;
  if (headersText.includes("'sha256-" + newHash + "'")) return files; // already correct

  if (oldHash && headersText.includes("'sha256-" + oldHash + "'")) {
    headersText = headersText.replace("'sha256-" + oldHash + "'", "'sha256-" + newHash + "'");
  } else {
    throw new Error("Could not sync the security-policy hash — the homepage structured data changed but _headers didn't match. Nothing was published; ask Dima to refresh _headers.");
  }
  if (headersEntry) headersEntry.content = headersText;
  else files.push({ path: "lumi-derm-website/_headers", content: headersText });
  return files;
}

// Create ONE commit containing every file, via the Git Data API (tree + commit +
// ref update). Either the whole publish lands or none of it does.
async function githubAtomicCommit(env, branch, message, files) {
  const refRes = await ghApi(env, "GET", "/git/ref/heads/" + encodeURIComponent(branch));
  if (!refRes.ok) throw new Error("Could not read the branch (" + refRes.status + ").");
  const baseSha = (await refRes.json()).object.sha;

  const commitRes = await ghApi(env, "GET", "/git/commits/" + baseSha);
  if (!commitRes.ok) throw new Error("Could not read the latest commit (" + commitRes.status + ").");
  const baseTree = (await commitRes.json()).tree.sha;

  const treeRes = await ghApi(env, "POST", "/git/trees", {
    base_tree: baseTree,
    tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
  });
  if (!treeRes.ok) throw new Error("Could not stage the changes (" + treeRes.status + ").");
  const newTree = (await treeRes.json()).sha;

  const newCommitRes = await ghApi(env, "POST", "/git/commits", { message, tree: newTree, parents: [baseSha] });
  if (!newCommitRes.ok) throw new Error("Could not create the commit (" + newCommitRes.status + ").");
  const newCommit = (await newCommitRes.json()).sha;

  const patchRes = await ghApi(env, "PATCH", "/git/refs/heads/" + encodeURIComponent(branch), { sha: newCommit, force: false });
  if (!patchRes.ok) {
    const t = await patchRes.text().catch(() => "");
    throw new Error("Could not update the branch (" + patchRes.status + "). " + t.slice(0, 120));
  }
  return newCommit;
}

async function handleAtomicPublish(request, env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return json({ error: "GitHub publishing isn't configured on the server yet. Ask Dima to set the GITHUB_TOKEN secret." }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }

  const message = String(body.message || "Update website (via admin)").replace(/[\r\n]+/g, " ").slice(0, 200);
  const rawFiles = Array.isArray(body.files) ? body.files : [];
  if (!rawFiles.length) return json({ error: "No changes to publish." }, 400);
  if (rawFiles.length > 20) return json({ error: "Too many files in one publish." }, 400);

  const files = [];
  for (const f of rawFiles) {
    const path = String((f && f.path) || "").replace(/^\/+/, "");
    if (!githubPathAllowed(path)) return json({ error: "That file path is not allowed for publishing: " + path }, 403);
    if (typeof (f && f.content) !== "string") return json({ error: "Missing content for " + path }, 400);
    if (f.content.length > 800000) return json({ error: "That file is too large to publish: " + path }, 413);
    if (files.some((x) => x.path === path)) return json({ error: "Duplicate file in publish: " + path }, 400);
    files.push({ path, content: f.content });
  }

  const branch = env.GITHUB_BRANCH || "main";
  try {
    await syncCspHeaders(env, branch, files);
    const sha = await githubAtomicCommit(env, branch, message, files);
    await logAudit(env, request, {
      action: "publish.pages",
      detail: files.map((f) => f.path.replace("lumi-derm-website/", "")).join(", ").slice(0, 480),
      status: "ok",
    });
    return json({ ok: true, commit: sha, files: files.map((f) => f.path) });
  } catch (err) {
    const msg = String((err && err.message) || err);
    await logAudit(env, request, { action: "publish.pages", detail: msg.slice(0, 200), status: "error" });
    return json({ error: msg }, 502);
  }
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
  if (/_headers$/.test(path)) return "publish.faq";
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

async function handlePreferencesGet(request, env, url) {
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase();
  const token = String(url.searchParams.get("t") || "");
  if (!(await validEmailToken(env, email, token))) {
    return htmlPage("Invalid link", "This preference link is not valid.", 400);
  }

  let row = null;
  if (env.SUBSCRIBERS) {
    try {
      row = await env.SUBSCRIBERS.prepare(
        `SELECT email, first_name, last_name, birth_day, birth_month, interest, status, consent_email,
                pref_offers, pref_skintips, pref_news, pref_birthday, pref_frequency, pause_until
           FROM subscribers WHERE email=?1`
      ).bind(email).first();
    } catch { row = null; }
  }

  const on = (v) => row ? Number(v) === 1 : true; // default opted-in for unknown/new
  const pauseMonths = row && row.pause_until && Date.parse(row.pause_until) > Date.now()
    ? Math.max(1, Math.round((Date.parse(row.pause_until) - Date.now()) / (30 * 24 * 60 * 60 * 1000)))
    : 0;
  return preferencesPage({
    email,
    token,
    firstName: row && row.first_name,
    lastName: row && row.last_name,
    day: row && row.birth_day,
    month: row && row.birth_month,
    interest: row && row.interest,
    subscribed: !row || (row.status === "confirmed" && Number(row.consent_email) === 1),
    offers: on(row && row.pref_offers),
    skintips: on(row && row.pref_skintips),
    news: on(row && row.pref_news),
    birthday: on(row && row.pref_birthday),
    frequency: (row && row.pref_frequency) === "monthly" ? "monthly" : "any",
    pauseMonths,
  });
}

async function handlePreferencesPost(request, env) {
  if (!env.SUBSCRIBERS) return htmlPage("Not available", "Preferences are not set up yet.", 500);
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const token = String(form.get("token") || "");
  if (!(await validEmailToken(env, email, token))) {
    return htmlPage("Invalid link", "This preference link is not valid.", 400);
  }

  const now = new Date().toISOString();
  const firstNameVal = String(form.get("first_name") || "").trim().slice(0, 60);
  const lastNameVal = String(form.get("last_name") || "").trim().slice(0, 60);
  const interest = String(form.get("interest") || "").trim().slice(0, 40);
  const birthDay = clampInt(form.get("birth_day"), 1, 31);
  const birthMonth = clampInt(form.get("birth_month"), 1, 12);
  const subscribed = form.get("subscribed") === "1";
  // Topic opt-ins, frequency cap and pause.
  const prefOffers = form.get("pref_offers") === "1" ? 1 : 0;
  const prefSkintips = form.get("pref_skintips") === "1" ? 1 : 0;
  const prefNews = form.get("pref_news") === "1" ? 1 : 0;
  const prefBirthday = form.get("pref_birthday") === "1" ? 1 : 0;
  const prefFrequency = String(form.get("pref_frequency") || "any") === "monthly" ? "monthly" : "any";
  const pauseMonths = clampInt(form.get("pause_months"), 1, 12);
  const pauseUntil = pauseMonths ? new Date(Date.now() + pauseMonths * 30 * 24 * 60 * 60 * 1000).toISOString() : null;

  if (subscribed) {
    await env.SUBSCRIBERS.prepare(
      `INSERT INTO subscribers
         (email, first_name, last_name, birth_day, birth_month, interest, status,
          consent_email, consent_wording, consent_source, confirm_token, created_at, confirmed_at, unsubscribed_at,
          pref_offers, pref_skintips, pref_news, pref_birthday, pref_frequency, pause_until)
       VALUES (?1,?2,?3,?4,?5,?6,'confirmed',1,'Updated in email preference centre','preference centre',NULL,?7,?7,NULL,
               ?8,?9,?10,?11,?12,?13)
       ON CONFLICT(email) DO UPDATE SET
         first_name=?2, last_name=?3, birth_day=?4, birth_month=?5, interest=?6,
         status='confirmed', consent_email=1, consent_source='preference centre',
         consent_wording='Updated in email preference centre', confirmed_at=COALESCE(confirmed_at, ?7),
         unsubscribed_at=NULL,
         pref_offers=?8, pref_skintips=?9, pref_news=?10, pref_birthday=?11, pref_frequency=?12, pause_until=?13`
    ).bind(email, firstNameVal, lastNameVal, birthDay, birthMonth, interest, now,
           prefOffers, prefSkintips, prefNews, prefBirthday, prefFrequency, pauseUntil).run();
    if (env.SUPPRESSION) await env.SUPPRESSION.delete(suppressionKey(email));
    const note = pauseUntil
      ? "Your preferences are saved and emails are paused for now. You can resume any time from this page."
      : "Your email preferences have been updated. You can change them again from any Lumi Derm email.";
    return htmlPage("Preferences saved", note, 200);
  }

  if (env.SUPPRESSION) {
    await env.SUPPRESSION.put(suppressionKey(email), JSON.stringify({ at: now, source: "preference centre" }));
  }
  await env.SUBSCRIBERS.prepare(
    "UPDATE subscribers SET status='unsubscribed', consent_email=0, unsubscribed_at=?1 WHERE email=?2"
  ).bind(now, email).run();
  return htmlPage("You're unsubscribed", "We've removed you from Lumi Derm marketing emails. Appointment messages are separate and may still be sent where needed.", 200);
}

async function handleTrackedClick(request, env, url) {
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase();
  const token = String(url.searchParams.get("t") || "");
  const campaignId = String(url.searchParams.get("c") || "").slice(0, 80);
  const target = String(url.searchParams.get("u") || "");
  if (!(await validEmailToken(env, email, token))) {
    return htmlPage("Invalid link", "This link is not valid.", 400);
  }
  // Only redirect to an approved domain (anti-open-redirect). A tracked link
  // should always carry an approved target; if not, fall back to the homepage.
  const safeTarget = safeCampaignTarget(target, url.origin) || (url.origin + "/");
  if (campaignId) await recordCampaignEvent(env, { campaignId, email, eventType: "click", detail: safeTarget });
  return Response.redirect(safeTarget, 302);
}

async function handleUnsubscribe(request, env, url) {
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase();
  const token = String(url.searchParams.get("t") || "");
  const campaignId = String(url.searchParams.get("c") || "").slice(0, 80);

  if (!(await validEmailToken(env, email, token))) {
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
  if (campaignId) await recordCampaignEvent(env, { campaignId, email, eventType: "unsubscribe", detail: "one-click unsubscribe" });

  return htmlPage(
    "You're unsubscribed",
    `We've removed <strong>${escapeHtml(email)}</strong> from our marketing emails. You won't hear from us again unless you ask.<br><br>Appointment confirmations and reminders are separate and will still reach you.`,
    200
  );
}

async function validEmailToken(env, email, token) {
  if (!isEmail(email) || !token) return false;
  const expected = await signEmail(env, email);
  return timingSafeEqual(token, expected);
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

  const now = new Date().toISOString();
  const token = randomToken();
  const wording = String(body.consent_wording || "").slice(0, 300);
  const source = String(body.source || "website").slice(0, 60);
  const ip = request.headers.get("cf-connecting-ip") || "";

  // Rate limit: at most 10 signups per IP per hour (honeypot handles naive bots;
  // this blunts scripted signup floods). Double opt-in already protects the list.
  if (ip) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = await env.SUBSCRIBERS.prepare(
        "SELECT COUNT(*) AS c FROM subscribers WHERE signup_ip=?1 AND created_at >= ?2"
      ).bind(ip, since).first();
      if (recent && recent.c >= 10) {
        return json({ error: "Too many signups from here just now — please try again later." }, 429);
      }
    } catch { /* never block a genuine signup if the check fails */ }
  }

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

async function handleImportSubscribers(request, env) {
  const admin = authorised(request, env);
  if (!admin.ok) return json({ error: admin.reason || "Unauthorised." }, 401);
  if (!env.SUBSCRIBERS) return json({ error: "Signups aren't set up yet." }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const rows = Array.isArray(body.subscribers) ? body.subscribers.slice(0, MAX_RECIPIENTS) : [];
  if (!rows.length) return json({ error: "No subscribers to import." }, 400);

  const now = new Date().toISOString();
  const wording = String(body.consent_wording || "Manually imported with recorded marketing consent.").slice(0, 300);
  const source = String(body.source || "admin CSV import").slice(0, 80);
  let imported = 0;
  let updated = 0;
  let invalid = 0;
  let skippedNoConsent = 0;
  let skippedSuppressed = 0;
  let skippedUnsubscribed = 0;
  const seen = new Set();

  for (const row of rows) {
    const email = String((row && row.email) || "").trim().toLowerCase();
    if (!isEmail(email) || seen.has(email)) { invalid += 1; continue; }
    seen.add(email);
    if (row.consent_email !== true) { skippedNoConsent += 1; continue; }
    if (env.SUPPRESSION && await env.SUPPRESSION.get(suppressionKey(email))) {
      skippedSuppressed += 1;
      continue;
    }

    const existing = await env.SUBSCRIBERS.prepare(
      "SELECT status FROM subscribers WHERE email = ?1"
    ).bind(email).first();
    if (existing && existing.status === "unsubscribed") {
      skippedUnsubscribed += 1;
      continue;
    }

    const firstName = String(row.first_name || "").trim().slice(0, 60);
    const lastName = String(row.last_name || "").trim().slice(0, 60);
    const birthDay = clampInt(row.birth_day, 1, 31);
    const birthMonth = clampInt(row.birth_month, 1, 12);
    const interest = String(row.interest || "").trim().slice(0, 40);

    await env.SUBSCRIBERS.prepare(
      `INSERT INTO subscribers
         (email, first_name, last_name, birth_day, birth_month, interest, status,
          consent_email, consent_wording, consent_source, signup_ip, confirm_token, created_at, confirmed_at)
       VALUES (?1,?2,?3,?4,?5,?6,'confirmed',1,?7,?8,?9,NULL,?10,?10)
       ON CONFLICT(email) DO UPDATE SET
         first_name=?2, last_name=?3, birth_day=?4, birth_month=?5, interest=?6,
         status='confirmed', consent_email=1, consent_wording=?7, consent_source=?8,
         signup_ip=?9, confirm_token=NULL, confirmed_at=?10, unsubscribed_at=NULL`
    ).bind(
      email, firstName, lastName, birthDay, birthMonth, interest,
      wording, source, request.headers.get("cf-connecting-ip") || "", now
    ).run();
    if (existing) updated += 1; else imported += 1;
  }

  await logAudit(env, request, {
    action: "subscriber.import",
    detail: "imported " + imported + ", updated " + updated + ", skipped " + (skippedNoConsent + skippedSuppressed + skippedUnsubscribed + invalid),
    status: "ok",
  });

  return json({ ok: true, imported, updated, invalid, skippedNoConsent, skippedSuppressed, skippedUnsubscribed });
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

  const allowed = csvEmails(env.ADMIN_EMAILS);
  const owners = csvEmails(env.ADMIN_OWNER_EMAILS);
  const editors = csvEmails(env.ADMIN_EDITOR_EMAILS);
  const lower = email.toLowerCase();

  if (allowed.length && !allowed.includes(lower)) {
    return { ok: false, reason: "This Access user is not allowed to manage admin data." };
  }

  let role = "owner";
  if (owners.length || editors.length) {
    if (owners.includes(lower)) role = "owner";
    else if (editors.includes(lower)) role = "assistant";
    else if (allowed.includes(lower) && !owners.length) role = "owner";
    else return { ok: false, reason: "This Access user has no admin role." };
  }

  return { ok: true, email, role };
}

function requireOwner(request, env, action) {
  const admin = authorised(request, env);
  if (!admin.ok) return admin;
  if (admin.role !== "owner") {
    return {
      ok: false,
      reason: "Owner access is required to " + action + ". Assistants can edit drafts, but cannot send, delete, export or publish.",
    };
  }
  return admin;
}

function csvEmails(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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

async function buildUnsubscribeUrl(env, origin, email, campaignId) {
  const token = await signEmail(env, email);
  const campaign = campaignId ? `&c=${encodeURIComponent(campaignId)}` : "";
  return `${origin}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${token}${campaign}`;
}

async function buildPreferencesUrl(env, origin, email) {
  const token = await signEmail(env, email);
  return `${origin}/api/preferences?e=${encodeURIComponent(email)}&t=${token}`;
}

async function buildBirthdayCaptureUrl(env, origin, email) {
  const token = await signEmail(env, email);
  return `${origin}/pages/my-birthday.html?e=${encodeURIComponent(email)}&t=${token}`;
}

async function trackCampaignLinks(env, origin, html, campaignId, email) {
  if (!campaignId || !email) return html;
  const token = await signEmail(env, email);
  return String(html || "").replace(/href="([^"]+)"/gi, (match, href) => {
    if (!/^https?:\/\//i.test(href)) return match;
    if (/\/api\/(unsubscribe|preferences|click)\b/i.test(href)) return match;
    const target = safeCampaignTarget(href, origin);
    if (!target) return match;
    const encoded = encodeURIComponent(target);
    const clickUrl = `${origin}/api/click?c=${encodeURIComponent(campaignId)}&e=${encodeURIComponent(email)}&t=${token}&u=${encoded}`;
    return 'href="' + clickUrl.replace(/"/g, "%22") + '"';
  });
}

// Domains a campaign link is allowed to point at. The clinic site + booking,
// Treatwell, and the clinic's approved social channels. Anything else is left
// untouched (not rewritten, not redirected) so external links keep working.
const APPROVED_CAMPAIGN_DOMAINS = [
  "lumidermaesthetics.com",
  "treatwell.co.uk",
  "google.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "wa.me",
  "whatsapp.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
];

function isApprovedCampaignHost(host) {
  const h = String(host || "").toLowerCase();
  return APPROVED_CAMPAIGN_DOMAINS.some((d) => h === d || h.endsWith("." + d));
}

// Returns the safe absolute URL if it points to an approved domain, otherwise
// null. Callers must treat null as "don't rewrite / don't track this link" —
// never silently redirect an unsupported link to the homepage.
function safeCampaignTarget(raw, origin) {
  try {
    const target = new URL(String(raw || ""), origin);
    if (
      (target.protocol === "https:" || target.protocol === "http:") &&
      isApprovedCampaignHost(target.hostname)
    ) {
      return target.toString();
    }
  } catch { /* fall through */ }
  return null;
}

async function recordCampaignEvent(env, detail) {
  if (!env.SUBSCRIBERS || !detail || !detail.campaignId) return;
  try {
    await env.SUBSCRIBERS.prepare(
      `INSERT INTO campaign_events (campaign_id, email, event_type, detail, created_at)
       VALUES (?1,?2,?3,?4,?5)`
    ).bind(
      String(detail.campaignId || "").slice(0, 80),
      String(detail.email || "").slice(0, 160),
      String(detail.eventType || "").slice(0, 40),
      String(detail.detail || "").slice(0, 500),
      new Date().toISOString()
    ).run();
  } catch { /* event tracking must never block public routes */ }
}

/* ------------------------------------------------------------------ */
/* Resend delivery webhook: auto-suppress bounces + complaints          */
/* ------------------------------------------------------------------ */

// Verify a Resend/Svix webhook signature. Header `svix-signature` is a
// space-separated list of "v1,<base64sig>"; the signed content is
// "<id>.<timestamp>.<rawBody>", HMAC-SHA256 with the whsec_ secret.
async function verifyResendSignature(secret, id, timestamp, rawBody, signatureHeader) {
  try {
    const b64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed = `${id}.${timestamp}.${rawBody}`;
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    const provided = String(signatureHeader || "").split(" ").map((p) => p.split(",")[1]).filter(Boolean);
    return provided.some((sig) => timingSafeEqual(sig, expected));
  } catch {
    return false;
  }
}

async function handleResendWebhook(request, env) {
  // Dormant until the webhook secret is set (Resend dashboard → Webhooks).
  if (!env.RESEND_WEBHOOK_SECRET) return json({ ok: true, skipped: "webhook not configured" });
  const id = request.headers.get("svix-id");
  const ts = request.headers.get("svix-timestamp");
  const sig = request.headers.get("svix-signature");
  const raw = await request.text();
  if (!id || !ts || !sig || !(await verifyResendSignature(env.RESEND_WEBHOOK_SECRET, id, ts, raw, sig))) {
    return json({ error: "Invalid signature." }, 401);
  }
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "Invalid body." }, 400); }

  const type = String(event.type || "");
  const data = event.data || {};
  const to = Array.isArray(data.to) ? data.to[0] : (data.to || data.email || "");
  const email = String(to || "").trim().toLowerCase();

  // Hard bounces and spam complaints → suppress + unsubscribe.
  if ((type === "email.bounced" || type === "email.complained") && isEmail(email)) {
    const now = new Date().toISOString();
    if (env.SUPPRESSION) {
      await env.SUPPRESSION.put(suppressionKey(email), JSON.stringify({ at: now, reason: type }));
    }
    if (env.SUBSCRIBERS) {
      try {
        await env.SUBSCRIBERS.prepare(
          "UPDATE subscribers SET status='unsubscribed', consent_email=0, unsubscribed_at=?1 WHERE email=?2"
        ).bind(now, email).run();
      } catch { /* non-fatal */ }
    }
    await logAudit(env, null, {
      actor: email,
      action: type === "email.complained" ? "email.complained" : "email.bounced",
      detail: "auto-suppressed from Resend webhook",
      status: "ok",
    });
  }
  return json({ ok: true });
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

function preferencesPage(data) {
  const interests = [
    "",
    "Laser hair removal",
    "Skin & boosters",
    "Facials & peels",
    "Body & contouring",
    "Lashes & brows",
    "Not sure yet",
  ];
  const dayOptions = ['<option value="">Day</option>'];
  for (let i = 1; i <= 31; i += 1) {
    dayOptions.push('<option value="' + i + '"' + (Number(data.day) === i ? " selected" : "") + ">" + i + "</option>");
  }
  const months = ["Month", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthOptions = months.map((m, i) => {
    if (i === 0) return '<option value="">' + m + "</option>";
    return '<option value="' + i + '"' + (Number(data.month) === i ? " selected" : "") + ">" + m + "</option>";
  }).join("");
  const interestOptions = interests.map((i) =>
    '<option value="' + escapeHtml(i) + '"' + (String(data.interest || "") === i ? " selected" : "") + ">" + escapeHtml(i || "Everything") + "</option>"
  ).join("");
  const body = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email preferences — Lumi Derm Aesthetics</title>
<style>
  body{margin:0;min-height:100vh;background:#f4f1ee;color:#1c1a18;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;padding:24px;}
  .card{background:#fff;max-width:560px;margin:40px auto;padding:38px 34px;border-radius:6px;box-shadow:0 18px 42px rgba(42,35,30,.08);}
  .brand{font-family:Georgia,serif;font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#a2968a;margin:0 0 18px;}
  h1{font-family:Georgia,serif;font-weight:400;font-size:30px;margin:0 0 14px;}
  p{font-size:15px;line-height:1.7;color:#4a443e;margin:0 0 22px;}
  label{display:block;font-size:13px;font-weight:700;color:#756b63;margin:16px 0 6px;}
  input,select{box-sizing:border-box;width:100%;border:1px solid #e5ddd6;border-radius:6px;padding:13px 14px;font:inherit;color:#1c1a18;background:#fff;}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .check{display:flex;gap:10px;align-items:flex-start;margin:20px 0;color:#4a443e;font-size:15px;line-height:1.5;}
  .check input{width:auto;margin-top:4px;}
  button{border:0;background:#1c1a18;color:#fff;padding:15px 28px;border-radius:3px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;cursor:pointer;}
  small{display:block;color:#8c8178;margin-top:16px;line-height:1.6;}
  .prefs{margin:22px 0 6px;padding:18px 18px 6px;border:1px solid #ece5de;border-radius:8px;background:#faf7f3;}
  .prefs-title{font-size:13px;font-weight:800;color:#756b63;margin:0 0 6px;text-transform:uppercase;letter-spacing:.04em;}
  .prefs .check{margin:12px 0;}
  @media (max-width:620px){body{padding:12px}.card{margin:12px auto;padding:28px 22px}.row{grid-template-columns:1fr}}
</style></head>
<body><form class="card" method="post" action="/api/preferences">
  <p class="brand">Lumi&nbsp;Derm</p>
  <h1>Email preferences</h1>
  <p>Update what you would like to hear about, or turn off marketing emails. Appointment messages are separate.</p>
  <input type="hidden" name="email" value="${escapeHtml(data.email)}">
  <input type="hidden" name="token" value="${escapeHtml(data.token)}">
  <div class="row">
    <div><label>First name</label><input name="first_name" value="${escapeHtml(data.firstName || "")}" autocomplete="given-name"></div>
    <div><label>Last name</label><input name="last_name" value="${escapeHtml(data.lastName || "")}" autocomplete="family-name"></div>
  </div>
  <label>Treatment interest</label><select name="interest">${interestOptions}</select>
  <label>Birthday</label><div class="row"><select name="birth_day">${dayOptions.join("")}</select><select name="birth_month">${monthOptions}</select></div>

  <label class="check"><input type="checkbox" name="subscribed" value="1"${data.subscribed ? " checked" : ""}> <span><strong>Keep me subscribed</strong> to Lumi Derm marketing emails.</span></label>

  <div class="prefs">
    <p class="prefs-title">What would you like to hear about?</p>
    <label class="check"><input type="checkbox" name="pref_offers" value="1"${data.offers ? " checked" : ""}> <span>Offers &amp; promotions</span></label>
    <label class="check"><input type="checkbox" name="pref_skintips" value="1"${data.skintips ? " checked" : ""}> <span>Skin tips &amp; treatment advice</span></label>
    <label class="check"><input type="checkbox" name="pref_news" value="1"${data.news ? " checked" : ""}> <span>Clinic news &amp; updates</span></label>
    <label class="check"><input type="checkbox" name="pref_birthday" value="1"${data.birthday ? " checked" : ""}> <span>Birthday treats</span></label>
  </div>

  <label>How often?</label>
  <select name="pref_frequency">
    <option value="any"${data.frequency === "any" ? " selected" : ""}>Any time — send me everything I chose</option>
    <option value="monthly"${data.frequency === "monthly" ? " selected" : ""}>At most once a month</option>
  </select>

  <label>Pause all emails</label>
  <select name="pause_months">
    <option value=""${!data.pauseMonths ? " selected" : ""}>Don't pause</option>
    <option value="1"${data.pauseMonths === 1 ? " selected" : ""}>Pause for 1 month</option>
    <option value="3"${data.pauseMonths === 3 ? " selected" : ""}>Pause for 3 months</option>
    <option value="6"${data.pauseMonths === 6 ? " selected" : ""}>Pause for 6 months</option>
  </select>

  <button type="submit">Save preferences</button>
  <small>This page is personalised from the link in your email. Appointment messages are separate and always sent. You can unsubscribe completely at any time by unticking “Keep me subscribed”.</small>
</form></body></html>`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
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

// Named exports of pure, side-effect-free helpers so they can be unit-tested
// without a full request/D1 harness. (The Worker entrypoint stays the default export.)
export { safeCampaignTarget, isApprovedCampaignHost, topicColumn, clampInt, isEmail };

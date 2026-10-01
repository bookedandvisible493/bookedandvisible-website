/*
 * Free mini-check API (Cloudflare Pages Function) for /free-check/.
 *
 *   GET  /api/mini-check                  → config (is it switched on, Turnstile site key, engines)
 *   POST /api/mini-check {step:"lookup"}      Turnstile + rate limit → Google Places candidates + ticket
 *   POST /api/mini-check {step:"foundation"}  Google listing details + homepage check → place ticket
 *   POST /api/mini-check {step:"ai", engine}  3 searches on one engine (ChatGPT | Perplexity | Gemini)
 *   POST /api/mini-check {step:"finish"}      Airtable lead row + optional results email
 *
 * The page calls the steps one by one so each request stays short. Queries sent to
 * AI engines are built here from a cleaned service word and city, never from free text,
 * and only for a place the visitor picked after passing Turnstile (signed tickets).
 *
 * Fails closed: without its required settings it reports itself as switched off.
 * Required: GOOGLE_PLACES_API_KEY, TURNSTILE_SITE_KEY, TURNSTILE_SECRET, TICKET_SECRET,
 *   KV binding MINICHECK_KV, and at least one of OPENAI_API_KEY / PERPLEXITY_API_KEY / GEMINI_API_KEY.
 *   Launched 2026-10 with GEMINI_API_KEY only (free tier); add the other two keys to switch those engines on.
 * Optional: RESEND_API_KEY + MAIL_FROM (results email), AIRTABLE_TOKEN (lead row),
 *   OPENAI_MODEL, PERPLEXITY_MODEL, GEMINI_MODEL, DAILY_CHECK_CAP (default 150).
 * Local only: MINICHECK_MOCK=1 on localhost returns canned data, no keys, no network.
 * Setup and costs: Operations/21_Mini_Check_Runbook.md.
 */
import {
  cleanWords, buildQueries, enginePrompt, matchBusiness, namedInstead,
  parseOpenAI, parsePerplexity, parseGemini, analyzeHtml,
  foundationLite, presenceLite, quickScore, signTicket, verifyTicket, sha256Hex,
} from "../_lib/minicheck-core.js";

const AIRTABLE_TABLE = "appBI6eyIdjOWqdtT/tblCb3oDf8Qkavs0V"; // CRM base → Free Checks
const F = { search: "fldK0XTqFHgdwh1Fj", at: "fld02kSNkhxxYBuI1", place: "fldLiuMqx5xVUtWft", trade: "fldZNqTyHGY5v4xOV",
  city: "fldporyaDvCjzjOIT", quick: "fld7pcqH94cRxZ7LJ", found: "fld9snu9lYJVqMYuu", pres: "fldBBI9U5rf4jO6Cv",
  engines: "fldUjrGXp6NLKqbCf", issues: "fldmi2T0MIONjbgMV", email: "fldhYXPscuf4kxfmT", consent: "fldvyIckMa1yTDcll",
  emailed: "fld1tHwOhLzJ9WJzJ", status: "fldDhuK8OMCTyzcQn" };

const ENGINES = {
  ChatGPT: { key: "OPENAI_API_KEY", run: runOpenAI },
  Perplexity: { key: "PERPLEXITY_API_KEY", run: runPerplexity },
  Gemini: { key: "GEMINI_API_KEY", run: runGemini },
};
const LIMITS = { lookupsPerIp: 8, runsPerIp: 3, emailsPerAddress: 2 };
const TICKET_MINUTES = 20;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const fail = (status, message) => json({ ok: false, message }, status);

function isMock(env, request) {
  const host = new URL(request.url).hostname;
  return env.MINICHECK_MOCK === "1" && (host === "localhost" || host === "127.0.0.1");
}

function config(env, request) {
  if (isMock(env, request)) {
    const only = String(env.MINICHECK_MOCK_ENGINES || "").split(",").map((e) => e.trim()).filter((e) => ENGINES[e]);
    return { enabled: true, mock: true, siteKey: "", engines: only.length ? only : Object.keys(ENGINES) };
  }
  const engines = Object.keys(ENGINES).filter((e) => env[ENGINES[e].key]);
  const enabled = Boolean(env.GOOGLE_PLACES_API_KEY && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET &&
    env.TICKET_SECRET && env.MINICHECK_KV && engines.length);
  return { enabled, mock: false, siteKey: enabled ? env.TURNSTILE_SITE_KEY : "", engines: enabled ? engines : [] };
}

export async function onRequestGet({ env, request }) {
  return json(config(env, request));
}

export async function onRequestPost({ env, request }) {
  const cfg = config(env, request);
  if (!cfg.enabled) return fail(503, "The free check isn't switched on yet.");
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Bad request.");
  }
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const ipHash = (await sha256Hex(`${ip}|${env.TICKET_SECRET || "mock"}`)).slice(0, 24);
  const ctx = { env, mock: cfg.mock, ipHash, ip, secret: env.TICKET_SECRET || "mock-secret" };
  try {
    switch (body.step) {
      case "lookup": return await stepLookup(body, ctx);
      case "foundation": return await stepFoundation(body, ctx);
      case "ai": return await stepAi(body, ctx);
      case "finish": return await stepFinish(body, ctx);
      default: return fail(400, "Unknown step.");
    }
  } catch (e) {
    console.log("mini-check error", body.step, e && e.stack || e);
    return fail(500, "Something went wrong on our side. Please try again in a minute.");
  }
}

// ---------- rate limits (KV, per day, Pacific date) ----------

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
}

async function bump(ctx, key, limit) {
  if (ctx.mock) return true;
  const kv = ctx.env.MINICHECK_KV;
  const k = `rl:${today()}:${key}`;
  const n = parseInt((await kv.get(k)) || "0", 10);
  if (n >= limit) return false;
  await kv.put(k, String(n + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

// ---------- step 1: find the business ----------

async function stepLookup(body, ctx) {
  const query = cleanWords(body.query, 80);
  if (query.length < 3) return fail(400, "Type your business name and city.");
  if (!ctx.mock) {
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: ctx.env.TURNSTILE_SECRET, response: String(body.turnstileToken || ""), remoteip: ctx.ip }),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!v.success) return fail(403, "Please complete the 'I'm human' check and try again.");
  }
  if (!(await bump(ctx, `lookup:${ctx.ipHash}`, LIMITS.lookupsPerIp))) {
    return fail(429, "You've reached today's limit of searches. Try again tomorrow, or get the full $79 Report.");
  }
  let candidates;
  if (ctx.mock) {
    candidates = [
      { placeId: "mock-1", name: "Elleven Hair Studio", address: "Langley, BC" },
      { placeId: "mock-2", name: "Example Plumbing Ltd", address: "Surrey, BC" },
    ];
  } else {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": ctx.env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress" }, // Pro fields only
      body: JSON.stringify({ textQuery: query, regionCode: "CA", languageCode: "en", pageSize: 5 }),
    });
    if (!r.ok) throw new Error(`places searchText ${r.status} ${await r.text()}`);
    const data = await r.json();
    candidates = (data.places || []).slice(0, 5).map((p) => ({ placeId: p.id, name: p.displayName?.text || "", address: p.formattedAddress || "" }));
  }
  const ticket = await signTicket({ k: "lookup", ip: ctx.ipHash, exp: Date.now() + TICKET_MINUTES * 60000 }, ctx.secret);
  return json({ ok: true, candidates, ticket });
}

// ---------- step 2: Google listing + homepage ----------

async function stepFoundation(body, ctx) {
  const t = await verifyTicket(body.ticket, ctx.secret);
  if (!t || t.k !== "lookup" || t.ip !== ctx.ipHash) return fail(403, "This check expired. Please start again.");
  const placeId = String(body.placeId || "");
  if (!/^[A-Za-z0-9_-]{5,300}$/.test(placeId)) return fail(400, "Pick your business from the list.");
  if (!(await bump(ctx, `run:${ctx.ipHash}`, LIMITS.runsPerIp))) {
    return fail(429, "You've reached today's limit of free checks. Try again tomorrow, or get the full $79 Report.");
  }
  const cap = parseInt(ctx.env.DAILY_CHECK_CAP || "150", 10);
  if (!(await bump(ctx, "run:global", cap))) {
    return fail(429, "We've hit today's limit of free checks. Please try again tomorrow, or get the full $79 Report.");
  }

  const profile = ctx.mock ? mockProfile(placeId) : await placeDetails(placeId, ctx.env.GOOGLE_PLACES_API_KEY);
  const site = profile.website ? await checkWebsite(profile.website, ctx.mock) : null;
  const foundation = foundationLite(profile, site);
  const placeTicket = await signTicket({ k: "place", ip: ctx.ipHash, placeId, name: profile.name, website: profile.website || "",
    exp: Date.now() + TICKET_MINUTES * 60000, n: crypto.randomUUID() }, ctx.secret);
  return json({ ok: true, profile, site, foundation, placeTicket });
}

async function placeDetails(placeId, key) {
  const fields = ["id", "displayName", "formattedAddress", "addressComponents", "nationalPhoneNumber", "websiteUri",
    "regularOpeningHours", "rating", "userRatingCount", "photos", "primaryTypeDisplayName", "businessStatus"].join(",");
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields },
  });
  if (!r.ok) throw new Error(`places details ${r.status} ${await r.text()}`);
  const p = await r.json();
  const comp = (type, short) => (p.addressComponents || []).find((c) => (c.types || []).includes(type))?.[short ? "shortText" : "longText"] || "";
  return {
    name: p.displayName?.text || "",
    address: p.formattedAddress || "",
    city: comp("locality") || comp("administrative_area_level_3") || comp("sublocality"),
    region: comp("administrative_area_level_1", true),
    website: p.websiteUri || "",
    hasPhone: Boolean(p.nationalPhoneNumber),
    hasHours: Boolean(p.regularOpeningHours?.weekdayDescriptions?.length || p.regularOpeningHours?.periods?.length),
    rating: p.rating || 0,
    reviewCount: p.userRatingCount || 0,
    photoCount: (p.photos || []).length, // the API returns at most 10
    category: p.primaryTypeDisplayName?.text || "",
  };
}

async function checkWebsite(url, mock) {
  if (mock) return { reached: true, schemaAny: true, schemaLocal: false, faq: false };
  let u;
  try {
    u = new URL(url);
  } catch {
    return { reached: false, schemaAny: false, schemaLocal: false, faq: false };
  }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|\[)/.test(u.hostname)) {
    return { reached: false, schemaAny: false, schemaLocal: false, faq: false };
  }
  try {
    const r = await fetch(u.toString(), {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; BookedAndVisibleFreeCheck/1.0; +https://bookedandvisible.ca/free-check/)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = (await r.text()).slice(0, 1_500_000);
    return { reached: r.ok, ...analyzeHtml(html) };
  } catch {
    return { reached: false, schemaAny: false, schemaLocal: false, faq: false };
  }
}

// ---------- step 3: one AI engine, three searches ----------

async function stepAi(body, ctx) {
  const t = await verifyTicket(body.placeTicket, ctx.secret);
  if (!t || t.k !== "place" || t.ip !== ctx.ipHash) return fail(403, "This check expired. Please start again.");
  const engine = String(body.engine || "");
  if (!ENGINES[engine] || (!ctx.mock && !ctx.env[ENGINES[engine].key])) return fail(400, "Unknown assistant.");
  const service = cleanWords(body.service, 40);
  const city = cleanWords(body.city, 40);
  const region = cleanWords(body.region, 4);
  if (service.length < 3 || city.length < 2) return fail(400, "Tell us what you do and your city.");

  // Each engine runs once per place ticket, so a ticket can't be replayed to burn API credit.
  if (!ctx.mock) {
    const used = `used:${t.n}:${engine}`;
    if (await ctx.env.MINICHECK_KV.get(used)) return fail(409, "Already checked.");
    await ctx.env.MINICHECK_KV.put(used, "1", { expirationTtl: 60 * 60 * 2 });
  }

  const business = { name: t.name, website: t.website };
  const queries = buildQueries(service, city, region);
  const settled = await Promise.allSettled(queries.map((q) =>
    ctx.mock ? mockAnswer(engine, q, business) : ENGINES[engine].run(enginePrompt(q), ctx.env, { city, region })));
  const cells = settled.map((s, i) => {
    if (s.status !== "fulfilled" || !s.value.text) return { query: queries[i], cell: null, how: "unavailable", instead: [] };
    const m = matchBusiness(s.value.text, s.value.citations, business, service, city);
    return { query: queries[i], cell: m.cell, rank: m.rank, how: m.how, instead: m.cell === 1 ? [] : namedInstead(s.value.text) };
  });
  const ok = cells.filter((c) => c.cell !== null);
  if (!ok.length) {
    const why = settled.find((s) => s.status === "rejected");
    console.log("engine unavailable", engine, why && String(why.reason).slice(0, 300));
  }
  return json({ ok: true, engine, status: ok.length ? "ok" : "unavailable", cells: ok });
}

async function runOpenAI(prompt, env, loc) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5-mini",
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", user_location: { type: "approximate", country: "CA", city: loc.city, region: loc.region || undefined } }],
      input: prompt,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`openai ${r.status} ${await r.text()}`);
  return parseOpenAI(await r.json());
}

async function runPerplexity(prompt, env, loc) {
  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({
      model: env.PERPLEXITY_MODEL || "sonar",
      messages: [{ role: "user", content: prompt }],
      web_search_options: { search_context_size: "low", user_location: { country: "CA", city: loc.city, region: loc.region || undefined } },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`perplexity ${r.status} ${await r.text()}`);
  return parsePerplexity(await r.json());
}

async function runGemini(prompt, env) {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`gemini ${r.status} ${await r.text()}`);
  return parseGemini(await r.json());
}

// ---------- step 4: save the lead, email the results ----------

async function stepFinish(body, ctx) {
  const t = await verifyTicket(body.placeTicket, ctx.secret);
  if (!t || t.k !== "place" || t.ip !== ctx.ipHash) return fail(403, "This check expired. Please start again.");

  // Recompute from the parts the page got from us; a visitor can only change their own result.
  const foundation = foundationLite(body.profile || {}, body.site || null);
  const presence = presenceLite(Array.isArray(body.ai) ? body.ai.slice(0, 3) : []);
  const quick = quickScore(foundation, presence);
  const top3 = quick.issues.slice(0, 3);

  const email = String(body.email || "").trim().slice(0, 120);
  const wantsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  let emailed = false;
  if (wantsEmail && !ctx.mock && ctx.env.RESEND_API_KEY && ctx.env.MAIL_FROM) {
    if (await bump(ctx, `email:${await sha256Hex(email.toLowerCase())}`, LIMITS.emailsPerAddress)) {
      emailed = await sendResults(ctx.env, email, t.name, quick, presence, top3);
    }
  }

  // One Airtable row per check: the first finish call creates it, the email call updates it.
  if (!ctx.mock && ctx.env.AIRTABLE_TOKEN) {
    const fields = {
      [F.search]: cleanWords(body.searchText, 80), [F.at]: new Date().toISOString(), [F.place]: t.placeId,
      [F.trade]: cleanWords(body.service, 40), [F.city]: cleanWords(body.city, 40), [F.quick]: quick.score,
      [F.found]: foundation.score, [F.engines]: presence.engines.join(", "),
      [F.issues]: top3.map((i, n) => `${n + 1}. ${i.title}`).join("\n"),
      [F.consent]: Boolean(body.consent && wantsEmail), [F.emailed]: emailed,
    };
    if (presence.score !== null) fields[F.pres] = presence.score;
    if (wantsEmail) fields[F.email] = email;
    const kvKey = `rec:${t.n}`;
    const existing = await ctx.env.MINICHECK_KV.get(kvKey);
    const record = existing ? { id: existing, fields } : { fields: { ...fields, [F.status]: "New" } };
    const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_TABLE}`, {
      method: existing ? "PATCH" : "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ctx.env.AIRTABLE_TOKEN}` },
      body: JSON.stringify({ typecast: true, records: [record] }),
    });
    if (r.ok && !existing) {
      const created = await r.json();
      const id = created.records?.[0]?.id;
      if (id) await ctx.env.MINICHECK_KV.put(kvKey, id, { expirationTtl: 60 * 60 * 2 });
    } else if (!r.ok) {
      console.log("airtable", r.status, (await r.text()).slice(0, 300));
    }
  }
  return json({ ok: true, emailed, quick: { score: quick.score, band: quick.band, foundationOnly: quick.foundationOnly }, top3 });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function sendResults(env, to, name, quick, presence, top3) {
  const label = quick.foundationOnly ? "Quick score (Google and website only)" : "Quick score";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#16181d;max-width:560px">
<p>Here are the results of your free check for <strong>${esc(name)}</strong>.</p>
<p style="font-size:28px;font-weight:700;margin:8px 0">${quick.score}/100 <span style="font-size:15px;font-weight:400">${esc(label)} · ${esc(quick.band)}</span></p>
${presence.score !== null ? `<p>${presence.engines.length === 1 ? esc(presence.engines[0]) : "AI assistants"} named you in ${presence.named} of ${presence.total} answers (${esc(presence.engines.join(", "))}).</p>` : ""}
<h3 style="margin:20px 0 6px">Your 3 most useful fixes</h3>
${top3.map((i, n) => `<p><strong>${n + 1}. ${esc(i.title)}</strong><br>${esc(i.fix)}</p>`).join("")}
<p>Want to see exactly what ChatGPT, Perplexity, Gemini and Google's AI say about you, with a full 0–100 score and a 90-day plan? The <a href="https://bookedandvisible.ca/ai-visibility/">$79 Visibility Report</a> is delivered within 2 business days.</p>
<p style="font-size:12px;color:#5b6170">This was an automated quick check using Google business data and the assistants' developer APIs. AI answers vary between sessions, so treat it as a snapshot. It is not the same as the paid Report's score, and no one can guarantee rankings, calls or revenue.</p>
<p>Viktor, Booked &amp; Visible · hello@bookedandvisible.ca · (778) 779-9166 · Langley, BC</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], reply_to: "hello@bookedandvisible.ca",
      subject: `Your free visibility check: ${quick.score}/100 — ${name}`.slice(0, 120), html }),
  });
  if (!r.ok) console.log("resend", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

// ---------- local mock data (MINICHECK_MOCK=1 on localhost only) ----------

function mockProfile(placeId) {
  return placeId === "mock-1"
    ? { name: "Elleven Hair Studio", address: "Langley, BC", city: "Langley", region: "BC", website: "https://ellevenhair.ca/",
        hasPhone: true, hasHours: true, rating: 4.9, reviewCount: 18, photoCount: 6, category: "Hair salon" }
    : { name: "Example Plumbing Ltd", address: "Surrey, BC", city: "Surrey", region: "BC", website: "",
        hasPhone: true, hasHours: false, rating: 4.2, reviewCount: 3, photoCount: 0, category: "Plumber" };
}

async function mockAnswer(engine, query, business) {
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 900));
  const named = engine === "Perplexity" && /best/.test(query);
  const list = named
    ? [`1. **${business.name}** – ${business.website}`, "2. Salon Two – salontwo.ca", "3. Studio Three"]
    : ["1. Salon Two – salontwo.ca", "2. Studio Three – studiothree.ca", "3. Cuts & Co"];
  return { text: `Here are some options:\n${list.join("\n")}`, citations: [] };
}

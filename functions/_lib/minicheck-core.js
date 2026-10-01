/*
 * Free mini-check: pure logic shared by functions/api/mini-check.js.
 * No network, no Cloudflare globals, so it can be unit-tested in Node.
 *
 * Quick score = 50% foundation-lite + 50% AI presence-lite (or foundation-lite
 * alone if no AI engine answered). It is deliberately NOT the 0–100 score of the
 * paid Visibility Report (Operations/03_Scoring_Rubric_and_AI_Capture.md): it uses
 * the assistants' developer APIs, not live answers from the consumer apps.
 */

// ---------- input cleaning ----------

// Service and city go into prompts we send to AI engines, so they're limited to
// short plain words: no instructions can be smuggled in through them.
export function cleanWords(s, max = 40) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} &'.\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function buildQueries(service, city, region) {
  const where = region ? `${city}, ${region}` : city;
  return [
    `best ${service} in ${where}`,
    `${service} near ${where} - who would you recommend?`,
    `top-rated ${service} in ${where}`,
  ];
}

export function enginePrompt(query) {
  return `${query}\n\nAnswer as a helpful local guide: name up to 5 specific local businesses, one per numbered line, with their website if you know it.`;
}

// ---------- matching a business in an AI answer ----------

const GENERIC = new Set([
  "the", "and", "of", "ltd", "inc", "corp", "co", "company", "llc", "limited", "group",
  "services", "service", "solutions", "bc", "canada", "studio", "clinic", "shop",
]);

export function nameTokens(name, extraGeneric = []) {
  const skip = new Set([...GENERIC, ...extraGeneric.map((w) => w.toLowerCase())]);
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !skip.has(t));
}

export function hostRoot(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return h.split(".")[0] || "";
  } catch {
    return "";
  }
}

function lineMentions(line, tokens, root) {
  const l = line.toLowerCase().replace(/&/g, " and ");
  if (root && root.length >= 4 && l.includes(root)) return true;
  if (!tokens.length) return false;
  const need = tokens.length <= 3 ? tokens.length : Math.ceil(tokens.length * 0.75);
  const hits = tokens.filter((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${t}([^\\p{L}\\p{N}]|$)`, "u").test(l)).length;
  return hits >= need;
}

/**
 * Where (if at all) the business appears in one answer.
 * cell: 1 = named in the first 3 recommendations, 0.5 = named lower / in passing /
 * only its website cited, 0 = not named. Mirrors rubric §2 cell values.
 */
export function matchBusiness(answer, citations, business, service = "", city = "") {
  const text = String(answer || "");
  const tokens = nameTokens(business.name, [...nameTokens(service), ...nameTokens(city)]);
  const root = hostRoot(business.website);
  const lines = text.split(/\n+/);
  const listLines = lines.filter((l) => /^\s*(\d+[.)]|[-*•])\s+/.test(l));
  const idx = listLines.findIndex((l) => lineMentions(l, tokens, root));
  if (idx >= 0) return { cell: idx < 3 ? 1 : 0.5, rank: idx + 1, how: "listed" };
  if (lines.some((l) => lineMentions(l, tokens, root))) return { cell: 0.5, rank: null, how: "mentioned" };
  if (root && root.length >= 4 && (citations || []).some((c) => hostRoot(c) === root)) {
    return { cell: 0.5, rank: null, how: "website cited" };
  }
  return { cell: 0, rank: null, how: "not named" };
}

// Names the assistant recommended instead (first 3 list lines, cleaned), for display.
export function namedInstead(answer, limit = 3) {
  return String(answer || "")
    .split(/\n+/)
    .filter((l) => /^\s*\d+[.)]\s+/.test(l))
    .slice(0, limit)
    .map((l) => l.replace(/^\s*\d+[.)]\s+/, "").replace(/\*\*/g, "").split(/\s[-–—]\s|\s*\(|:\s|\s+https?:/)[0].trim().slice(0, 60))
    .filter(Boolean);
}

// ---------- engine response parsing ----------

export function parseOpenAI(json) {
  let text = "";
  const citations = [];
  for (const item of json?.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text") {
        text += c.text || "";
        for (const a of c.annotations || []) if (a.url) citations.push(a.url);
      }
    }
  }
  if (!text && typeof json?.output_text === "string") text = json.output_text;
  return { text, citations };
}

export function parsePerplexity(json) {
  const text = json?.choices?.[0]?.message?.content || "";
  const citations = [
    ...(json?.citations || []),
    ...((json?.search_results || []).map((r) => r.url)),
  ].filter(Boolean);
  return { text, citations };
}

export function parseGemini(json) {
  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
  const citations = (cand?.groundingMetadata?.groundingChunks || []).map((g) => g?.web?.uri).filter(Boolean);
  return { text, citations };
}

// ---------- website analysis ----------

const LOCAL_TYPES = /"@type"\s*:\s*(\[[^\]]*)?"(LocalBusiness|ProfessionalService|HomeAndConstructionBusiness|Plumber|Electrician|HVACBusiness|RoofingContractor|GeneralContractor|HousePainter|Locksmith|MovingCompany|Dentist|MedicalBusiness|MedicalClinic|Physician|HealthAndBeautyBusiness|HairSalon|BeautySalon|DaySpa|NailSalon|AutoRepair|AutomotiveBusiness|LegalService|Attorney|Notary|AccountingService|FinancialService|RealEstateAgent|InsuranceAgency|FoodEstablishment|Restaurant|Bakery|CafeOrCoffeeShop|Store|LodgingBusiness|SportsActivityLocation|ExerciseGym|ChildCare|AnimalShelter|VeterinaryCare|EntertainmentBusiness)"/i;

export function analyzeHtml(html) {
  const s = String(html || "");
  const blocks = [...s.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const schemaAny = blocks.length > 0;
  const schemaLocal = blocks.some((b) => LOCAL_TYPES.test(b));
  const faq = blocks.some((b) => /FAQPage/i.test(b)) ||
    /<h[1-4][^>]*>[^<]*(frequently asked|faq|common questions)[^<]*<\/h[1-4]>/i.test(s);
  return { schemaAny, schemaLocal, faq };
}

// ---------- scoring ----------

/*
 * Foundation-lite (0–100), all from the Google listing + the homepage:
 *   schema 20 · FAQ 10 · profile completeness 35 · reviews 35
 */
export function foundationLite(profile, site) {
  const p = profile || {};
  const parts = {};
  const issues = [];
  const hasSite = Boolean(p.website);

  parts.schema = !hasSite ? 0 : site?.schemaLocal ? 20 : site?.schemaAny ? 8 : 0;
  if (!hasSite) {
    issues.push({ lost: 30, key: "no-website", title: "No website on your Google profile",
      fix: "Google and AI assistants have no website to confirm what you do and where. Add your site to your Google profile, or get a simple one built (Landing Pages from $329)." });
  } else if (parts.schema < 20) {
    issues.push({ lost: 20 - parts.schema, key: "schema", title: "Your website doesn't tell Google and AI tools who you are",
      fix: "Add LocalBusiness schema (a short block of code with your name, area, phone and services) to your homepage. The AI Visibility Boost writes it for you, ready to paste." });
  }

  parts.faq = hasSite && site?.faq ? 10 : 0;
  if (hasSite && !site?.faq) {
    issues.push({ lost: 10, key: "faq", title: "No FAQ answers on your website",
      fix: "Add 6–10 short questions and answers about your services, area and how to book. AI assistants often quote exactly this kind of text." });
  }

  let prof = 0;
  const missing = [];
  if (hasSite) prof += 7; else missing.push("website");
  if (p.hasHours) prof += 7; else missing.push("opening hours");
  if (p.hasPhone) prof += 7; else missing.push("phone number");
  if (p.category) prof += 7; else missing.push("category");
  const photos = Number(p.photoCount || 0);
  prof += photos >= 10 ? 7 : photos >= 3 ? 4 : 0;
  if (photos < 10) missing.push(photos === 0 ? "photos" : "more photos (10+)");
  parts.profile = prof;
  const profileGap = missing.filter((m) => m !== "website");
  if (profileGap.length) {
    issues.push({ lost: 35 - prof - (hasSite ? 0 : 7), key: "profile", title: `Your Google profile is missing: ${profileGap.join(", ")}`,
      fix: "Fill these in on your Google Business Profile. Complete profiles are easier for Google and AI assistants to trust and recommend." });
  }

  const count = Number(p.reviewCount || 0);
  const rating = Number(p.rating || 0);
  const rCount = count >= 25 ? 20 : count >= 10 ? 12 : count >= 1 ? 5 : 0;
  const rRating = rating >= 4.5 ? 15 : rating >= 4.0 ? 8 : 0;
  parts.reviews = rCount + rRating;
  if (parts.reviews < 35) {
    issues.push({ lost: 35 - parts.reviews, key: "reviews",
      title: count === 0 ? "No Google reviews yet" : `${count} Google review${count === 1 ? "" : "s"}, ${rating.toFixed(1)}★`,
      fix: "Ask every customer for a review with your Google review link or a QR card, and reply to each one. 25+ recent reviews is the level where most local businesses start to compete." });
  }

  const score = Math.round(parts.schema + parts.faq + parts.profile + parts.reviews);
  return { score, parts, issues };
}

/*
 * Presence-lite (0–100): average cell over every query × engine that answered.
 * results: [{ engine: "ChatGPT", status: "ok"|"unavailable", cells: [{query, cell, ...}] }]
 */
export function presenceLite(results) {
  const answered = (results || []).filter((r) => r.status === "ok" && r.cells?.length);
  const cells = answered.flatMap((r) => r.cells.map((c) => Number(c.cell) || 0));
  if (!cells.length) return { score: null, engines: [], named: 0, total: 0, issues: [] };
  const score = Math.round((100 * cells.reduce((a, b) => a + b, 0)) / cells.length);
  const named = cells.filter((c) => c > 0).length;
  const issues = [];
  if (score < 100) {
    issues.push({ lost: (100 - score), key: "presence",
      title: (() => {
        const who = answered.length === 1 ? answered[0].engine : "AI assistants";
        return named === 0 ? `${who} didn't name you for your searches` : `${who} named you in ${named} of ${cells.length} answers`;
      })(),
      fix: "Assistants recommend businesses whose details match everywhere and who have pages and reviews that answer the exact question. The $79 Visibility Report shows what each assistant says about you and why." });
  }
  return { score, engines: answered.map((r) => r.engine), named, total: cells.length, issues };
}

export function quickScore(foundation, presence) {
  const f = foundation.score;
  const hasP = presence.score !== null && presence.score !== undefined;
  const score = hasP ? Math.round(0.5 * f + 0.5 * presence.score) : f;
  const band = score >= 71 ? "Getting found" : score >= 41 ? "Partially visible" : "Mostly invisible";
  // Each issue's weight in the quick score: both halves are 50%.
  const issues = [
    ...foundation.issues.map((i) => ({ ...i, impact: hasP ? i.lost * 0.5 : i.lost })),
    ...(hasP ? presence.issues.map((i) => ({ ...i, impact: i.lost * 0.5 })) : []),
  ].sort((a, b) => b.impact - a.impact);
  return { score, band, foundationOnly: !hasP, issues };
}

// ---------- signed tickets (stateless; HMAC-SHA256) ----------

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signTicket(payload, secret) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function verifyTicket(ticket, secret, now = Date.now()) {
  const [body, sig] = String(ticket || "").split(".");
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64u(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromB64u(body)));
  if (!payload.exp || payload.exp < now) return null;
  return payload;
}

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(String(s)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

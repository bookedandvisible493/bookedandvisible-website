# Work Log — bookedandvisible-website

## 2026-09-05 19:07 UTC — Phase 1 complete: subscriptions retired site-wide + Payhip

**Website (9 files pushed live to `main`, verified deployed via Cloudflare Pages):**

| File | Commit |
|---|---|
| `index.html` | `203a2a1` |
| `pricing/index.html` | `0466144` |
| `landing-pages/index.html` | `c7a98f1` |
| `whats-included/index.html` | `960caac` |
| `faq/index.html` | `0134518` |
| `refund-policy.html` | `88c2b25` |
| `terms.html` | `1843a52` |
| `privacy.html` | `315b84b` |
| `guides/booked-visible-vs-pay-per-lead-directories/index.html` | `fa4d0f9` |
| `ai-visibility/index.html` (earlier in this batch) | `93815db` |

All subscription/membership framing (Visible $49/mo, Booked $119/mo, Site Care $39/mo) removed from live copy. Site now presents Starter Kit ($129), AI Visibility Report ($49), AI Visibility Boost ($99), and Landing Pages ($329+) as one-time purchases only. Verified live at bookedandvisible.ca (homepage, pricing, and the cost-comparison guide) with `get_page_text` — all reflect one-time pricing.

Local clone was reset to match `origin/main` (`fa4d0f9`) since these 9 commits were pushed via the GitHub web editor (direct git push to this repo is blocked in this environment) — local git history had a stale single-commit version of the same edits that is now superseded.

**Payhip (3 subscription products retired to Draft — no live subscribers, so retired outright rather than wound down):**

- Visible Membership (`qe0ab`) — Draft
- Booked Membership (`p5EHo`) — Draft
- Site Care (`wuleH`) — Draft

All three confirmed via the Products list showing status `DRAFT`. Nobody can purchase or enroll; existing product pages remain in the account (not deleted).

**Next (Phase 3, not started):** new Payhip SKUs — Bundle ($189), Quarterly AI Visibility Re-Check ($39), Content Refresh Pack ($59/2 updates).

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

**Payhip (3 subscription products retired to Draft — no live subscribers, so retired outright rather than wound down): Visible Membership (`qe0ab`), Booked Membership (`p5EHo`), and Site Care (`wuleH`) are all now Draft.**

All three confirmed via the Products list showing status `DRAFT`. Nobody can purchase or enroll; existing product pages remain in the account (not deleted).

**Next (Phase 3, not started):** new Payhip SKUs — Bundle ($189), Quarterly AI Visibility Re-Check ($39), Content Refresh Pack ($59/2 updates).

***

## 2026-09-05 22:35 UTC — Materials QA audit + Gap fixes (Gap 2 done, Gap 1 content done, Gap 3 done, Payhip file-swap blocked)

Ran a full QA pass across the live site, Payhip catalog, and the actual Starter Kit deliverable content (see `claude/32-materials-qa-audit-2026-09-05.md` in the Project). Found 3 gaps; user approved fixing all of them.

**Gap 2, Payhip landing-page visibility and naming, fixed and live:** `MkP9n` (All-In) was renamed to "...(Single Page, Domain Included)" with Visibility set to Unlisted, and `8JOZo` (BYOD) was renamed to "...(Single Page, Bring Your Own Domain)" with Visibility also set to Unlisted.

**Gap 1, Starter Kit guides still plumbing-specific, content fixed and pushed to the Project, not yet live on Payhip:** All 6 guides plus the master checklist were rewritten trade-neutral (trades, clinics, and recreation/agriculture examples throughout) and pushed to the Claude Project as the new source-of-truth .md files. 00-start-here.md was already neutral, so no change was needed there. PDFs were regenerated via pandoc with the wkhtmltopdf engine, verified for content completeness, and renamed to match the live Payhip filenames exactly (1 through 7).

**Gap 3, landing-page order-confirmation docs describing the old 2-tier model, fixed and pushed to the Project, not yet live on Payhip:** Checked the attached confirmation files on all 6 landing-page tier products. Turned out only the two Single Page tier products (MkP9n at $389, 8JOZo at $329) still had the stale generic confirmation PDFs, with a 5-day turnaround and no tier framing. The other 4 tiers (4YaJw, Ep5af, UL7Pl, FJ10D) already have correct, tier-specific confirmation PDFs and up-to-date descriptions from the August 3-tier restructure. Rewrote lp-allin-confirmation.md and lp-byod-confirmation.md for the Single Page tier (3 business days, not 5, plus the $50/page add-on and a pointer to the other tiers), pushed to the Project, and regenerated as LP-AllIn-Confirm.pdf and LP-BYOD-Confirm.pdf.

**New gap found, not yet fixed:** the live Starter Kit product (gFj9f) is missing the QR-Review-Card-Template.pdf and Social-Post-Graphic-Template.png attachments that its own guides and product description promise are included.

**Blocker, Payhip file replacement cannot be automated from this session:** browser automation (Claude in Chrome) can click Payhip's "Delete" on an attached file, but "Upload another product file" opens a native OS file picker that automation cannot see or drive. This was confirmed with two separate approaches this session, a cloud-sandbox file, and a file placed directly in the connected bookedandvisible-website/payhip-updates folder on the user's Mac. Mid-fix, this deleted "1 - Google Business Profile Walkthrough.pdf" from the live Starter Kit product without being able to re-upload it. Flagged to the user immediately and told to hold off touching anything else on that product until they do the one manual upload. All 9 corrected files (7 guides plus 2 confirmation docs) are staged in bookedandvisible-website/payhip-updates on the user's Mac and were also sent to them in-chat, ready for manual upload.

**Housekeeping:** the working .md sources, generated PDFs, and the QA audit doc for this pass were temporarily created inside this git-tracked website repo by mistake, and have been moved out to /home/claude/payhip-content/ (outside git) since they're Payhip and Project deliverables, not site content, and don't belong in bookedandvisible-website version control.

**Still open:** the user needs to manually upload the 9 corrected files to their respective Payhip products (Starter Kit x7, MkP9n, 8JOZo); the user, or a future session, needs to source and attach QR-Review-Card-Template.pdf and Social-Post-Graphic-Template.png to the Starter Kit; and the not-yet-tested list from the original audit (Payhip images beyond Starter Kit, full site link crawl, mobile rendering) has not been started.

***

## 2026-09-06 16:56 UTC — Missing Starter Kit template files created (QR card + social graphic)

Built the two files the Starter Kit description and guides promise but that were never attached to the live product: QR-Review-Card-Template.pdf and Social-Post-Graphic-Template.png.

QR-Review-Card-Template.pdf is new — generated with reportlab, matching the brand's navy/amber palette. Two pages: business-card size (3.5x2 in, two copies with cut marks) and countertop/stand size (4x6 in), each with a dashed placeholder box labeled to paste in a customer's own Google-review QR code. Rendered to PNG and visually checked for text overflow and layout balance before finalizing (first draft had text slightly overrunning the QR placeholder box, and the 4x6 version had an unbalanced gap at the bottom, both fixed).

Social-Post-Graphic-Template.png already existed in the Project (uploaded 2026-08-06) and just needed the exact filename and a final look, confirmed it's a real, finished 1080x1080 template with a photo box, headline box, and business-name/phone line, exactly as described in the guides. No changes needed, just staged for upload.

Both files pushed to bookedandvisible-website/payhip-updates on the user's Mac (now 11 files total in that folder) and sent in-chat. Same upload blocker as before applies, these are new attachments, not replacements, so they just need "Upload another product file" clicked twice on the Starter Kit product, no delete step required.

**Full list of files now staged and ready for manual upload (11 total):**

| # | File | Destination Payhip product | Action |
|---|---|---|---|
| 1 | `1 - Google Business Profile Walkthrough.pdf` | Starter Kit (`gFj9f`) | Re-upload, currently MISSING from the live product |
| 2 | `2 - Review-Generation System.pdf` | Starter Kit (`gFj9f`) | Delete old, upload new |
| 3 | `3 - Social Post Templates.pdf` | Starter Kit (`gFj9f`) | Delete old, upload new |
| 4 | `4 - Local Directory and NAP Checklist.pdf` | Starter Kit (`gFj9f`) | Delete old, upload new |
| 5 | `5 - Project Photo Guide.pdf` | Starter Kit (`gFj9f`) | Delete old, upload new |
| 6 | `6 - Follow-Up and Referral Sequence.pdf` | Starter Kit (`gFj9f`) | Delete old, upload new |
| 7 | `7 - Master Checklist.pdf` | Starter Kit (`gFj9f`) | Delete old, upload new |
| 8 | `QR-Review-Card-Template.pdf` | Starter Kit (`gFj9f`) | New attachment, add |
| 9 | `Social-Post-Graphic-Template.png` | Starter Kit (`gFj9f`) | New attachment, add |
| 10 | `LP-AllIn-Confirm.pdf` | Landing Page, Single Page/Domain Included (`MkP9n`) | Delete old, upload new |
| 11 | `LP-BYOD-Confirm.pdf` | Landing Page, Single Page/BYOD (`8JOZo`) | Delete old, upload new |

All 11 files live in `bookedandvisible-website/payhip-updates/` on the user's Mac and were sent in-chat. File #1 is the most urgent since the live product is currently missing it entirely.

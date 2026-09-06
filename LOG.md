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

***

## 2026-09-06 — Homepage kit tile 04 restored (regression from Phase 1)

User reported "Step 4 on the website is missing." Traced with `git log -p -- index.html` to commit `203a2a1` ("Retire subscription framing on homepage (Phase 1)") — an unrelated diff accidentally dropped the entire "04 — Local directory checklist" tile from the homepage's 6-tile Starter Kit grid (`grid-6`), leaving it numbered 01, 02, 03, 05, 06 while the eyebrow still read "six pieces." `whats-included/index.html` was never affected — item 04 was intact there the whole time, which is what made this a homepage-only regression rather than a content decision.

Fixed by re-inserting the exact original tile markup (icon SVG, copy) between 03 and 05, restoring the sequential 01–06 grid. Verified locally via static server: page text now lists 01 through 06 in order, and the 6-column grid renders without a gap. Local clone was 13 commits behind `origin/main` at the start of this session (the Phase 1 batch above, plus 3 more `LOG.md`/template commits) — reset to `origin/main` before touching anything, per the repo's `CLAUDE.md` sync-check workflow.

Pushed directly via `git push` (this session has `gh auth login` configured as `bookedandvisible493`, wired to git via `gh auth setup-git`, so no web-editor workaround was needed here).


***

## 2026-09-06 17:50 UTC — All 11 Payhip files confirmed live, mixed-upload mistake caught and corrected

The user completed the manual upload pass. Checking the three affected products directly found the batch had landed in one place instead of three: all 11 files, including the two landing page confirmation docs, were attached to the Starter Kit product, and 0 - Start Here.pdf was dropped from the Starter Kit in the process, while the two landing page products still carried their old stale 5kb confirmation files untouched.

Deleted LP-AllIn-Confirm.pdf and LP-BYOD-Confirm.pdf from the Starter Kit using browser automation, since Payhip's delete confirmation is a page-rendered modal rather than a native dialog and is safe to automate. 0 - Start Here.pdf did not exist anywhere as a real file, only as extracted text from an old upload, so it was regenerated from scratch using the same pandoc plus wkhtmltopdf pipeline and shared stylesheet as the other seven guides, sourced from the 00-start-here.md content the original audit had already confirmed did not need any content changes. The user then re-uploaded 0 - Start Here.pdf to the Starter Kit and the two confirmation docs to their correct landing page products.

Final state verified directly on all three product edit pages: the Starter Kit (gFj9f) carries exactly the ten files it should, 0 - Start Here.pdf through 7 - Master Checklist.pdf plus QR-Review-Card-Template.pdf and Social-Post-Graphic-Template.png, with nothing extra. MkP9n carries the corrected 30kb LP-AllIn-Confirm.pdf, and 8JOZo carries the corrected 26kb LP-BYOD-Confirm.pdf. Every gap from the 2026-09-05 audit is now resolved and live.

Still open, carried over from the original audit: Payhip product images beyond the Starter Kit, a full site link crawl, and mobile rendering checks.


***

## 2026-09-06 18:12 UTC — Site-wide check for retired-product references, AI Visibility stat swapped to a Canada-inclusive figure

User asked for a review of the whole site, including secondary pages, for leftover references to products no longer offered, and asked that AI Visibility content focus on Canada rather than the US.

Checked all 30 live HTML pages for subscription and membership language, retired Payhip product links (the three retired memberships plus the old two-tier landing page codes), stale turnaround-day figures, and the plumbing-only framing flagged earlier this session as a possible regression. All of it came back clean. The subscription and membership mentions that do exist are all the intended kind, copy stating there is no subscription. The retired product IDs only appear inside archive slash index dot html and archive slash whats-included dot html, both excluded from robots dot txt, absent from sitemap dot xml, and not linked from any live page, so they were left as-is. The landing page turnaround figures, three days for one page, five for three pages, seven for five pages, are internally consistent, not a leftover. The plumbing-specific hero copy from the original single-trade version of the site also only survives in the archived homepage; the live homepage, about page, and guides already describe multiple trades and two real non-plumbing clients.

Found one real issue: the AI Visibility page's third stat tile cited "of U.S. local businesses," which does not fit a Canadian business's site. Researched for a genuine Canada-specific replacement rather than inventing one. Current public research on AI-search visibility turned out to be almost entirely US-only or blended US-and-Canada; no clean Canada-only version of that stat exists yet. The best real, citable Canada-inclusive figure found was Courtyard's July 2026 "State of AI Visibility" report, which scores Canada at 50 out of 100 for AI understanding versus the US at 51, calling the two "effectively tied," across 50 US and Canadian markets and roughly 600 businesses tested with four AI assistants. Replaced the old stat tile with that figure, reframed around Canadian businesses with the US shown only as the comparison point, and updated the sources line under the stat tiles to name that report. The other two stat tiles do not name a country and were left alone.

Pushed directly via the GitHub web editor, since direct git push is still blocked in this session. The edit briefly triggered the CodeMirror auto-close-tag bug documented earlier in this log, duplicating a closing tag and swallowing a neighboring div's closing tag; caught immediately via careful line-by-line review before committing, fixed by hand, and reverified with a get_page_text read of the full file plus, after pulling locally, an actual div open or close tag count on the file, 75 and 75. Commit b8bd75d.

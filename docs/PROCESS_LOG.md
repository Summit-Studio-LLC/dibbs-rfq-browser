# Process Log: how we built the Solicitation Browser

A running record of how Noah and Claude (Claude Code, Opus 5.5) worked through the
DIBBS Solicitation Browser assignment: who drove each step, what we learned,
and why each decision was made. Entries are appended as we go.

Date: 2026-10-14

---

## 1. Kickoff: Noah frames the collaboration
- **Noah:** Pasted the assignment brief and set the mode: *"work with me to accomplish it."*
- **Claude:** Treated reaching the data source as the biggest risk, since everything
  depends on whether DIBBS can be pulled from a script. Started there before picking a stack.

## 2. Automated recon of DIBBS (Claude)
- `GET https://www.dibbs.bsm.dla.mil/RFQ/` redirects to `dodwarning.aspx`, a DoD
  Warning & Consent gate. It's an ASP.NET WebForms postback (24 `__VIEWSTATE` chunks + `butAgree=OK`).
- Replaying the postback from Python works: we land on `/rfq/` with a session
  (`SessionId`, `dw`, `di`, and two `TS…` load-balancer cookies).
- The cookies have to stay in one HTTP session. Handing them from Python to curl sent us
  back to the consent page.
- Entry points found on the RFQ landing page:
  `RfqDates.aspx?category=issue|close|recent`, `RfqFsc.aspx` (by supply class), `/AcqDownloads/`.

## 3. Noah steers: "involve me in the process"
- **Noah:** Stopped Claude from running more automated fetches and opened the
  project in Cursor. Asked to explore DIBBS together in Chrome instead.
- **Why it matters:** Noah wanted to see the source data first-hand (what vendors
  actually see, which fields exist) before committing to a scraper design or filter set.
- **Claude:** Opened DIBBS in Noah's Chrome. It hit the same DoD consent page. Claude
  paused rather than accepting a government use notice on Noah's behalf.
- **Noah:** Accepted the consent banner himself and asked Claude to keep this log.

## 4. Exploring DIBBS RFQ pages together (Chrome)

**RFQ search page (`/rfq/`): DIBBS's own idea of useful filters.**
- "Show Only" checkboxes: Automated Indefinite Delivery Contract (AIDC), Items with
  Technical Documents, Fast Award Candidates, and set-asides (Small Business, HUBZone,
  SDVOSB, WOSB, EDWOSB, Combined, Unrestricted).
- Search by: NSN/Part #, Federal Supply Class (FSC), Solicitation #, PR, Nomenclature,
  Approved CAGE, Approved Part #. Sort by issue date / return-by date.
- These tell us which filters real vendors already rely on, so they're a starting point for ours.

**Recent RFQs page (`RfqDates.aspx?category=recent`): bulk daily files.**
- About a month of posting dates (09-14 → 10-13). Each date has three downloads on
  `dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/`:
  - `ca{yymmdd}.zip`: every solicitation document (PDF) for the day. Heavy.
  - `in{yymmdd}.txt`: **fixed-width index of every RFQ posted that day.**
  - `bq{yymmdd}.zip`: batch-quote CSV (rich per-line-item data) plus an `as` file of
    **approved sources** (NSN, CAGE, part #, company name).
  - `bqothers.zip`: all *other* open RFQs in batch-quote format.
- Today's file only appears the next day, because DIBBS appends to it throughout the day.

**Documented `in` file layout (`RfqFileDefs.aspx`).**
| Field | Len | Notes |
|---|---|---|
| Solicitation # | 13 | |
| NSN/Part # | 46 | |
| Purchase Request # | 13 | |
| Return By Date | 8 | MM/DD/YY |
| File Name | 19 | e.g. `SPM1C107T0669.html` |
| QTY | 7 | |
| Unit of Issue | 2 | |
| Nomenclature | 21 | |
| Buyer Code | 5 | |
| AMSC | 1 | Acquisition Method Suffix Code |
| Item type | 1 | 1 = NSN, 2 = Part Number |
| Set-aside | 1 | Y SB, H HUBZone, R SDVOSB, L WOSB, A 8(a), E EDWOSB, N none |
| Set-aside % | 3 | |

**Takeaway (direction, not yet decided):** DIBBS publishes structured daily exports,
so we may not need to scrape HTML result tables at all. Pulling the `in` + `bq` files
could give us more fields, with less fragility and less load on DIBBS.

**Gotcha:** the download host `dibbs2.bsm.dla.mil` has its **own** DoD consent gate,
so the ingester has to accept consent on both domains.

## 5. Architecture session (Noah + Claude)
- **Noah:** *"I vote we create a GitHub project with Vercel to host this on. Let's talk architecture."*
- **Claude proposed**, and Noah picked, each recommended option:
  - **Hosting:** public GitHub repo under Noah's personal account + personal Vercel scope
    (kept apart from the Summit Studio client team). Reviewers just click a link.
  - **Data source:** ingest DIBBS's published daily files (`in` fixed-width index + `bq`
    batch-quote CSV + `as` approved sources) instead of scraping HTML tables. That means
    structured data, more fields, a handful of requests per day, and less fragility.
  - **Store:** Neon Postgres via the Vercel Marketplace, with search and filtering done in
    SQL (full-text search + trigram for partial NSN/part # matches). Chosen over a static
    JSON snapshot, which would need a redeploy for every refresh and grows with history.
  - **Ingestion:** one ingester module, called both by a daily Vercel Cron route and a
    local `pnpm ingest` CLI.
- **Biggest risk named up front:** DIBBS might block requests from Vercel's AWS IP ranges.
  Mitigation: deploy a reachability probe *before* building UI. If it's blocked, seed
  from a laptop and the demo still works.
- **Starting filter set (vendor's first question is "can I bid, and is it worth it?"):**
  set-aside type, return-by window, FSC (supply class from the NSN), posted date,
  quantity, AMSC, NSN vs part number. Stretch: "enter your CAGE → RFQs where you're an
  approved source."
- **Stack:** Next.js App Router + TypeScript, Tailwind + shadcn/ui, Drizzle on Neon's
  serverless driver, Vercel Cron.

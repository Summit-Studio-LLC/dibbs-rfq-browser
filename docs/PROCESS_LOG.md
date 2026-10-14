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

## 6. Repo + hosting setup
- Next.js 16.4 scaffolded (`create-next-app`, TS, Tailwind, App Router, `src/`), branch `master`.
- Public repo created: https://github.com/Noahbanderson/dibbs-rfq-browser
- **Misstep (Claude):** `vercel link --scope noah-anderson` was rejected ("cannot set your
  Personal Account as the scope"). The follow-up `vercel git connect --yes` then silently
  auto-linked to the CLI's default team, creating an empty project `summit-studio/sales_patriot`.
  Claude caught it, removed the local `.vercel` link, and flagged it to Noah instead of
  deleting anything on the team account unasked. Lesson: never chain `--yes` commands after
  a scope failure. Verify the link target first.
- The Vercel GitHub App also lacks access to the personal repo, so it can't connect yet.

## 7. Noah: "Which RFQ page section are we using? How do we download the data?"
- Neither search form. *Custom Queries* is a structured search of DIBBS's database, and
  *Solicitation Text Search* is a keyword search inside solicitation documents. Both return
  paginated ASP.NET result pages we'd have to scrape.
- We use **Recent RFQs → daily download files** (linked under "Other Search Options"),
  served from `dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/`.

## 8. Noah narrows scope: "3 days' worth, it's a POC, get to UI + data decisions sooner"
- Claude dropped the separate Vercel-reachability step (it gets folded into the first deploy
  of the ingest route) and pulled the latest posting days locally into `data/raw/` (gitignored):
  Tue 10/13 = 2,204 line items, Mon 10/12 = 7,295, Sun 10/11 = 6.
- The TypeScript `DibbsSession` (per-host cookie jar + manual redirects + automatic consent
  click-through) worked on the first run against both hosts.

## 9. Noah: "Which format should we use, zip, txt or bq? And why?"
Decision: **`in.txt` is the spine, `bq.zip` is enrichment, skip `ca.zip`.**
- `ca.zip` holds the solicitation PDFs: heavy and unstructured. Each row links to its PDF on DIBBS instead.
- `in.txt` is required. It's the only file with the **item name** (nomenclature, which is what
  vendors search for), **AMSC**, buyer code, and the PDF filename (our link back to DIBBS).
- `bq.zip` adds the evaluation fields: solicitation type (Fast auto-eval / auto-eval / AIDC /
  manual, matching DIBBS's own "Fast Award" + "AIDC" filters), **required delivery days**,
  FOB + inspection point, and the `as` approved-sources file (CAGE + manufacturer part #).
- Verified the join: (solicitation #, PR #) matches 100% both ways on both days (9,497 line items).
  `bq` has extra rows per line item, which get collapsed.

**Data profile (10/12–10/13, ~9.5k line items):**
- Set-aside: 85% unrestricted, 12% small business, ~1.5% each SDVOSB / HUBZone, <1% WOSB.
- Solicitation type (by `bq` row): 72% fast auto-eval, 25% auto-eval, 1.4% AIDC, 1.3% manual.
- FOB: 93% origin. Inspection: 75% destination, 25% origin (a gov't inspector at the vendor's plant).
- 277 distinct FSCs. Top: 5305 screws, 5310 nuts/washers, 4820 valves, 4720 hose/tube, 5340 hardware.
- Buying office (solicitation prefix): SPE4A 43%, SPE7M 30%, SPE7L 17%, SPE2D 4%, SPE8E 3%.
- Qty: median 15, p90 445, max 318,000. Required delivery: median 164 days (p10 20, p90 213).
- Return-by dates cluster 1–2 weeks out (10/16–10/26). 99.9% of items are NSNs (not bare part numbers).

## 10. Noah: "What I care about is what kind of fields can we search by?"
Checked the approved-sources file before answering: ~70% of RFQ NSNs have ≥1 approved
source (~2.5k distinct CAGEs), but the company-name column is blank in ~100% of rows, so
CAGE + part # are searchable and company name is not. One row had a stray quote inside a
part number, so the CSV parser needs to be tolerant.

Searchable: solicitation #, NSN (with or without dashes, plus NIIN), item name
(nomenclature: noun-first, truncated at 21 chars, so partial matching is needed),
approved manufacturer part #, approved-source CAGE, PR #.
Not available anywhere in the files: company names, full item descriptions/specs (PDF only), price/value.

## 11. Blank page live on Vercel with Neon connected
- **Noah:** "Let's get a blank Vercel page up and running with Neon configured and connected,
  then talk data modelling, then UI."
- Shipped: landing page (static shell + streamed DB status), `/api/health` (Neon), and
  `/api/health/dibbs` (DIBBS reachability), deployed from `master` via the Git integration.
- **Production:** https://salespatriot-bay.vercel.app. Neon answers in ~50–75 ms.
- **The biggest risk is retired:** DIBBS is reachable from Vercel (iad1), consent included. It's
  slow (~15 s to consent and list dates, vs ~2 s locally), which is fine for a daily cron
  inside the 300 s function limit. The laptop fallback isn't needed.
- A background security review flagged `/api/health` for echoing raw DB driver errors (which
  can include connection details). Fixed: log server-side, return a generic message.

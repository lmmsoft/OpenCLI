# HKPL OpenCLI Roadmap

Last reviewed: 2026-05-07

This plan is based on the current HKPL account/catalog pages plus official HKPL service descriptions. Official references checked:

- HKPL mobile app features: <https://www.hkpl.gov.hk/en/about-us/services/mobileapp.html>
- HKPL mobile app FAQ: <https://www.hkpl.gov.hk/en/about-us/services/mobile-app/faq.html>
- HKPL internet renewal flow: <https://www.hkpl.gov.hk/en/about-us/services/lending/renew-internet.html>
- HKPL self-service kiosk/catalog account functions: <https://www.hkpl.gov.hk/en/about-us/services/computer/catalogueterminal.html>

## Current Adapter Coverage

Implemented:

- `hkpl login`: verify login and patron name.
- `hkpl loans`: list current borrowed physical items.
- `hkpl renew`: renew items due within a configurable date window.
- `hkpl history`: list visible checkout/return/renewal history rows when history retention is enabled; follows visible history pagination.
- `hkpl detail`: fetch catalog bibliographic details for one item.
- `hkpl download`: download cover image when available.

Known constraints:

- Current-loans pages do not expose original borrow dates.
- Checkout history is only visible after `儲存借還記錄 (最多12個月)` is enabled, and HKPL may not backfill old rows.
- HKPL account pages are Wicket-generated and page IDs change; commands should prefer fresh account-page fetches and avoid storing Wicket URLs long term.

## Priority 0: Family Automation Reliability

1. `hkpl dump-account`
   - Purpose: one command to capture login status, loans, due-soon renewal candidates, history, and item details into JSON/Markdown.
   - Why: this directly supports scheduled family archiving without stitching `loans`, `history`, and `detail` externally.
   - Output: `account.json`, `loans.json`, `history.json`, `items.json`, optional Markdown summary.

2. `hkpl accounts-renew`
   - Purpose: read a local private accounts config and renew all configured accounts due within N days.
   - Why: the family use case has multiple cards; a multi-account wrapper prevents missed renewals.
   - Safety: dry-run default or explicit `--confirm`; never print full card numbers or passwords.

3. `hkpl settings`
   - Purpose: read account settings, especially notification method and checkout-history retention.
   - Why: history retention needs monitoring because it controls whether future returned books are archived.
   - Possible follow-up: `hkpl settings enable-history` if the Wicket form flow is stable enough.

4. `hkpl history --all-visible`
   - Purpose: keep the current pagination behavior explicit and add row-count diagnostics.
   - Why: current page exposes 50 visible rows via pagination; future UI changes should be easy to verify.

## Priority 1: Account Management Commands

1. `hkpl holds`
   - List reservations/holds, pickup branch, queue/status, expiry, and cancellation links.
   - Useful for checking whether requested children books are ready to collect.

2. `hkpl fees`
   - List outstanding charges and fee descriptions.
   - Useful as a daily/weekly health check alongside renewals.

3. `hkpl notifications`
   - Read paperless/e-mail notification settings.
   - Useful for making sure overdue and pickup notices are going to the right e-mail.

4. `hkpl change-password` or documented non-goal
   - Account page exposes password changes, but this is sensitive and lower value.
   - Recommendation: do not implement until there is a clear rotation workflow.

## Priority 2: Catalog Discovery and Reservation

1. `hkpl search`
   - Search catalog by title/author/keyword/ISBN.
   - Include item ID, title, author, year, material type, availability summary, and detail URL.

2. `hkpl availability <itemId>`
   - Parse branch holdings, shelf status, due date if on loan, and reservation availability.
   - High family value: know which nearby library has a book before visiting.

3. `hkpl reserve <itemId>`
   - Place a reservation with pickup location.
   - Needs careful confirmation because it creates real account-side actions and may incur reservation fees.

4. `hkpl my-list`
   - Read and manage saved lists in the account.
   - Lower priority than search/reserve, but useful for family reading wishlists.

## Priority 3: Content Enrichment

1. `hkpl covers --from-json`
   - Batch-download covers for items already captured in `children-book-details.json`.
   - Useful for making the KB reading record visually browsable.

2. `hkpl isbn <isbn>`
   - ISBN lookup mirroring the mobile app's barcode-search use case.
   - Useful when checking whether a physical book seen outside the library exists in HKPL.

3. `hkpl recommend-by-history`
   - Local-only helper that clusters archived history by author/series/subject and suggests catalog searches.
   - Not a website adapter core command; better as a KB/report script after enough history exists.

## Priority 4: Public Library Information

1. `hkpl libraries`
   - Branch list, addresses, opening hours, holiday exceptions, and contact information.

2. `hkpl events`
   - Search library activities by district/date/kids keywords.
   - Useful for family outings, but separate from account automation.

3. `hkpl eresources`
   - Index e-book/e-database providers and account requirements.
   - Lower priority because many providers have separate platforms and auth flows.

## Suggested Build Order

1. Harden `history` pagination and row-count diagnostics.
2. Add `dump-account` for family KB archival.
3. Add multi-account `accounts-renew` using a private config file.
4. Add `holds` and `fees` because they share the account page/session model.
5. Add catalog `search` and `availability`.
6. Add guarded `reserve` after search/availability are stable.
7. Add batch cover download and branch/event discovery.

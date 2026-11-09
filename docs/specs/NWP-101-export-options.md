# SPEC · NWP-101 — Payments export: column and scope options

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** baba0
**Status:** reviewed

## Problem

Dana's ops team exports the payments table several times a day and every file
comes out the same: every column, current filter only. The card last four is in
all of them, so anything going to a merchant is edited by hand first — 3–4 hours
a month, and a near-miss last quarter where an unedited file nearly reached the
wrong merchant. They need to choose what goes in the file before it downloads.

## Current state

- `src/app/api/payments/export/route.ts` — builds the CSV. Already reuses the
  query builder (`parseFilters` → `filterPayments` → `sortPayments`) and already
  skips pagination, so the export is not limited to the visible page. Takes no
  column or scope input.
- `src/lib/csv.ts` — `toCsv(payments, columns = EXPORT_COLUMNS)`. **The column
  parameter already exists**; only the caller is missing. `cell()` renders
  `amount` through `formatMoney` and ships `currency` as its own column, so
  acceptance criterion 4 already holds.
- `src/lib/csv.ts` — `exportFilename(date)` produces `payments-<UTC date>.csv`.
  No scope in the name.
- `src/data/queries.ts` — `parseFilters` is documented as the allowlist
  checkpoint: "Route handlers call this rather than reading params themselves."
  New client input should follow that pattern rather than being read in the route.
- `src/data/queries.ts` — `queryPayments` returns `total`, the unpaginated count.
  The row count the dialog needs already exists behind `GET /api/payments`.
- `src/app/payments/page.tsx` — the Export button is a plain `<a>` to the export
  route carrying the current query string.
- `src/components/Drawer.tsx` — the repo's Radix-dialog primitive, with focus
  handling and Escape already wired.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Validate everything from the client against an allowlist | `.claude/rules/api-routes.md` | Column names reach a filename or a query unchecked |
| One query builder | `merchant-console/CLAUDE.md` #3 | A second filter path drifts from the list view |
| Money is integer minor units, formatted once at the edge | `merchant-console/CLAUDE.md` #1 | Cents drift; totals stop reconciling |
| Storage and bucketing are UTC | `merchant-console/CLAUDE.md` #2 | Filenames disagree with the rows inside |
| Dialogs must be operable: labels, accessible name, focus, Escape | `.claude/rules/components.md` | Ops cannot drive it from the keyboard |
| Use the components that are here | `.claude/rules/components.md` | A second dialog implementation to maintain |

## Approach

Add the two inputs where the existing allowlist already lives. `parseExportOptions`
in `src/lib/csv.ts` turns raw query parameters into a validated column list and a
scope, dropping anything not in `EXPORT_COLUMNS` — the same shape as `parseFilters`.
The route calls it, picks filters by scope, and passes the columns straight into
the `toCsv` seam that is already there. The dialog is a client component built on
`Drawer`, and it reads its row count from `GET /api/payments`, so no second
counting path appears.

**Considered and rejected:** building the CSV in the browser from the table rows
already on screen. It needs no new API surface, and it is the bug the ticket
warns about — `queryPayments` paginates at `PAGE_SIZE = 20`, so every export
would silently contain 20 rows.

**Also rejected:** a new `/api/payments/export/count` route. `GET /api/payments`
already returns `total` for a filter set; a second count path is the "second
implementation" the conventions call a defect.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | Add `DEFAULT_EXPORT_COLUMNS`, `ExportScope`, `parseExportOptions`; `exportFilename` takes an optional label | Validation and naming belong beside the column contract |
| `src/app/api/payments/export/route.ts` | Read options, choose filters by scope, pass columns through | Wire the seam that already exists |
| `src/app/payments/export-dialog.tsx` | New client component | The options UI |
| `src/app/payments/page.tsx` | Swap the plain link for the dialog | Entry point |
| `src/lib/csv.test.ts` | Extend | Cover the serializer and the new parsing |

## Plan

1. **`parseExportOptions` + filename label in `src/lib/csv.ts`** — done when: unknown
   column names are dropped, duplicates collapse, an empty selection stays empty,
   and `exportFilename(date, "disputed")` gives `payments-disputed-<date>.csv`.
2. **Route reads the options** — done when: `/api/payments/export?columns=id,amount`
   returns two columns, `&scope=all` ignores the active filters, and a junk column
   name changes nothing.
3. **Dialog** — done when: it opens from Export, last four starts unchecked, the
   count matches the table, and Download is disabled with nothing selected.
4. **Tests** — done when: `npx vitest run` is green and the original nine still pass.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Columns selectable, last four off by default | `DEFAULT_EXPORT_COLUMNS` excludes `last4`; unit test; dialog checked in the browser |
| Scope current filter / all, count visible, current filter default | Scope defaults to `filtered`; count read from `GET /api/payments`; checked in the browser |
| Filename reflects scope and date | Unit test on `exportFilename` |
| Amounts stay minor units, formatted once, currency separate | Unchanged `cell()` path; existing tests still pass |
| Empty selection disables Download | Dialog disables the button; `parseExportOptions` returns an empty list rather than defaulting |

## Risks

- A bookmarked export URL carries no `columns`. It must not start returning
  nothing, and it must not silently start including the last four again. The
  default is "every column except `last4`" — stated in a test so it cannot drift.
- `scope=all` across merchants mixes currencies in one file. Acceptable here:
  `currency` is its own column and nothing in the export sums amounts.

## Out of scope

- `sortPayments` sorts `amount` by `String(...).localeCompare(...)`, which orders
  amounts lexically rather than numerically, and its comment claims it matches the
  table. It is a real defect but it is not this ticket; it belongs in a bug report
  of its own.
- Scheduled or emailed exports. Not asked for.
- Persisting a user's column choice between sessions. The store is in memory.

## Open questions

- The ticket's filename example uses the status (`payments-disputed-...`). For a
  filter with no status but a merchant, this spec falls back to the plain
  `payments-<date>.csv` rather than inventing a label. Worth confirming with Dana.

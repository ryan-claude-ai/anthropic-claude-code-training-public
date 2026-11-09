# Northwind Payments — Merchant Console

The internal tool support and ops staff use to look up a payment, refund it, work the dispute queue, and issue virtual cards.

Northwind Payments is fictional. Every merchant, cardholder, amount, and card in this app is generated.

## Run it

```bash
npm install
npm run dev
```

No database, no seed step, no Docker.

## Data lives in memory

Seed data is JSON, loaded into a store module at boot. Route handlers read and write that store.

- Writes last for the life of the dev server and vanish on restart. That is expected.
- Persistence is tracked separately as NWP-203. **Do not add a database, an ORM, or migrations.**
- If you need more seed data, add it to the JSON. Never edit seed data to make a failing case disappear.

## Where the rest of the context lives

This file loads every session, so it stays short. Detail that only matters once you open a particular kind of file lives in `.claude/rules/` and loads when you do:

| Rule | Applies to |
| --- | --- |
| `money.md` | `src/lib/`, `src/app/api/`, `src/data/` |
| `api-routes.md` | `src/app/api/` |
| `cards.md` | anything card-related |
| `components.md` | `src/components/`, `src/app/` |

## Conventions

These four explain most of the code, and breaking them is how bugs get in here.

1. **Money is integer minor units.** `$250.00` is `25000`. No floats, no strings with currency symbols. Format once, at the edge, next to its currency code.
2. **Storage and bucketing are UTC.** Display converts to the merchant's timezone. Nothing else does.
3. **One query builder.** Payment filtering goes through the builder behind `GET /api/payments`. A second implementation is a bug, not a shortcut.
4. **Validate on the server.** Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store.

## Card rules

- Generated numbers use the `4242` test BIN and a valid Luhn check digit. Nothing here may resemble a real PAN.
- The full number is returned exactly once, in the creation response. After that, last four only.
- Status is a state machine: `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/` | Console routes: overview, payments, disputes, payouts. Cards is NWP-201 and does not exist yet |
| `src/app/api/` | Route handlers |
| `src/data/` | Seed JSON, the in-memory store, and types |
| `src/components/` | Tremor-based primitives and the console's own components |
| `src/lib/` | Money, date, and CSV helpers, each with a `.test.ts` beside it. Read these before touching an amount |

## Before you push

Run `npm test`, then `/ship-ready`. The skill checks the rules above, not just formatting.

## Toolchain

- Node 20 or newer. There is no `engines` field and no `.nvmrc`; verified working on Node 26.2.0 / npm 11.13.0.
- `npm run dev` serves on **http://localhost:3000**.

## Checks

| Command | What it covers |
| --- | --- |
| `npm test` | Vitest, whole suite |
| `npx vitest run src/lib/csv.test.ts` | One file, while iterating |
| `npm run lint` | ESLint via `next lint` |
| `npm run build` | Catches type and build errors the dev server tolerates |

Run `npm run lint` as well as `npm test` before pushing. A pull request is also
graded by `.github/workflows/anthropic-tenex-reviewer.yml`.

## Org standards apply here too

`docs/ORG-STANDARDS.md` at the repository root is what a reviewer cites, by item
number. The conventions above cover items 1, 2, 4, 5, 6, 7 and 8. Three are not
restated anywhere narrower, so they are easy to miss:

- **#3 The math adds up.** Totals equal the sum of their parts. Gross, net, fees
  and refunds reconcile; a number shown twice is derived once.
- **#9 Match the neighborhood.** New code follows the naming, layout and
  component patterns of the files around it.
- **#10 No debris.** No `console.log`, no commented-out code, no TODO on main.

## Currency, in components

Seed data is genuinely multi-currency (USD, EUR, GBP). `.claude/rules/money.md`
carries the rule that summing across currencies without converting is a bug, but
its `paths` cover `src/lib`, `src/app/api` and `src/data` — not `.tsx` files. So
the rule does not load in the one place totals get rendered.

In components: render a total only when every amount in it shares a currency.
Otherwise group by currency and render one total per group.

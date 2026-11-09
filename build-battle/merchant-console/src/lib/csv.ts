import { merchantById } from "@/data/merchants"
import { Payment } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * The caller chooses the columns. EXPORT_COLUMNS is both the allowlist and the
 * canonical order. DEFAULT_EXPORT_COLUMNS is what a caller that names none
 * gets, and it leaves out the card last four so a file bound for a merchant
 * does not carry it unasked. parseExportOptions is where client input is
 * checked before it reaches a header row or a filename.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

export type ExportScope = "filtered" | "all"

export interface ExportOptions {
  columns: ExportColumn[]
  scope: ExportScope
}

/**
 * What an export contains when the caller asks for nothing in particular:
 * every column except the card last four. An export URL bookmarked before
 * NWP-101 keeps working, and it stops carrying the one field ops had to strip
 * by hand before a file could go to a merchant.
 */
export const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = EXPORT_COLUMNS.filter(
  (column) => column !== "last4",
)

function isExportColumn(value: string): value is ExportColumn {
  return (EXPORT_COLUMNS as readonly string[]).includes(value)
}

/**
 * Column names and scope arrive from the client, so they are checked against
 * the allowlist here before they reach a header row or a filename.
 *
 * Unknown names are dropped rather than failing the request, so a stale link
 * still returns the columns it asked for that do exist. An explicit but empty
 * selection stays empty: the route answers that with a 400 rather than handing
 * ops a file with nothing in it.
 */
export function parseExportOptions(params: URLSearchParams): ExportOptions {
  const scope: ExportScope = params.get("scope") === "all" ? "all" : "filtered"
  const raw = params.get("columns")

  if (raw === null) return { columns: [...DEFAULT_EXPORT_COLUMNS], scope }

  const requested = new Set<ExportColumn>()
  for (const name of raw.split(",")) {
    const column = name.trim()
    if (isExportColumn(column)) requested.add(column)
  }

  return {
    columns: EXPORT_COLUMNS.filter((column) => requested.has(column)),
    scope,
  }
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

/**
 * The date is stamped in UTC, like everything else that is stored or bucketed,
 * so the name agrees with the rows inside whatever timezone ops is in.
 *
 * `label` names the scope — a status when the file follows the active filter,
 * or "all" when it ignores it. Omitted, the name is the plain dated one.
 */
export function exportFilename(date = new Date(), label?: string): string {
  const stamp = date.toISOString().slice(0, 10)
  return label
    ? `payments-${label}-${stamp}.csv`
    : `payments-${stamp}.csv`
}

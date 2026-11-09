import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import { PaymentFilters } from "@/data/types"
import {
  ExportScope,
  exportFilename,
  parseExportOptions,
  toCsv,
} from "@/lib/csv"
import { NextRequest } from "next/server"

/**
 * Exports the payments table as CSV.
 *
 * Columns and scope come from the client and are validated in
 * parseExportOptions before they reach a header row or a filename. Everything
 * still goes through the one query builder and is never paginated, so the file
 * is the whole result set rather than the page ops happens to be looking at.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const { columns, scope } = parseExportOptions(params)

  if (columns.length === 0) {
    return Response.json(
      { message: "Select at least one column to export." },
      { status: 400 },
    )
  }

  const filters = parseFilters(params)

  // filterPayments reads only the filter fields; ordering is applied separately
  // below. So the wide scope is honestly "no filters", not a filter set that
  // carries a sort the filter step would ignore.
  const scoped: PaymentFilters = scope === "all" ? {} : filters

  const rows = sortPayments(
    filterPayments(scoped),
    filters.sort,
    filters.direction,
  )

  const filename = exportFilename(new Date(), scopeLabel(scope, filters.status))

  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}

/**
 * What the file is called after "payments-": "all" when the export ignores the
 * active filter, the status when it follows one, and nothing when the filter
 * carries no status to name it by.
 */
function scopeLabel(
  scope: ExportScope,
  status: PaymentFilters["status"],
): string | undefined {
  if (scope === "all") return "all"
  return status && status !== "all" ? status : undefined
}

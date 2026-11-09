"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  type ExportColumn,
  type ExportScope,
} from "@/lib/csv"
import { Download } from "lucide-react"
import { useEffect, useState } from "react"

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Date (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

/**
 * Column and scope options for the payments export.
 *
 * The count comes from GET /api/payments, the same query builder the table
 * uses, so the number ops sees here is the number of rows they get. Nothing is
 * serialized in the browser: the file is built by the export route, because the
 * table on screen is one page of twenty.
 */
export function ExportDialog({ query }: { query: string }) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<ExportScope>("filtered")
  const [selected, setSelected] = useState<ExportColumn[]>([
    ...DEFAULT_EXPORT_COLUMNS,
  ])
  const [count, setCount] = useState<number | null>(null)
  const [countFailed, setCountFailed] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setCount(null)
    setCountFailed(false)

    const search = scope === "all" ? "" : query

    fetch(`/api/payments?${search}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json()
      })
      .then((data: { total: number }) => {
        if (!cancelled) setCount(data.total)
      })
      .catch(() => {
        if (!cancelled) setCountFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, scope, query])

  const toggle = (column: ExportColumn) => {
    setSelected((current) =>
      current.includes(column)
        ? current.filter((c) => c !== column)
        : EXPORT_COLUMNS.filter((c) => c === column || current.includes(c)),
    )
  }

  const downloadHref = () => {
    const params = new URLSearchParams(scope === "all" ? "" : query)
    params.delete("page")
    params.set("columns", selected.join(","))
    if (scope === "all") params.set("scope", "all")
    return `/api/payments/export?${params.toString()}`
  }

  const nothingSelected = selected.length === 0

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DrawerTrigger>

      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
          <DrawerDescription>
            Choose what goes in the file before it downloads.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-6">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Rows
            </legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  ["filtered", "Current filter"],
                  ["all", "All payments"],
                ] as const
              ).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`scope-${value}`}
                    name="scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="size-4 border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                  <label
                    htmlFor={`scope-${value}`}
                    className="text-sm text-gray-900 dark:text-gray-50"
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>

            <p
              aria-live="polite"
              className="mt-2 text-sm text-gray-500 dark:text-gray-500"
            >
              {countFailed
                ? "Row count unavailable — the file will still contain every matching row."
                : count === null
                  ? "Counting rows…"
                  : nothingSelected
                    ? `${count.toLocaleString()} ${count === 1 ? "row" : "rows"} match, but no columns are selected`
                    : `${count.toLocaleString()} ${count === 1 ? "row" : "rows"} will be exported`}
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            <div className="mt-2 space-y-2">
              {EXPORT_COLUMNS.map((column) => (
                <div key={column} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`column-${column}`}
                    checked={selected.includes(column)}
                    onChange={() => toggle(column)}
                    className="size-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                  <label
                    htmlFor={`column-${column}`}
                    className="text-sm text-gray-900 dark:text-gray-50"
                  >
                    {COLUMN_LABELS[column]}
                  </label>
                </div>
              ))}
            </div>

            {nothingSelected && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-500">
                Select at least one column to download.
              </p>
            )}
          </fieldset>
        </DrawerBody>

        <DrawerFooter className="gap-2">
          <DrawerClose asChild>
            <Button variant="secondary" className="w-full sm:w-fit">
              Cancel
            </Button>
          </DrawerClose>

          {nothingSelected ? (
            <Button disabled className="w-full gap-2 sm:w-fit">
              <Download className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
              Download
            </Button>
          ) : (
            <Button asChild className="w-full gap-2 sm:w-fit">
              <a href={downloadHref()} onClick={() => setOpen(false)}>
                <Download
                  className="-ml-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                Download
              </a>
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

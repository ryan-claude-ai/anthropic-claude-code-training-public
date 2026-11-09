import { describe, expect, it } from "vitest"
import { Payment } from "@/data/types"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  exportFilename,
  parseExportOptions,
  toCsv,
} from "./csv"

/**
 * The export is the file ops hands to a merchant, so a broken cell is a
 * support ticket rather than a stack trace. These tests pin the escaping and
 * the column contract; NWP-101 changes which columns ship, not how a cell is
 * written, and these should still pass afterwards.
 */

const payment: Payment = {
  id: "pay_0001",
  merchantId: "mch_01",
  amount: 25000,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

describe("toCsv", () => {
  it("writes a header row followed by one row per payment", () => {
    const lines = toCsv([payment]).split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("writes only the requested columns, in the order given", () => {
    expect(toCsv([payment], ["id", "amount"])).toBe(
      ["id,amount", "pay_0001,$250.00"].join("\n"),
    )
  })

  it("quotes cells containing a comma, so amounts do not split", () => {
    const large = { ...payment, amount: 123456789 }
    expect(toCsv([large], ["amount"])).toBe(['amount', '"$1,234,567.89"'].join("\n"))
  })

  it("doubles embedded quotes rather than dropping them", () => {
    const quoted = { ...payment, description: 'Order "rush"' }
    expect(toCsv([quoted], ["description"])).toBe(
      ["description", '"Order ""rush"""'].join("\n"),
    )
  })

  it("keeps a newline inside a description in one quoted cell", () => {
    const multiline = { ...payment, description: "Order 1180\nsecond line" }
    const body = toCsv([multiline], ["description"]).split("\n").slice(1).join("\n")
    expect(body).toBe('"Order 1180\nsecond line"')
  })

  it("resolves the merchant name, and falls back to the id when unknown", () => {
    expect(toCsv([payment], ["merchant"])).toContain("Lumen Coffee Roasters")
    const orphan = { ...payment, merchantId: "mch_missing" }
    expect(toCsv([orphan], ["merchant"])).toContain("mch_missing")
  })

  it("writes an empty cell for a payment with no card", () => {
    const bank: Payment = {
      ...payment,
      method: "bank_transfer",
      cardBrand: null,
      last4: null,
    }
    expect(toCsv([bank], ["card_brand", "last4"])).toBe(
      ["card_brand,last4", ","].join("\n"),
    )
  })

  it("emits a header even with no rows", () => {
    expect(toCsv([], ["id"])).toBe("id")
  })
})

describe("exportFilename", () => {
  it("stamps the UTC date, so two exports on the same day collide by design", () => {
    expect(exportFilename(new Date("2026-03-14T23:00:00.000Z"))).toBe(
      "payments-2026-03-14.csv",
    )
  })
})

describe("DEFAULT_EXPORT_COLUMNS", () => {
  it("leaves out the card last four, so an export never carries it unasked", () => {
    expect(DEFAULT_EXPORT_COLUMNS).not.toContain("last4")
  })

  it("keeps every other column, so an existing export link loses nothing else", () => {
    expect(DEFAULT_EXPORT_COLUMNS).toEqual(
      EXPORT_COLUMNS.filter((column) => column !== "last4"),
    )
  })
})

describe("parseExportOptions", () => {
  const options = (query: string) => parseExportOptions(new URLSearchParams(query))

  it("falls back to the default columns when the caller names none", () => {
    expect(options("status=disputed")).toEqual({
      columns: DEFAULT_EXPORT_COLUMNS,
      scope: "filtered",
    })
  })

  it("keeps only names on the allowlist", () => {
    expect(options("columns=id,password,amount").columns).toEqual(["id", "amount"])
  })

  it("drops a name that is not a column rather than failing the request", () => {
    expect(options("columns=id,../../etc/passwd").columns).toEqual(["id"])
  })

  it("collapses a repeated column", () => {
    expect(options("columns=id,id,amount").columns).toEqual(["id", "amount"])
  })

  it("returns columns in the canonical order, whatever order they arrived in", () => {
    expect(options("columns=currency,id,amount").columns).toEqual([
      "id",
      "amount",
      "currency",
    ])
  })

  it("keeps an explicit empty selection empty rather than defaulting", () => {
    expect(options("columns=").columns).toEqual([])
  })

  it("keeps an all-unknown selection empty rather than defaulting", () => {
    expect(options("columns=nope,also_nope").columns).toEqual([])
  })

  it("reads the wider scope only from the exact value", () => {
    expect(options("scope=all").scope).toBe("all")
    expect(options("scope=ALL").scope).toBe("filtered")
    expect(options("scope=everything").scope).toBe("filtered")
    expect(options("").scope).toBe("filtered")
  })
})

describe("exportFilename scope label", () => {
  const date = new Date("2026-08-13T23:30:00.000Z")

  it("names the status when the file follows the active filter", () => {
    expect(exportFilename(date, "disputed")).toBe("payments-disputed-2026-08-13.csv")
  })

  it("says all when the file ignores the filter", () => {
    expect(exportFilename(date, "all")).toBe("payments-all-2026-08-13.csv")
  })

  it("stays the plain dated name when there is no label to use", () => {
    expect(exportFilename(date, undefined)).toBe("payments-2026-08-13.csv")
  })
})

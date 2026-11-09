import { describe, expect, it } from "vitest";
import { formatCurrency, formatCurrencyPrecise, formatPercent } from "@/lib/formatters";

describe("formatters", () => {
  // CP-U46
  it("formatea soles y valores nulos", () => {
    expect(formatCurrency(1234.5)).toContain("1,234.50");
    expect(formatCurrency(null)).toContain("0.00");
    expect(formatCurrency("no-numero")).toContain("0.00");
  });

  // CP-U47
  it("formatea precisión y porcentaje", () => {
    expect(formatCurrencyPrecise(12.5)).toBe("12.50");
    expect(formatCurrencyPrecise(undefined)).toBe("0.00");
    expect(formatPercent("5")).toBe("5.0%");
    expect(formatPercent(NaN)).toBe("0%");
  });
});

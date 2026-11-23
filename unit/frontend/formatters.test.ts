// Pruebas unitarias de formateadores de moneda en soles, números y porcentajes.
import { describe, expect, it } from "vitest";
import { formatCurrency, formatCurrencyPrecise, formatPercent } from "@/lib/formatters";

describe("formatters", () => {
  // CP-U79
  it("formatea soles y valores nulos", () => {
    expect(formatCurrency(1234.5)).toContain("1,234.50");
    expect(formatCurrency(null)).toContain("0.00");
    expect(formatCurrency("no-numero")).toContain("0.00");
  });

  // CP-U80
  it("formatea precisión y porcentaje", () => {
    expect(formatCurrencyPrecise(12.5)).toBe("12.50");
    expect(formatCurrencyPrecise(undefined)).toBe("0.00");
    expect(formatPercent("5")).toBe("5.0%");
    expect(formatPercent(NaN)).toBe("0%");
  });

  // CP-U81
  it("incluye simbolo S/ en moneda y maneja strings numericos y null en porcentaje", () => {
    expect(formatCurrency("2500.5")).toMatch(/S\/\s*2,500\.50/);
    expect(formatCurrencyPrecise("10000.1")).toBe("10,000.10");
    expect(formatPercent(null)).toBe("0%");
    expect(formatPercent(12.345)).toBe("12.3%");
  });
});

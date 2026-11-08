import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  normalizeScheduleStartDate,
  calculateMonthlyDueDate,
  calculateDueDate,
} from "../../../abc_inversiones_api/src/modules/loans/loans.schedule.js";

describe("calculateDueDate", () => {
  it("mensual: 31/01 -> 28/02 y luego 31/03", () => {
    const start = DateTime.fromISO("2026-01-31", { zone: "America/Lima" });
    const d1 = calculateDueDate(start, 1, "monthly");
    const d2 = calculateDueDate(start, 2, "monthly");
    expect(d1.toFormat("yyyy-MM-dd")).toBe("2026-02-28");
    expect(d2.toFormat("yyyy-MM-dd")).toBe("2026-03-31");
  });
  it("bisiesto 2028: 31/01 -> 29/02", () => {
    const start = DateTime.fromISO("2028-01-31", { zone: "America/Lima" });
    const d1 = calculateDueDate(start, 1, "monthly");
    expect(d1.toFormat("yyyy-MM-dd")).toBe("2028-02-29");
  });
  it("frecuencias weekly/biweekly/daily", () => {
    const start = DateTime.fromISO("2026-05-08", { zone: "America/Lima" });
    expect(calculateDueDate(start, 1, "weekly").toFormat("yyyy-MM-dd")).toBe("2026-05-15");
    expect(calculateDueDate(start, 1, "biweekly").toFormat("yyyy-MM-dd")).toBe("2026-05-23");
    expect(calculateDueDate(start, 1, "daily").toFormat("yyyy-MM-dd")).toBe("2026-05-10");
  });
  it("normaliza fecha con hora a 00:00", () => {
    const start = DateTime.fromISO("2026-05-08T12:35:00", { zone: "America/Lima" });
    const d = calculateDueDate(start, 1, "weekly");
    expect(d.toFormat("HH:mm")).toBe("00:00");
  });
  it("rechaza frecuencia no soportada", () => {
    const start = DateTime.fromISO("2026-05-08", { zone: "America/Lima" });
    expect(() => calculateDueDate(start, 1, "foo" as any)).toThrow();
  });
});

describe("normalizeScheduleStartDate", () => {
  it("normaliza a inicio de dia en zona negocio", () => {
    const d = normalizeScheduleStartDate(new Date("2026-05-08T12:35:00.000Z"));
    expect(d.toFormat("HH:mm")).toBe("00:00");
  });
});

describe("calculateMonthlyDueDate", () => {
  it("mantiene dia original cuando cabe", () => {
    const start = DateTime.fromISO("2026-03-15", { zone: "America/Lima" });
    const d = calculateMonthlyDueDate(start, 1);
    expect(d.toFormat("yyyy-MM-dd")).toBe("2026-04-15");
  });
});

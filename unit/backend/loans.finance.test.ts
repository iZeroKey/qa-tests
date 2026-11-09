import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  roundMoney,
  calculateFixedInstallment,
  calculateLoanFinancials,
  buildInstallmentDrafts,
} from "../../../abc_inversiones_api/src/modules/loans/loans.finance.js";

describe("roundMoney", () => {
  // CP-U01
  it("redondea a 2 decimales", () => {
    expect(roundMoney(1.234)).toBe(1.23);
    expect(roundMoney(1.235)).toBe(1.24);
    expect(roundMoney(1.2)).toBe(1.2);
  });
  // CP-U02
  it("evita -0", () => {
    expect(roundMoney(-0.001)).toBe(0);
    expect(Object.is(roundMoney(-0.001), -0)).toBe(false);
  });
});

describe("calculateFixedInstallment", () => {
  // CP-U03
  it("calcula cuota fija para capital 10000, tasa 5%, 12 cuotas", () => {
    const r = calculateFixedInstallment({ principal: 10000, interestRate: 5, installmentsCount: 12 });
    expect(r).toBeCloseTo(1128.25, 2);
  });
  // CP-U04
  it("rechaza principal <= 0", () => {
    expect(() => calculateFixedInstallment({ principal: 0, interestRate: 5, installmentsCount: 12 })).toThrow();
    expect(() => calculateFixedInstallment({ principal: -100, interestRate: 5, installmentsCount: 12 })).toThrow();
  });
  // CP-U05
  it("rechaza tasa <= 0", () => {
    expect(() => calculateFixedInstallment({ principal: 1000, interestRate: 0, installmentsCount: 12 })).toThrow();
  });
  // CP-U06
  it("rechaza cuotas no enteras o <= 0", () => {
    expect(() => calculateFixedInstallment({ principal: 1000, interestRate: 5, installmentsCount: 0 })).toThrow();
    expect(() => calculateFixedInstallment({ principal: 1000, interestRate: 5, installmentsCount: 2.5 })).toThrow();
  });
  // CP-U07
  it("rechaza valores no finitos", () => {
    expect(() => calculateFixedInstallment({ principal: NaN, interestRate: 5, installmentsCount: 12 })).toThrow();
  });
});

describe("calculateLoanFinancials", () => {
  // CP-U08
  it("calcula deuda total e interes para 10000, 5%, 12", () => {
    const r = calculateLoanFinancials({ principal: 10000, interestRate: 5, installmentsCount: 12 });
    expect(r.totalDebt).toBe(13539);
    expect(r.totalInterest).toBe(3539);
    expect(r.roundedInstallmentAmount).toBe(1128.25);
  });
  // CP-U09
  it("rechaza cuota redondeada < 0.01", () => {
    expect(() => calculateLoanFinancials({ principal: 0.001, interestRate: 1, installmentsCount: 100 })).toThrow();
  });
  // CP-U10
  it("la deuda total siempre es >= principal para prestamos con interes", () => {
    const r = calculateLoanFinancials({ principal: 1000, interestRate: 1, installmentsCount: 1 });
    expect(r.totalDebt).toBeGreaterThanOrEqual(1000);
  });
  // CP-U11
  it("la suma de cuotas (centavos) coincide con la deuda total", () => {
    const r = calculateLoanFinancials({ principal: 2500, interestRate: 3, installmentsCount: 8 });
    const totalFromSchedule = roundMoney(r.roundedInstallmentAmount * 8);
    expect(totalFromSchedule).toBe(r.totalDebt);
  });
});

describe("buildInstallmentDrafts", () => {
  // CP-U12
  it("genera N cuotas con montos y fechas", () => {
    const start = DateTime.fromISO("2026-01-01", { zone: "America/Lima" });
    const r = buildInstallmentDrafts({
      loanId: "loan-1",
      principal: 1000,
      interestRate: 5,
      installmentsCount: 4,
      frequency: "monthly",
      startDate: start,
    });
    expect(r.installments).toHaveLength(4);
    expect(r.installments[0].status).toBe("pending");
    expect(r.installments[0].paidAmount).toBe("0.00");
    expect(r.totalDebt).toBeGreaterThan(1000);
  });
  // CP-U13
  it("rechaza parametros invalidos", () => {
    const start = DateTime.fromISO("2026-01-01", { zone: "America/Lima" });
    expect(() =>
      buildInstallmentDrafts({
        loanId: "loan-1",
        principal: 0,
        interestRate: 5,
        installmentsCount: 4,
        frequency: "monthly",
        startDate: start,
      }),
    ).toThrow();
  });
});

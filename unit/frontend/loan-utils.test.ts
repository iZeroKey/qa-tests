import { describe, expect, it } from "vitest";
import {
  clampPercent,
  createLoanSearchText,
  getInstallmentDisplayStatus,
  getLoanProgress,
  getNextInstallment,
  getRemainingDebt,
  getStatusGroup,
  getVisibleInstallments,
  hasOverdueInstallments,
  normalizeStatus,
  toNumber,
} from "@/features/loans/loan-utils";
import type { Installment, Loan } from "@/types/loans";

const loan: Loan = {
  id: "loan-1",
  publicCode: "PR-00001",
  clientCode: "CL-00001",
  clientName: "Ana Pérez",
  principal: "1000",
  totalDebt: "1200",
  totalPaid: "250",
  status: "active",
};

const installment = (number: number, status: string, paidAmount = 0): Installment => ({
  id: `inst-${number}`,
  installmentNumber: number,
  dueDate: `2026-0${number}-01T00:00:00.000Z`,
  amount: 300,
  paidAmount,
  status,
});

describe("loan-utils", () => {
  // CP-U48
  it("normaliza números y porcentajes", () => {
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("10.50")).toBe(10.5);
    expect(toNumber("bad")).toBe(0);
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  // CP-U49
  it("calcula pagos, progreso y saldo sin valores negativos", () => {
    expect(getLoanProgress(loan)).toBeCloseTo(20.8333, 3);
    expect(getRemainingDebt(loan)).toBe(950);
    expect(getRemainingDebt({ ...loan, totalPaid: "2000" })).toBe(0);
  });

  // CP-U50
  it("detecta estados de cuotas y préstamo", () => {
    expect(getInstallmentDisplayStatus(installment(1, "pending", 50))).toBe("partial");
    expect(getInstallmentDisplayStatus(installment(1, "paid", 300))).toBe("paid");
    expect(hasOverdueInstallments([installment(1, "overdue")])).toBe(true);
    expect(normalizeStatus(loan, [installment(1, "overdue")])).toBe("defaulted");
    expect(getStatusGroup("pending_admin_review")).toBe("pending");
  });

  // CP-U51
  it("elige cuotas visibles y la próxima cuota", () => {
    const installments = [
      installment(3, "pending"),
      installment(1, "paid", 300),
      installment(2, "pending"),
      installment(4, "pending"),
    ];
    const visible = getVisibleInstallments(installments);
    expect(visible.visible.map((item) => item.installmentNumber)).toEqual([1, 2, 3]);
    expect(visible.beforeCount).toBe(0);
    expect(visible.afterCount).toBe(1);
    expect(getNextInstallment(installments)?.installmentNumber).toBe(2);
  });

  // CP-U52
  it("crea texto de búsqueda con códigos, nombres y montos", () => {
    const text = createLoanSearchText(loan);
    expect(text).toContain("pr-00001");
    expect(text).toContain("ana pérez");
    expect(text).toContain("1000.00");
  });
});

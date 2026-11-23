// Pruebas unitarias de utilidades de progreso, saldo, cuotas visibles y búsqueda de préstamos.
import { describe, expect, it } from "vitest";
import {
  clampPercent,
  createLoanSearchText,
  formatDate,
  formatPreciseCurrencyWithSymbol,
  getInstallmentDisplayStatus,
  getInstallmentsPaidAmount,
  getLoanCardFooterIcon,
  getLoanCardFooterText,
  getLoanCardSecondaryLabel,
  getLoanCardSecondaryValue,
  getLoanCardTitle,
  getLoanPaidAmount,
  getLoanProgress,
  getLoanStatusColor,
  getLoanStatusLabel,
  getNextInstallment,
  getRemainingDebt,
  getStatusGroup,
  getVisibleInstallments,
  hasOverdueInstallments,
  isPaidOrPending,
  loanClientName,
  loanInvestorName,
  loanPublicCode,
  normalizeStatus,
  normalizeStatusFilter,
  personName,
  publicUserCode,
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
  // CP-U90
  it("normaliza números y porcentajes", () => {
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("10.50")).toBe(10.5);
    expect(toNumber("bad")).toBe(0);
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  // CP-U91
  it("calcula pagos, progreso y saldo sin valores negativos", () => {
    expect(getLoanProgress(loan)).toBeCloseTo(20.8333, 3);
    expect(getRemainingDebt(loan)).toBe(950);
    expect(getRemainingDebt({ ...loan, totalPaid: "2000" })).toBe(0);
  });

  // CP-U92
  it("detecta estados de cuotas y préstamo", () => {
    expect(getInstallmentDisplayStatus(installment(1, "pending", 50))).toBe("partial");
    expect(getInstallmentDisplayStatus(installment(1, "paid", 300))).toBe("paid");
    expect(hasOverdueInstallments([installment(1, "overdue")])).toBe(true);
    expect(normalizeStatus(loan, [installment(1, "overdue")])).toBe("defaulted");
    expect(getStatusGroup("pending_admin_review")).toBe("pending");
  });

  // CP-U93
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

  // CP-U94
  it("crea texto de búsqueda con códigos, nombres y montos", () => {
    const text = createLoanSearchText(loan);
    expect(text).toContain("pr-00001");
    expect(text).toContain("ana pérez");
    expect(text).toContain("1000.00");
  });

  // CP-U95
  it("calcula pagos desde cuotas cuando totalPaid no viene informado", () => {
    const list = [installment(1, "paid", 300), installment(2, "pending", 100)];
    expect(getInstallmentsPaidAmount(list)).toBe(400);
    expect(getLoanPaidAmount({ ...loan, totalPaid: undefined }, list)).toBe(400);
    expect(getRemainingDebt({ ...loan, totalPaid: undefined }, list)).toBe(800);
  });

  // CP-U96
  it("resuelve nombres, codigos y fechas de respaldo", () => {
    expect(personName({ firstName: "Luis", lastName: "Díaz" })).toBe("Luis Díaz");
    expect(personName(null, "ABC Inversiones")).toBe("ABC Inversiones");
    expect(publicUserCode(null)).toBe("Sin código");
    expect(loanPublicCode(loan)).toBe("PR-00001");
    expect(loanClientName(loan)).toBe("Ana Pérez");
    expect(loanInvestorName(loan)).toBe("ABC Inversiones");
    expect(formatDate(null)).toBe("Sin fecha");
    expect(formatDate("invalid-date")).toBe("Sin fecha");
    expect(formatPreciseCurrencyWithSymbol("1234.5")).toBe("S/ 1,234.50");
  });

  // CP-U97
  it("ventana visible maneja lista vacia, <=3 cuotas y todas pagadas", () => {
    expect(getVisibleInstallments([]).total).toBe(0);
    const allPaid = [
      installment(1, "paid", 300),
      installment(2, "paid", 300),
      installment(3, "paid", 300),
      installment(4, "paid", 300),
    ];
    const windowPaid = getVisibleInstallments(allPaid);
    expect(windowPaid.visible.map((i) => i.installmentNumber)).toEqual([2, 3, 4]);
    expect(windowPaid.beforeCount).toBe(1);
    expect(windowPaid.afterCount).toBe(0);
  });

  // CP-U98
  it("clasifica colores, etiquetas y textos de tarjetas por estado", () => {
    expect(isPaidOrPending("paid")).toBe(true);
    expect(isPaidOrPending("pending_investor_review")).toBe(true);
    expect(isPaidOrPending("active")).toBe(false);
    expect(normalizeStatusFilter("pending_admin_review")).toBe("pending");
    expect(getLoanStatusLabel("pending_investor_review")).toBe("Pendiente");
    expect(getLoanStatusColor("defaulted")).toBe("border-l-destructive");
    expect(getLoanCardTitle({ ...loan, status: "pending_admin_review" })).toBe("Monto solicitado");
    expect(getLoanCardTitle(loan)).toBe("Principal");
    expect(getLoanCardSecondaryLabel({ ...loan, status: "paid" })).toBe("Fecha fin");
    expect(getLoanCardSecondaryValue(loan)).toBe(950);
    expect(getLoanCardFooterIcon("rejected")).toBe("x");
    expect(getLoanCardFooterText("paid")).toBe("Préstamo pagado");
  });
});

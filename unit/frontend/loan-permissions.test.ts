// Pruebas unitarias de reglas de permisos en interfaz para préstamos, pagos y vouchers.
import { describe, expect, it } from "vitest";
import {
  canCreateLoan,
  canDeleteVoucher,
  canEditVoucher,
  canProcessVoucher,
  canRegisterPayment,
  canReviewLoan,
  canUploadVoucher,
  getLoanRole,
  getRoleCopy,
  isAdminUser,
} from "@/features/loans/loan-permissions";
import type { Loan, PaymentVoucher } from "@/types/loans";

const owner = { id: "owner-1", role: "admin", isOwner: true };
const admin = { id: "admin-1", role: "admin", isOwner: false };
const investorA = { id: "inv-a", role: "investor", isOwner: false };
const investorB = { id: "inv-b", role: "investor", isOwner: false };
const clientA = { id: "cli-a", role: "client", isOwner: false };

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
  id: "loan-1",
  clientId: "cli-a",
  investorId: "inv-a",
  status: "active",
  ...overrides,
});

const makeVoucher = (overrides: Partial<PaymentVoucher> = {}): PaymentVoucher => ({
  id: "v-1",
  loanId: "loan-1",
  clientId: "cli-a",
  amount: "100.00",
  operationId: "OP123456",
  status: "pending_investor_review",
  ...overrides,
});

describe("loan-permissions", () => {
  // CP-U84
  it("identifica roles y textos por perspectiva", () => {
    expect(isAdminUser(owner)).toBe(true);
    expect(isAdminUser({ id: "u", role: "client", isOwner: true })).toBe(true);
    expect(isAdminUser(clientA)).toBe(false);
    expect(getLoanRole(admin)).toBe("admin");
    expect(getLoanRole(investorA)).toBe("investor");
    expect(getLoanRole(clientA)).toBe("client");
    expect(getLoanRole(null)).toBe("client");
    expect(getRoleCopy("admin").title).toBe("Préstamos");
    expect(getRoleCopy("investor").title).toBe("Inversiones");
    expect(getRoleCopy("client").title).toBe("Mis préstamos");
  });

  // CP-U85
  it("canCreateLoan, canRegisterPayment y canUploadVoucher respetan rol y estado", () => {
    expect(canCreateLoan(admin)).toBe(true);
    expect(canCreateLoan(investorA)).toBe(false);
    expect(canCreateLoan(clientA)).toBe(false);

    expect(canRegisterPayment(makeLoan({ status: "active" }), admin)).toBe(true);
    expect(canRegisterPayment(makeLoan({ status: "pending_admin_review" }), admin)).toBe(false);
    expect(canRegisterPayment(makeLoan({ status: "active" }), investorA)).toBe(false);

    expect(canUploadVoucher(makeLoan({ status: "active" }), clientA)).toBe(true);
    expect(canUploadVoucher(makeLoan({ status: "paid" }), clientA)).toBe(false);
    expect(canUploadVoucher(makeLoan({ status: "active" }), admin)).toBe(false);
  });

  // CP-U86
  it("canReviewLoan valida estados revisables y asignacion del inversionista", () => {
    expect(canReviewLoan(null, admin)).toBe(false);
    expect(canReviewLoan(makeLoan({ status: "active" }), admin)).toBe(false);
    expect(canReviewLoan(makeLoan({ status: "pending_investor_review" }), investorA)).toBe(true);
    expect(canReviewLoan(makeLoan({ status: "pending_investor_review" }), investorB)).toBe(false);
    expect(canReviewLoan(makeLoan({ status: "pending_investor_review", investorId: null }), investorA)).toBe(false);
    expect(canReviewLoan(makeLoan({ status: "pending_admin_review" }), admin)).toBe(true);
  });

  // CP-U87
  it("canEditVoucher y canDeleteVoucher controlan edicion y eliminacion por rol y estado", () => {
    expect(canEditVoucher(makeVoucher({ status: "pending_investor_review" }), "client", "cli-a")).toBe(true);
    expect(canEditVoucher(makeVoucher({ status: "pending_investor_review" }), "client", "cli-b")).toBe(false);
    expect(canEditVoucher(makeVoucher({ status: "owner_approved" }), "client", "cli-a")).toBe(false);
    expect(canEditVoucher(makeVoucher({ status: "owner_approved" }), "admin", "admin-1")).toBe(true);
    expect(canEditVoucher(makeVoucher({ status: "pending_admin_review" }), "admin", "admin-1")).toBe(false);

    expect(canDeleteVoucher(makeVoucher({ status: "pending_admin_review" }), "client", "cli-a")).toBe(true);
    expect(canDeleteVoucher(makeVoucher({ status: "investor_approved" }), "client", "cli-a")).toBe(false);
    expect(canDeleteVoucher(makeVoucher({ status: "owner_approved" }), "admin", "admin-1")).toBe(true);
    expect(canDeleteVoucher(makeVoucher({ status: "deleted" }), "admin", "admin-1")).toBe(false);
  });

  // CP-U88
  it("canProcessVoucher aplica flujo de aprobacion inversionista -> admin", () => {
    const loan = makeLoan({ investorId: "inv-a" });
    expect(canProcessVoucher(makeVoucher({ status: "pending_investor_review" }), loan, "investor", "inv-a")).toBe(true);
    expect(canProcessVoucher(makeVoucher({ status: "pending_investor_review" }), loan, "investor", "inv-b")).toBe(false);
    expect(canProcessVoucher(makeVoucher({ status: "pending_admin_review" }), loan, "investor", "inv-a")).toBe(false);

    expect(canProcessVoucher(makeVoucher({ status: "pending_investor_review" }), loan, "admin", "admin-1")).toBe(false);
    expect(canProcessVoucher(makeVoucher({ status: "pending_admin_review" }), loan, "admin", "admin-1")).toBe(true);
    expect(canProcessVoucher(makeVoucher({ status: "investor_approved" }), loan, "admin", "admin-1")).toBe(true);
    expect(canProcessVoucher(makeVoucher({ status: "pending_admin_review" }), loan, "client", "cli-a")).toBe(false);
  });

  // CP-U89
  it("canReviewLoan no permite a inversionista aprobar prestamo en pending_admin_review", () => {
    // Defecto conocido (loan-permissions.ts:53-67): retorna true para inversionista en pending_admin_review.
    expect(canReviewLoan(makeLoan({ status: "pending_admin_review" }), investorA)).toBe(false);
  });
});

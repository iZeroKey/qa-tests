// Pruebas unitarias de esquemas de validación Zod para los módulos del backend.
import { describe, it, expect } from "vitest";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  changePasswordSchema,
} from "../../../abc_inversiones_api/src/modules/auth/auth.schema.js";
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  linkAuthAccountSchema,
  selfUpdateUserSchema,
} from "../../../abc_inversiones_api/src/modules/users/users.schema.js";
import {
  createAccessRequestSchema,
  updateRequestStatusSchema,
} from "../../../abc_inversiones_api/src/modules/access-requests/access-requests.schema.js";
import {
  createLoanSchema,
  rejectLoanSchema,
  updateLoanSchema,
} from "../../../abc_inversiones_api/src/modules/loans/loans.schema.js";
import {
  createPaymentSchema,
  updatePaymentSchema,
} from "../../../abc_inversiones_api/src/modules/payments/payments.schema.js";
import {
  createVoucherSchema,
  normalizeOperationId,
  operationIdLookupSchema,
  processVoucherSchema,
  updateVoucherSchema,
} from "../../../abc_inversiones_api/src/modules/payment-vouchers/payment-vouchers.schema.js";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("Esquemas Zod del backend", () => {
  // CP-U49
  it("auth schemas validan login, refresh, register estricto y changePassword", () => {
    expect(loginSchema.safeParse({ email: "a@abc.com", password: "password123" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "malo", password: "123" }).success).toBe(false);
    expect(refreshSchema.safeParse({ refresh_token: "" }).success).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "nuevo@abc.com",
        password: "password123",
        firstName: "Ana",
        lastName: "Lopez",
        unknownField: true,
      }).success,
    ).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "123" }).success).toBe(false);
  });

  // CP-U50
  it("users schemas aplican superRefine en createAuthAccount y strictObject", () => {
    expect(
      adminCreateUserSchema.safeParse({
        firstName: "Sin",
        lastName: "Acceso",
        createAuthAccount: false,
      }).success,
    ).toBe(true);

    const missingAuth = adminCreateUserSchema.safeParse({
      firstName: "Con",
      lastName: "Acceso",
      createAuthAccount: true,
    });
    expect(missingAuth.success).toBe(false);

    expect(selfUpdateUserSchema.safeParse({ firstName: "Ana", role: "admin" }).success).toBe(false);
    expect(adminUpdateUserSchema.safeParse({ email: "", active: false }).success).toBe(true);
    expect(linkAuthAccountSchema.safeParse({ email: "a@abc.com", password: "password123" }).success).toBe(true);
  });

  // CP-U51
  it("access-requests schemas validan solicitud publica y union discriminada de estado", () => {
    expect(
      createAccessRequestSchema.safeParse({
        email: "req@abc.com",
        firstName: "Luis",
        lastName: "Gomez",
        phone: "999888777",
        roleRequested: "investor",
      }).success,
    ).toBe(true);
    expect(updateRequestStatusSchema.safeParse({ status: "approved" }).success).toBe(false);
    expect(updateRequestStatusSchema.safeParse({ status: "approved", initialPassword: "password123" }).success).toBe(
      true,
    );
    expect(updateRequestStatusSchema.safeParse({ status: "rejected", observation: "No procede" }).success).toBe(true);
  });

  // CP-U52
  it("loans schemas validan rangos, strictObject y fechas ISO con offset", () => {
    const valid = createLoanSchema.safeParse({
      clientId: VALID_UUID,
      principal: "1000",
      interestRate: "5",
      installmentsCount: 12,
      startDate: "2026-01-01T00:00:00-05:00",
    });
    expect(valid.success).toBe(true);
    expect(
      createLoanSchema.safeParse({
        clientId: VALID_UUID,
        principal: "Infinity",
        interestRate: "5",
        installmentsCount: 4,
        startDate: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      createLoanSchema.safeParse({
        clientId: VALID_UUID,
        principal: "1000",
        interestRate: "5",
        installmentsCount: 121,
        startDate: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(updateLoanSchema.safeParse({ name: null, unknown: 1 }).success).toBe(false);
    expect(rejectLoanSchema.safeParse({ observation: "Riesgo" }).success).toBe(true);
  });

  // CP-U53
  it("payments schemas rechazan montos no finitos como 'Infinity'", () => {
    // Defecto conocido: payments.schema acepta 'Infinity'.
    const createRes = createPaymentSchema.safeParse({
      loanId: VALID_UUID,
      amount: "Infinity",
    });
    expect(createRes.success).toBe(false);

    const updateRes = updatePaymentSchema.safeParse({ amount: "Infinity" });
    expect(updateRes.success).toBe(false);
  });

  // CP-U54
  it("payments schemas aceptan paymentDate ISO con offset de zona horaria (-05:00)", () => {
    // Defecto conocido: payments.schema rechaza ISO con offset horario.
    const res = createPaymentSchema.safeParse({
      loanId: VALID_UUID,
      amount: "100",
      paymentDate: "2026-05-01T10:30:00-05:00",
    });
    expect(res.success).toBe(true);
  });

  // CP-U55
  it("payment-vouchers schemas normalizan operationId y rechazan fecha futura", () => {
    expect(normalizeOperationId("  op-123 / ab ")).toBe("OP123AB");
    expect(operationIdLookupSchema.parse({ operationId: " ref-001 " }).operationId).toBe("REF001");
    expect(processVoucherSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(updateVoucherSchema.safeParse({ amount: "150", extra: true }).success).toBe(false);

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      createVoucherSchema.safeParse({
        loanId: VALID_UUID,
        amount: "100",
        operationId: "OP123456",
        operationDate: futureDate,
      }).success,
    ).toBe(false);
  });

  // CP-U56
  it("payment-vouchers schemas rechazan montos no finitos como 'Infinity'", () => {
    // Defecto conocido: payment-vouchers.schema acepta 'Infinity'.
    expect(
      createVoucherSchema.safeParse({
        loanId: VALID_UUID,
        amount: "Infinity",
        operationId: "OP123456",
      }).success,
    ).toBe(false);
    expect(updateVoucherSchema.safeParse({ amount: "Infinity" }).success).toBe(false);
  });
});

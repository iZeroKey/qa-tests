// Pruebas unitarias de constantes y etiquetas de estados, frecuencias y métodos de pago.
import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  frequencyLabels,
  installmentStatusLabels,
  interestPeriodLabels,
  paymentMethodLabels,
  statusFilters,
  statusLabels,
  voucherStatusLabels,
} from "@/features/loans/loan-constants";

describe("loan-constants", () => {
  // CP-U82
  it("define filtros y etiquetas completas de estado y frecuencia", () => {
    expect(PAGE_SIZE).toBe(10);
    expect(statusFilters.map((f) => f.value)).toEqual([
      "all",
      "active",
      "pending",
      "paid",
      "defaulted",
      "rejected",
    ]);
    expect(frequencyLabels).toMatchObject({
      daily: "Diario",
      weekly: "Semanal",
      biweekly: "Quincenal",
      monthly: "Mensual",
    });
    expect(interestPeriodLabels.monthly).toBe("mensual");
    expect(statusLabels.active).toBe("Activo");
    expect(statusLabels.paid).toBe("Pagado");
  });

  // CP-U83
  it("define etiquetas para estados de cuotas, metodos de pago y vouchers", () => {
    expect(installmentStatusLabels).toMatchObject({
      pending: "Pendiente",
      partial: "Parcial",
      paid: "Pagado",
      overdue: "Vencido",
    });
    expect(paymentMethodLabels).toMatchObject({
      cash: "Efectivo",
      transfer: "Transferencia",
      deposit: "Depósito",
      other: "Otro",
    });
    expect(voucherStatusLabels).toMatchObject({
      pending_investor_review: "Pendiente",
      pending_admin_review: "En espera",
      investor_approved: "Aprobado por inversionista",
      investor_rejected: "Rechazado por inversionista",
      owner_approved: "Aprobado",
      owner_rejected: "Rechazado",
    });
  });
});

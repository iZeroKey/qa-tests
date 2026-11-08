import { describe, expect, it } from "vitest";
import { createDefaultLoanForm } from "@/features/loans/loan-form";
import { buildWebSocketUrl } from "@/lib/realtime";

describe("realtime y formulario de préstamos", () => {
  it("convierte URLs HTTP a WebSocket y elimina rutas sobrantes", () => {
    expect(buildWebSocketUrl("https://api.example.com/api/v1?x=1#hash")).toBe("wss://api.example.com/ws");
    expect(buildWebSocketUrl("http://localhost:3000")).toBe("ws://localhost:3000/ws");
  });

  it("crea un formulario con valores iniciales válidos", () => {
    const form = createDefaultLoanForm();
    expect(form).toMatchObject({
      clientId: "",
      investorId: "",
      principal: "0",
      interestRate: "0",
      installmentsCount: "12",
      frequency: "monthly",
    });
    expect(form.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

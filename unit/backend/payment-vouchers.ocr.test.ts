import { describe, it, expect } from "vitest";
import {
  extractVoucherDataFromText,
} from "../../../abc_inversiones_api/src/modules/payment-vouchers/payment-vouchers.ocr.service.js";

describe("extractVoucherDataFromText", () => {
  // CP-U21
  it("extrae banco, operacion, monto y fecha", () => {
    const text = "BCP Nro Operacion 123456789 Importe S/ 1,234.56 Fecha 06/04/2026";
    const r = extractVoucherDataFromText(text);
    expect(r.bank).toBe("BCP");
    expect(r.operationId).toBe("123456789");
    expect(r.amount).toBe("1234.56");
    expect(r.operationDate).toBe("2026-04-06");
  });

  // CP-U22
  it("reconoce fecha textual en espanol", () => {
    const text = "Interbank Operacion 987654321 Monto S/ 500.00 Fecha 6 de abril de 2026";
    const r = extractVoucherDataFromText(text);
    expect(r.bank).toBe("INTERBANK");
    expect(r.operationId).toBe("987654321");
    expect(r.amount).toBe("500.00");
    expect(r.operationDate).toBe("2026-04-06");
  });

  // CP-U23
  it("normaliza importe con espacios y coma decimal", () => {
    const text = "BBVA Operacion 11223344 Monto S/ 1 234,50 Fecha 01/02/2026";
    const r = extractVoucherDataFromText(text);
    expect(r.bank).toBe("BBVA");
    expect(r.amount).toBe("1234.50");
  });

  // CP-U24
  it("devuelve null para texto sin datos reconocibles", () => {
    const r = extractVoucherDataFromText("texto sin informacion");
    expect(r.amount).toBeNull();
    expect(r.operationId).toBeNull();
    expect(r.operationDate).toBeNull();
    expect(r.bank).toBeNull();
  });

  // CP-U25
  it("reconoce YAPE/PLIN", () => {
    const r1 = extractVoucherDataFromText("YAPE Operacion 55667788 Monto S/ 10.00 Fecha 10/10/2025");
    expect(r1.bank).toBe("YAPE");
    const r2 = extractVoucherDataFromText("PLIN Operacion 99887766 Monto S/ 20.00 Fecha 11/11/2025");
    expect(r2.bank).toBe("PLIN");
  });

  // CP-U26
  it("extrae datos de voucher real: fecha 07/11/2026, monto 150.00, operacion 0098432107", () => {
    const text = "FECHA: 07/11/2026 NRO. DE REFERENCIA: 0098432107 MONTO: S/. 150,00";
    const r = extractVoucherDataFromText(text);
    expect(r.operationDate).toBe("2026-11-07");
    expect(r.operationId).toBe("0098432107");
    expect(r.amount).toBe("150.00");
  });
});

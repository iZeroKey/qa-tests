// Pruebas unitarias del parser OCR sobre texto extraído de comprobantes de pago.
import { describe, it, expect } from "vitest";
import {
  extractVoucherDataFromText,
} from "../../../abc_inversiones_api/src/modules/payment-vouchers/payment-vouchers.ocr.service.js";

describe("extractVoucherDataFromText", () => {
  // CP-U30
  it("extrae banco, operacion, monto y fecha", () => {
    const text = "BCP Nro Operacion 123456789 Importe S/ 1,234.56 Fecha 06/04/2026";
    const r = extractVoucherDataFromText(text);
    expect(r.bank).toBe("BCP");
    expect(r.operationId).toBe("123456789");
    expect(r.amount).toBe("1234.56");
    expect(r.operationDate).toBe("2026-04-06");
  });

  // CP-U31
  it("reconoce fecha textual en espanol", () => {
    const text = "Interbank Operacion 987654321 Monto S/ 500.00 Fecha 6 de abril de 2026";
    const r = extractVoucherDataFromText(text);
    expect(r.bank).toBe("INTERBANK");
    expect(r.operationId).toBe("987654321");
    expect(r.amount).toBe("500.00");
    expect(r.operationDate).toBe("2026-04-06");
  });

  // CP-U32
  it("normaliza importe con espacios y coma decimal", () => {
    const text = "BBVA Operacion 11223344 Monto S/ 1 234,50 Fecha 01/02/2026";
    const r = extractVoucherDataFromText(text);
    expect(r.bank).toBe("BBVA");
    expect(r.amount).toBe("1234.50");
  });

  // CP-U33
  it("devuelve null para texto sin datos reconocibles", () => {
    const r = extractVoucherDataFromText("texto sin informacion");
    expect(r.amount).toBeNull();
    expect(r.operationId).toBeNull();
    expect(r.operationDate).toBeNull();
    expect(r.bank).toBeNull();
  });

  // CP-U34
  it("reconoce YAPE/PLIN", () => {
    const r1 = extractVoucherDataFromText("YAPE Operacion 55667788 Monto S/ 10.00 Fecha 10/10/2025");
    expect(r1.bank).toBe("YAPE");
    const r2 = extractVoucherDataFromText("PLIN Operacion 99887766 Monto S/ 20.00 Fecha 11/11/2025");
    expect(r2.bank).toBe("PLIN");
  });

  // CP-U35
  it("extrae datos de voucher real: fecha 07/11/2026, monto 150.00, operacion 0098432107", () => {
    const text = "FECHA: 07/11/2026 NRO. DE REFERENCIA: 0098432107 MONTO: S/. 150,00";
    const r = extractVoucherDataFromText(text);
    expect(r.operationDate).toBe("2026-11-07");
    // Defecto conocido: no extrae el NRO. DE REFERENCIA 0098432107 cuando aparece tras ese rótulo.
    expect(r.operationId).toBe("0098432107");
    expect(r.amount).toBe("150.00");
  });

  // CP-U36
  it("reconoce SCOTIABANK, fecha con anio de 2 digitos y mes setiembre/septiembre", () => {
    const r1 = extractVoucherDataFromText("SCOTIABANK Transaccion: AB123456 Monto S/ 250.00 Fecha 15/09/26");
    expect(r1.bank).toBe("SCOTIABANK");
    expect(r1.operationId).toBe("AB123456");
    expect(r1.amount).toBe("250.00");
    expect(r1.operationDate).toBe("2026-09-15");

    const r2 = extractVoucherDataFromText("BBVA Voucher 77889900 Monto S/ 80.00 5 de setiembre de 2026");
    expect(r2.operationDate).toBe("2026-09-05");
  });

  // CP-U37
  it("reconoce banco BANBIF declarado en el dominio", () => {
    // Defecto conocido: BANBIF declarado en SupportedBank pero sin regex.
    const r = extractVoucherDataFromText("BANBIF Operacion 44556677 Monto S/ 300.00 Fecha 01/05/2026");
    expect(r.bank).toBe("BANBIF");
  });

  // CP-U38
  it("reconoce 'BANCO DE CRÉDITO' con tilde como BCP", () => {
    // Defecto conocido: typo CR[EE]DITO falla con acento 'BANCO DE CRÉDITO'.
    const r = extractVoucherDataFromText("BANCO DE CRÉDITO Operacion 11223344 Monto S/ 100.00 Fecha 02/05/2026");
    expect(r.bank).toBe("BCP");
  });

  // CP-U39
  it("interpreta correctamente montos con separador de miles sin decimales ('S/ 1,000')", () => {
    // Defecto conocido: monto entero con separador de miles sin decimales.
    const r = extractVoucherDataFromText("BCP Operacion 99887766 Monto S/ 1,000 Fecha 03/05/2026");
    expect(r.amount).toBe("1000.00");
  });

  // CP-U40
  it("rechaza fechas de calendario inexistentes como 31/02/2026", () => {
    // Defecto conocido: fecha inexistente 31/02/2026 no es rechazada.
    const r = extractVoucherDataFromText("BCP Operacion 12345678 Monto S/ 50.00 Fecha 31/02/2026");
    expect(r.operationDate).toBeNull();
  });
});

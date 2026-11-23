// Pruebas de integración de validaciones y escaneo OCR en /payment-vouchers/analyze.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs, request, seededEmails } from "../helpers/integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMALL_VOUCHER = path.resolve(__dirname, "../fixtures/voucher-small.png");
const LARGE_VOUCHER = path.resolve(__dirname, "../fixtures/voucher-sample.jpg");
const INVALID_FILE = path.resolve(__dirname, "../fixtures/invalid-file.txt");

let clientToken: string;
let investorToken: string;

beforeAll(async () => {
  clientToken = await loginAs(seededEmails.client);
  investorToken = await loginAs(seededEmails.investor);
});

describe("OCR de vouchers", () => {
  // CP-I59
  it("analizar voucher sin evidencia responde 400", async () => {
    const response = await request.post("/api/v1/payment-vouchers/analyze").set(authHeader(clientToken));
    expect(response.status).toBe(400);
  });

  // CP-I60
  it("rechaza archivo no imagen (400) y rol no autorizado (403) en OCR", async () => {
    const badMime = await request
      .post("/api/v1/payment-vouchers/analyze")
      .set(authHeader(clientToken))
      .attach("evidence", INVALID_FILE);
    expect(badMime.status).toBe(400);

    const forbidden = await request
      .post("/api/v1/payment-vouchers/analyze")
      .set(authHeader(investorToken))
      .attach("evidence", SMALL_VOUCHER);
    expect(forbidden.status).toBe(403);
  });

  // CP-I61
  it("rechaza con 413 una imagen que supera el límite de 1.5 MB del endpoint OCR", async () => {
    const tooLarge = await request
      .post("/api/v1/payment-vouchers/analyze")
      .set(authHeader(clientToken))
      .attach("evidence", LARGE_VOUCHER);
    expect(tooLarge.status).toBe(413);
  });

  // CP-I62
  it("OCR con imagen: analizar voucher con imagen válida menor a 1.5 MB", async () => {
    const response = await request
      .post("/api/v1/payment-vouchers/analyze")
      .set(authHeader(clientToken))
      .attach("evidence", SMALL_VOUCHER);
    // Defecto conocido: sin credenciales ADC (NO_ADC_FOUND) devuelve HTTP 500 y detiene la API.
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("extracted");
  });
});

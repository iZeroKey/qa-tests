import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs, request, seededEmails } from "../helpers/integration.js";

let clientToken: string;

beforeAll(async () => {
  clientToken = await loginAs(seededEmails.client);
});

describe("OCR de vouchers", () => {
  it("analizar voucher sin evidencia responde 400", async () => {
    const response = await request.post("/api/v1/payment-vouchers/analyze").set(authHeader(clientToken));
    expect(response.status).toBe(400);
  });

  it("OCR con imagen: analizar voucher con imagen real", async () => {
    const response = await request
      .post("/api/v1/payment-vouchers/analyze")
      .set(authHeader(clientToken))
      .attach("evidence", "C:/Zero/Dev/qa/test/fixtures/voucher-sample.jpg");
    expect(response.status).toBe(200);
  });
});

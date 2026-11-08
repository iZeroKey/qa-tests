import { beforeAll, describe, expect, it } from "vitest";
import {
  authHeader,
  createTestLoan,
  getUserByEmail,
  loginAs,
  request,
  seededEmails,
  uniqueOperationId,
} from "../helpers/integration.js";

let adminToken: string;
let clientToken: string;
let clientId: string;
let loanId: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
  clientId = (await getUserByEmail(seededEmails.client)).id;
  loanId = (await createTestLoan(adminToken, clientId)).id;
  const approve = await request.patch(`/api/v1/loans/${loanId}/approve`).set(authHeader(adminToken));
  expect([200, 201]).toContain(approve.status);
});

async function createVoucher(amount = "75") {
  const operationId = uniqueOperationId("VOUCHER");
  const response = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({ loanId, amount, operationId, operationDate: "2026-04-06T00:00:00.000Z" });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; operationId: string; amount: string };
}

describe("gestión de vouchers", () => {
  it("envía un voucher con evidencia y lo lista", async () => {
    const operationId = uniqueOperationId("EVIDENCE");
    const response = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientToken))
      .field("loanId", loanId)
      .field("amount", "150")
      .field("operationId", operationId)
      .field("operationDate", "2026-04-06T00:00:00.000Z")
      .attach("evidence", "C:/Zero/Dev/qa/test/fixtures/voucher-sample.jpg");
    expect(response.status).toBe(201);
    expect(response.body.data.operationId).toBe(operationId);

    const list = await request.get("/api/v1/payment-vouchers").set(authHeader(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((voucher: { operationId: string }) => voucher.operationId === operationId)).toBe(true);
  });

  it("verifica duplicados, procesa, actualiza y elimina vouchers", async () => {
    const voucher = await createVoucher();
    const exists = await request
      .get("/api/v1/payment-vouchers/operation-id/exists")
      .query({ operationId: voucher.operationId })
      .set(authHeader(clientToken));
    expect(exists.status).toBe(200);
    expect(exists.body.data).toMatchObject({ operationId: voucher.operationId, exists: true });

    const duplicate = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientToken))
      .send({ loanId, amount: "75", operationId: voucher.operationId, operationDate: "2026-04-06T00:00:00.000Z" });
    expect(duplicate.status).toBe(409);

    const process = await request
      .patch(`/api/v1/payment-vouchers/${voucher.id}/process`)
      .set(authHeader(adminToken))
      .send({ action: "approve" });
    expect(process.status).toBe(200);
    expect(process.body.data.status).toBe("owner_approved");

    const pending = await createVoucher();
    const update = await request
      .patch(`/api/v1/payment-vouchers/${pending.id}`)
      .set(authHeader(clientToken))
      .send({ amount: "80", operationId: uniqueOperationId("EDIT"), observation: "corregido" });
    expect(update.status).toBe(200);
    expect(Number(update.body.data.voucher.amount)).toBe(80);

    const removable = await createVoucher();
    const remove = await request.delete(`/api/v1/payment-vouchers/${removable.id}`).set(authHeader(clientToken));
    expect(remove.status).toBe(200);
    expect(remove.body.data.voucher.status).toBe("deleted");
  });
});

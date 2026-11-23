// Pruebas de integración del envío, duplicidad, aprobación en 2 pasos y rechazo en /payment-vouchers.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml.js";
import {
  authHeader,
  createTestLoan,
  getUserByEmail,
  loginAs,
  request,
  seededEmails,
  uniqueOperationId,
} from "../helpers/integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOUCHER_FIXTURE = path.resolve(__dirname, "../fixtures/voucher-sample.jpg");
const INVALID_FIXTURE = path.resolve(__dirname, "../fixtures/invalid-file.txt");
const OVERSIZED_JPG = path.resolve(__dirname, "../fixtures/oversized-5mb.jpg");

const tracker = new TestCleanupTracker();
let adminToken: string;
let clientToken: string;
let investorToken: string;
let clientId: string;
let investorId: string;
let companyLoanId: string;
let investorLoanId: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
  investorToken = await loginAs(seededEmails.investor);
  clientId = (await getUserByEmail(seededEmails.client)).id;
  investorId = (await getUserByEmail(seededEmails.investor)).id;

  companyLoanId = (await createTestLoan(adminToken, clientId, { name: "Voucher Empresa QA" }, tracker)).id;
  expect((await request.patch(`/api/v1/loans/${companyLoanId}/approve`).set(authHeader(adminToken))).status).toBe(200);

  investorLoanId = (
    await createTestLoan(adminToken, clientId, { investorId, name: "Voucher Inversionista QA" }, tracker)
  ).id;
  expect((await request.patch(`/api/v1/loans/${investorLoanId}/approve`).set(authHeader(investorToken))).status).toBe(
    200,
  );
  expect((await request.patch(`/api/v1/loans/${investorLoanId}/approve`).set(authHeader(adminToken))).status).toBe(200);
});

afterAll(async () => {
  await tracker.cleanup();
});

async function createVoucher(targetLoanId = companyLoanId, amount = "75") {
  const operationId = uniqueOperationId("VOUCHER");
  const response = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({ loanId: targetLoanId, amount, operationId, operationDate: "2026-04-06T00:00:00.000Z" });
  expect(response.status).toBe(201);
  tracker.trackVoucher(response.body.data.id);
  return response.body.data as { id: string; operationId: string; amount: string; status: string };
}

describe("gestión de vouchers", () => {
  // CP-I55
  it("envía un voucher con evidencia y lo lista", async () => {
    const operationId = uniqueOperationId("EVIDENCE");
    const response = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientToken))
      .field("loanId", companyLoanId)
      .field("amount", "150")
      .field("operationId", operationId)
      .field("operationDate", "2026-04-06T00:00:00.000Z")
      .attach("evidence", VOUCHER_FIXTURE);
    expect(response.status).toBe(201);
    expect(response.body.data.operationId).toBe(operationId);
    expect(response.body.data.evidenceUrl).toMatch(/^https?:\/\//);
    tracker.trackVoucher(response.body.data.id);

    const list = await request.get("/api/v1/payment-vouchers").set(authHeader(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((voucher: { operationId: string }) => voucher.operationId === operationId)).toBe(true);
  });

  // CP-I56
  it("verifica duplicados normalizados, procesa, actualiza y elimina vouchers", async () => {
    const voucher = await createVoucher();
    const exists = await request
      .get("/api/v1/payment-vouchers/operation-id/exists")
      .query({ operationId: `  ${voucher.operationId.toLowerCase()}  ` })
      .set(authHeader(clientToken));
    expect(exists.status).toBe(200);
    expect(exists.body.data).toMatchObject({ operationId: voucher.operationId, exists: true });

    const duplicate = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientToken))
      .send({
        loanId: companyLoanId,
        amount: "75",
        operationId: voucher.operationId,
        operationDate: "2026-04-06T00:00:00.000Z",
      });
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

  // CP-I57
  it("flujo completo de voucher con inversionista (inversionista -> admin) genera pago y actualiza deuda (RF-23, RF-24)", async () => {
    const voucher = await createVoucher(investorLoanId, "120");
    expect(voucher.status).toBe("pending_investor_review");

    // Admin no puede saltarse al inversionista activo
    const adminSkip = await request
      .patch(`/api/v1/payment-vouchers/${voucher.id}/process`)
      .set(authHeader(adminToken))
      .send({ action: "approve" });
    expect(adminSkip.status).toBe(400);

    // Inversionista ajeno bloqueado
    const invB = await createTempUser(tracker, { role: "investor", firstName: "Inv", lastName: "B" });
    const invBToken = await loginAs(invB.email, invB.password);
    const wrongInv = await request
      .patch(`/api/v1/payment-vouchers/${voucher.id}/process`)
      .set(authHeader(invBToken))
      .send({ action: "approve" });
    expect(wrongInv.status).toBe(403);

    // Inversionista asignado aprueba
    const invApprove = await request
      .patch(`/api/v1/payment-vouchers/${voucher.id}/process`)
      .set(authHeader(investorToken))
      .send({ action: "approve", observation: "Verificado en cuenta" });
    expect(invApprove.status).toBe(200);
    expect(invApprove.body.data.status).toBe("investor_approved");

    // Admin aprueba finalmente -> genera pago confirmado
    const ownerApprove = await request
      .patch(`/api/v1/payment-vouchers/${voucher.id}/process`)
      .set(authHeader(adminToken))
      .send({ action: "approve" });
    expect(ownerApprove.status).toBe(200);
    expect(ownerApprove.body.data.status).toBe("owner_approved");

    const paymentsRes = await request
      .get(`/api/v1/payments/loan/${investorLoanId}`)
      .set(authHeader(adminToken));
    expect(paymentsRes.status).toBe(200);
    expect(
      paymentsRes.body.data.some(
        (p: { voucherId?: string; amount: string }) => p.voucherId === voucher.id && Number(p.amount) === 120,
      ),
    ).toBe(true);
  });

  // CP-I58
  it("rechaza voucher por inversionista/admin, valida límites de archivo/fecha futura y protege préstamo ajeno", async () => {
    const vInv = await createVoucher(investorLoanId, "50");
    const invReject = await request
      .patch(`/api/v1/payment-vouchers/${vInv.id}/process`)
      .set(authHeader(investorToken))
      .send({ action: "reject", observation: "Ilegible" });
    expect(invReject.status).toBe(200);
    expect(invReject.body.data.status).toBe("investor_rejected");

    const vAdm = await createVoucher(companyLoanId, "50");
    const admReject = await request
      .patch(`/api/v1/payment-vouchers/${vAdm.id}/process`)
      .set(authHeader(adminToken))
      .send({ action: "reject", observation: "Monto incorrecto" });
    expect(admReject.status).toBe(200);
    expect(admReject.body.data.status).toBe("owner_rejected");

    const futureDate = new Date(Date.now() + 7 * 86400_000).toISOString();
    const futureRes = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientToken))
      .send({ loanId: companyLoanId, amount: "20", operationId: uniqueOperationId("FUT"), operationDate: futureDate });
    expect(futureRes.status).toBe(400);

    const badMime = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientToken))
      .field("loanId", companyLoanId)
      .field("amount", "20")
      .field("operationId", uniqueOperationId("MIME"))
      .attach("evidence", INVALID_FIXTURE);
    expect(badMime.status).toBe(400);

    const tooBig = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientToken))
      .field("loanId", companyLoanId)
      .field("amount", "20")
      .field("operationId", uniqueOperationId("BIG"))
      .attach("evidence", OVERSIZED_JPG);
    expect(tooBig.status).toBe(413);

    const clientB = await createTempUser(tracker, { role: "client", firstName: "Cli", lastName: "B" });
    const clientBToken = await loginAs(clientB.email, clientB.password);
    const otherLoanRes = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(clientBToken))
      .send({ loanId: companyLoanId, amount: "20", operationId: uniqueOperationId("OWN") });
    expect(otherLoanRes.status).toBe(403);
  });
});

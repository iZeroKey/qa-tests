// Pruebas de integración de pagos manuales, recálculo financiero, multipart y permisos en /payments.
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
} from "../helpers/integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_PNG = path.resolve(__dirname, "../fixtures/avatar-sample.png");
const INVALID_FILE = path.resolve(__dirname, "../fixtures/invalid-file.txt");
const OVERSIZED_JPG = path.resolve(__dirname, "../fixtures/oversized-5mb.jpg");

const tracker = new TestCleanupTracker();
let adminToken: string;
let clientToken: string;
let clientId: string;
let loanId: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
  clientId = (await getUserByEmail(seededEmails.client)).id;
  loanId = (await createTestLoan(adminToken, clientId, { name: "Préstamo Pagos QA" }, tracker)).id;
  const approve = await request.patch(`/api/v1/loans/${loanId}/approve`).set(authHeader(adminToken));
  expect(approve.status).toBe(200);
});

afterAll(async () => {
  await tracker.cleanup();
});

async function createPayment(targetLoanId = loanId, amount = "250") {
  const response = await request
    .post("/api/v1/payments")
    .set(authHeader(adminToken))
    .send({ loanId: targetLoanId, amount, method: "cash", paymentDate: "2026-02-01T00:00:00.000Z" });
  expect(response.status).toBe(201);
  tracker.trackPayment(response.body.data.id);
  return response.body.data as { id: string; loanId: string; amount: string };
}

describe("gestión de pagos", () => {
  // CP-I32
  it("registra y lista pagos del préstamo", async () => {
    const payment = await createPayment();
    expect(payment).toMatchObject({ loanId, amount: "250.00" });

    const history = await request.get(`/api/v1/payments/loan/${loanId}`).set(authHeader(clientToken));
    expect(history.status).toBe(200);
    expect(history.body.data.some((item: { id: string }) => item.id === payment.id)).toBe(true);
  });

  // CP-I33
  it("actualiza y elimina un pago recalculando cuotas y estado", async () => {
    const payment = await createPayment(loanId, "50");
    const update = await request
      .patch(`/api/v1/payments/${payment.id}`)
      .set(authHeader(adminToken))
      .send({ amount: "60", reference: "UPDATED-ROUTE" });
    expect(update.status).toBe(200);
    expect(Number(update.body.data.payment.amount)).toBe(60);

    const remove = await request.delete(`/api/v1/payments/${payment.id}`).set(authHeader(adminToken));
    expect(remove.status).toBe(200);
    expect(remove.body.data.payment.status).toBe("reversed");
  });

  // CP-I34
  it("rechaza pago incompleto con 400 exacto y rechaza sobrepago excesivo", async () => {
    const response = await request.post("/api/v1/payments").set(authHeader(adminToken)).send({ loanId });
    expect(response.status).toBe(400);

    const overpay = await request
      .post("/api/v1/payments")
      .set(authHeader(adminToken))
      .send({ loanId, amount: "999999", method: "cash" });
    expect(overpay.status).toBe(400);
  });

  // CP-I35
  it("completa el pago total hasta estado paid y revierte a active al editar/eliminar (RF-16, RF-18)", async () => {
    const payoffLoan = await createTestLoan(adminToken, clientId, { principal: "500", interestRate: "5", installmentsCount: 2 }, tracker);
    await request.patch(`/api/v1/loans/${payoffLoan.id}/approve`).set(authHeader(adminToken));

    const detailBefore = await request.get(`/api/v1/loans/${payoffLoan.id}`).set(authHeader(adminToken));
    const totalDebt = detailBefore.body.data.totalDebt as string;

    const fullPay = await createPayment(payoffLoan.id, totalDebt);
    expect(fullPay.loanId).toBe(payoffLoan.id);

    const detailPaid = await request.get(`/api/v1/loans/${payoffLoan.id}`).set(authHeader(adminToken));
    expect(detailPaid.body.data.status).toBe("paid");

    const insts = await request.get(`/api/v1/loans/${payoffLoan.id}/installments`).set(authHeader(adminToken));
    expect(insts.body.data.every((i: { status: string }) => i.status === "paid")).toBe(true);

    const lowered = await request
      .patch(`/api/v1/payments/${fullPay.id}`)
      .set(authHeader(adminToken))
      .send({ amount: "100" });
    expect(lowered.status).toBe(200);
    expect(lowered.body.data.loan.status).toBe("active");
  });

  // CP-I36
  it("acepta evidencia multipart válida y rechaza MIME inválido (400) y >5MB (413)", async () => {
    const withEvidence = await request
      .post("/api/v1/payments")
      .set(authHeader(adminToken))
      .field("loanId", loanId)
      .field("amount", "20")
      .field("method", "transfer")
      .attach("evidence", EVIDENCE_PNG);
    expect(withEvidence.status).toBe(201);
    expect(withEvidence.body.data.evidenceUrl).toMatch(/^https?:\/\//);
    tracker.trackPayment(withEvidence.body.data.id);

    const badMime = await request
      .post("/api/v1/payments")
      .set(authHeader(adminToken))
      .field("loanId", loanId)
      .field("amount", "20")
      .attach("evidence", INVALID_FILE);
    expect(badMime.status).toBe(400);

    const tooBig = await request
      .post("/api/v1/payments")
      .set(authHeader(adminToken))
      .field("loanId", loanId)
      .field("amount", "20")
      .attach("evidence", OVERSIZED_JPG);
    expect(tooBig.status).toBe(413);
  });

  // CP-I37
  it("restringe registro, edición y eliminación de pagos al admin y aísla consulta ajena", async () => {
    const clientB = await createTempUser(tracker, { role: "client", firstName: "Pay", lastName: "B" });
    const clientBToken = await loginAs(clientB.email, clientB.password);

    const forbiddenPost = await request
      .post("/api/v1/payments")
      .set(authHeader(clientToken))
      .send({ loanId, amount: "10", method: "cash" });
    expect(forbiddenPost.status).toBe(403);

    const forbiddenHistory = await request
      .get(`/api/v1/payments/loan/${loanId}`)
      .set(authHeader(clientBToken));
    expect(forbiddenHistory.status).toBe(403);
  });
});

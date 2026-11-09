import { beforeAll, describe, expect, it } from "vitest";
import {
  authHeader,
  createTestLoan,
  getUserByEmail,
  loginAs,
  request,
  seededEmails,
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

async function createPayment(amount = "250") {
  const response = await request
    .post("/api/v1/payments")
    .set(authHeader(adminToken))
    .send({ loanId, amount, method: "cash", paymentDate: "2026-02-01T00:00:00.000Z" });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; loanId: string; amount: string };
}

describe("gestión de pagos", () => {
  // CP-I15
  it("registra y lista pagos del préstamo", async () => {
    const payment = await createPayment();
    expect(payment).toMatchObject({ loanId, amount: "250.00" });

    const history = await request.get(`/api/v1/payments/loan/${loanId}`).set(authHeader(clientToken));
    expect(history.status).toBe(200);
    expect(history.body.data.some((item: { id: string }) => item.id === payment.id)).toBe(true);
  });

  // CP-I16
  it("actualiza y elimina un pago", async () => {
    const payment = await createPayment("50");
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

  // CP-I17
  it("rechaza un pago incompleto", async () => {
    const response = await request.post("/api/v1/payments").set(authHeader(adminToken)).send({ loanId });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

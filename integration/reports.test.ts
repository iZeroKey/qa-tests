import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, createTestLoan, getUserByEmail, loginAs, request, seededEmails } from "../helpers/integration.js";

let adminToken: string;
let clientToken: string;
let investorToken: string;
let clientId: string;
let investorId: string;
let loanId: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
  investorToken = await loginAs(seededEmails.investor);
  clientId = (await getUserByEmail(seededEmails.client)).id;
  investorId = (await getUserByEmail(seededEmails.investor)).id;
  const loan = await createTestLoan(adminToken, clientId);
  loanId = loan.id;
  const approve = await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));
  expect([200, 201]).toContain(approve.status);
});

describe("reportes", () => {
  it("actualiza el estado de cuenta después de registrar un pago", async () => {
    const before = await request.get("/api/v1/reports/statement").set(authHeader(clientToken));
    expect(before.status).toBe(200);

    const payment = await request
      .post("/api/v1/payments")
      .set(authHeader(adminToken))
      .send({ loanId, amount: "137.50", method: "cash", paymentDate: "2026-02-01T00:00:00.000Z" });
    expect(payment.status).toBe(201);

    const after = await request.get("/api/v1/reports/statement").set(authHeader(clientToken));
    expect(after.status).toBe(200);
    expect(Number(after.body.data.summary.totalPaid)).toBeGreaterThan(
      Number(before.body.data.summary.totalPaid),
    );
    expect(after.body.data.summary.paymentCount).toBe(before.body.data.summary.paymentCount + 1);
  });

  it("consulta estado de cuenta, portafolio y dashboard", async () => {
    const statement = await request.get("/api/v1/reports/statement").set(authHeader(clientToken));
    expect(statement.status).toBe(200);
    expect(statement.body.data).toBeTruthy();

    const statementByClient = await request.get(`/api/v1/reports/statement/${clientId}`).set(authHeader(adminToken));
    expect(statementByClient.status).toBe(200);

    const portfolio = await request.get("/api/v1/reports/portfolio").set(authHeader(investorToken));
    expect(portfolio.status).toBe(200);

    const portfolioByInvestor = await request.get(`/api/v1/reports/portfolio/${investorId}`).set(authHeader(adminToken));
    expect(portfolioByInvestor.status).toBe(200);

    const dashboard = await request.get("/api/v1/reports/dashboard").set(authHeader(adminToken));
    expect(dashboard.status).toBe(200);
  });
});

// Pruebas de integración de estado de cuenta, portafolio y dashboard administrativo.
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

const tracker = new TestCleanupTracker();
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

  const loan = await createTestLoan(adminToken, clientId, { investorId, name: "Report Loan QA" }, tracker);
  loanId = loan.id;
  expect((await request.patch(`/api/v1/loans/${loanId}/approve`).set(authHeader(investorToken))).status).toBe(200);
  expect((await request.patch(`/api/v1/loans/${loanId}/approve`).set(authHeader(adminToken))).status).toBe(200);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("reportes", () => {
  // CP-I45
  it("actualiza el estado de cuenta después de registrar un pago", async () => {
    const before = await request.get("/api/v1/reports/statement").set(authHeader(clientToken));
    expect(before.status).toBe(200);

    const payment = await request
      .post("/api/v1/payments")
      .set(authHeader(adminToken))
      .send({ loanId, amount: "137.50", method: "cash", paymentDate: "2026-02-01T00:00:00.000Z" });
    expect(payment.status).toBe(201);
    tracker.trackPayment(payment.body.data.id);

    const after = await request.get("/api/v1/reports/statement").set(authHeader(clientToken));
    expect(after.status).toBe(200);
    expect(Number(after.body.data.summary.totalPaid)).toBeCloseTo(
      Number(before.body.data.summary.totalPaid) + 137.5,
      2,
    );
    expect(after.body.data.summary.paymentCount).toBe(before.body.data.summary.paymentCount + 1);
  });

  // CP-I46
  it("consulta estado de cuenta, portafolio y dashboard con estructura y métricas consistentes", async () => {
    const statement = await request.get("/api/v1/reports/statement").set(authHeader(clientToken));
    expect(statement.status).toBe(200);
    expect(statement.body.data.client.id).toBe(clientId);
    expect(Array.isArray(statement.body.data.loans)).toBe(true);

    const statementByClient = await request.get(`/api/v1/reports/statement/${clientId}`).set(authHeader(adminToken));
    expect(statementByClient.status).toBe(200);
    expect(statementByClient.body.data.summary.totalPaid).toBe(statement.body.data.summary.totalPaid);

    const portfolio = await request.get("/api/v1/reports/portfolio").set(authHeader(investorToken));
    expect(portfolio.status).toBe(200);
    expect(Number(portfolio.body.data.summary.totalInvested)).toBeGreaterThan(0);
    expect(Array.isArray(portfolio.body.data.loans)).toBe(true);

    const portfolioByInvestor = await request
      .get(`/api/v1/reports/portfolio/${investorId}`)
      .set(authHeader(adminToken));
    expect(portfolioByInvestor.status).toBe(200);
    expect(portfolioByInvestor.body.data.summary.totalInvested).toBe(portfolio.body.data.summary.totalInvested);

    const dashboard = await request.get("/api/v1/reports/dashboard").set(authHeader(adminToken));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data).toHaveProperty("loans");
    expect(dashboard.body.data).toHaveProperty("overdue");
    expect(dashboard.body.data).toHaveProperty("vouchers");
    expect(dashboard.body.data).toHaveProperty("users");
  });

  // CP-I47
  it("protege reportes entre roles y usuarios distintos (RNF-02, RNF-14)", async () => {
    const clientB = await createTempUser(tracker, { role: "client", firstName: "Rep", lastName: "CliB" });
    const invB = await createTempUser(tracker, { role: "investor", firstName: "Rep", lastName: "InvB" });
    const clientBToken = await loginAs(clientB.email, clientB.password);
    const invBToken = await loginAs(invB.email, invB.password);

    expect((await request.get(`/api/v1/reports/statement/${clientId}`).set(authHeader(clientBToken))).status).toBe(403);
    expect((await request.get(`/api/v1/reports/portfolio/${investorId}`).set(authHeader(invBToken))).status).toBe(403);
    expect((await request.get("/api/v1/reports/dashboard").set(authHeader(clientToken))).status).toBe(403);
    expect((await request.get("/api/v1/reports/dashboard").set(authHeader(investorToken))).status).toBe(403);
    expect((await request.get("/api/v1/reports/portfolio").set(authHeader(clientToken))).status).toBe(403);
    expect((await request.get("/api/v1/reports/statement").set(authHeader(investorToken))).status).toBe(403);

    const missingClient = await request
      .get("/api/v1/reports/statement/123e4567-e89b-12d3-a456-426614174999")
      .set(authHeader(adminToken));
    expect(missingClient.status).toBe(404);
  });
});

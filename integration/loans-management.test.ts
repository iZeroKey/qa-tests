// Pruebas de integración CRUD, flujos de aprobación, resúmenes y aislamiento en /loans.
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
  loanId = (await createTestLoan(adminToken, clientId, { name: "Préstamo Base Integración" }, tracker)).id;
  const approve = await request.patch(`/api/v1/loans/${loanId}/approve`).set(authHeader(adminToken));
  expect(approve.status).toBe(200);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("gestión de préstamos", () => {
  // CP-I18
  it("admin consulta el préstamo creado y aprobado", async () => {
    const response = await request.get(`/api/v1/loans/${loanId}`).set(authHeader(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: loanId, status: "active" });
  });

  // CP-I19
  it("lista préstamos, resumen, cuotas, bundle y transacciones", async () => {
    const list = await request.get("/api/v1/loans").set(authHeader(clientToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((loan: { id: string }) => loan.id === loanId)).toBe(true);

    const summary = await request.get("/api/v1/loans/summary").set(authHeader(clientToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data).toBeTruthy();

    const installments = await request.get(`/api/v1/loans/${loanId}/installments`).set(authHeader(adminToken));
    expect(installments.status).toBe(200);
    expect(installments.body.data).toHaveLength(4);

    const bundle = await request.get(`/api/v1/loans/${loanId}/bundle`).set(authHeader(adminToken));
    expect(bundle.status).toBe(200);
    expect(bundle.body.data.loan.id).toBe(loanId);

    const transactions = await request.get(`/api/v1/loans/${loanId}/transactions`).set(authHeader(adminToken));
    expect(transactions.status).toBe(200);
    expect(Array.isArray(transactions.body.data)).toBe(true);
  });

  // CP-I20
  it("actualiza un préstamo y consulta el resumen administrativo", async () => {
    const update = await request
      .patch(`/api/v1/loans/${loanId}`)
      .set(authHeader(adminToken))
      .send({ name: "Préstamo actualizado", observation: "editado" });
    expect(update.status).toBe(200);
    expect(update.body.data.loan).toMatchObject({ id: loanId, name: "Préstamo actualizado" });

    const summary = await request.get("/api/v1/loans/admin-summary").set(authHeader(adminToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data.some((loan: { id: string }) => loan.id === loanId)).toBe(true);
  });

  // CP-I21
  it("rechaza y elimina préstamos independientes", async () => {
    const rejected = await createTestLoan(adminToken, clientId, {}, tracker);
    const reject = await request
      .patch(`/api/v1/loans/${rejected.id}/reject`)
      .set(authHeader(adminToken))
      .send({ observation: "No cumple condiciones" });
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe("rejected");

    const deleted = await createTestLoan(adminToken, clientId, {}, tracker);
    const remove = await request.delete(`/api/v1/loans/${deleted.id}`).set(authHeader(adminToken));
    expect(remove.status).toBe(200);
    expect(remove.body.data.status).toBe("deleted");
  });

  // CP-I22
  it("ejecuta flujo de aprobación en 2 pasos (inversionista -> admin) y bloquea terceros (RF-13)", async () => {
    const invLoan = await createTestLoan(
      adminToken,
      clientId,
      { investorId, name: "Préstamo 2 Pasos" },
      tracker,
    );
    expect(invLoan.status).toBe("pending_investor_review");

    const otherInvestor = await createTempUser(tracker, {
      role: "investor",
      firstName: "Inversor",
      lastName: "Ajeno",
    });
    const otherInvToken = await loginAs(otherInvestor.email, otherInvestor.password);

    const wrongInvestorApprove = await request
      .patch(`/api/v1/loans/${invLoan.id}/approve`)
      .set(authHeader(otherInvToken));
    expect(wrongInvestorApprove.status).toBe(403);

    const invApprove = await request
      .patch(`/api/v1/loans/${invLoan.id}/approve`)
      .set(authHeader(investorToken));
    expect(invApprove.status).toBe(200);
    expect(invApprove.body.data.status).toBe("pending_admin_review");

    const adminApprove = await request
      .patch(`/api/v1/loans/${invLoan.id}/approve`)
      .set(authHeader(adminToken));
    expect(adminApprove.status).toBe(200);
    expect(adminApprove.body.data.loan.status).toBe("active");
    expect(adminApprove.body.data.installments).toHaveLength(4);
  });

  // CP-I23
  it("rechaza con 403 si un cliente intenta aprobar un préstamo", async () => {
    const invLoan = await createTestLoan(
      adminToken,
      clientId,
      { investorId, name: "Préstamo Cliente No Aprueba" },
      tracker,
    );
    // Defecto conocido: cliente recibe 400 en vez de 403 al intentar aprobar.
    const clientApprove = await request
      .patch(`/api/v1/loans/${invLoan.id}/approve`)
      .set(authHeader(clientToken));
    expect(clientApprove.status).toBe(403);
  });

  // CP-I24
  it("aísla préstamos entre clientes e inversionistas distintos (RNF-14)", async () => {
    const clientB = await createTempUser(tracker, { role: "client", firstName: "Cliente", lastName: "B" });
    const investorB = await createTempUser(tracker, { role: "investor", firstName: "Inversor", lastName: "B" });
    const clientBToken = await loginAs(clientB.email, clientB.password);
    const investorBToken = await loginAs(investorB.email, investorB.password);

    const privateLoan = await createTestLoan(adminToken, clientId, { investorId }, tracker);

    const getByClientB = await request.get(`/api/v1/loans/${privateLoan.id}`).set(authHeader(clientBToken));
    expect(getByClientB.status).toBe(403);

    const getByInvB = await request.get(`/api/v1/loans/${privateLoan.id}`).set(authHeader(investorBToken));
    expect(getByInvB.status).toBe(403);

    const listClientB = await request.get("/api/v1/loans").set(authHeader(clientBToken));
    expect(listClientB.status).toBe(200);
    expect(listClientB.body.data).toHaveLength(0);

    const createByClient = await request
      .post("/api/v1/loans")
      .set(authHeader(clientToken))
      .send({ clientId, principal: "500", interestRate: "5", installmentsCount: 2, startDate: "2026-01-01T00:00:00.000Z" });
    expect(createByClient.status).toBe(403);
  });

  // CP-I25
  it("impide rechazar un préstamo ya activo", async () => {
    const activeLoan = await createTestLoan(adminToken, clientId, {}, tracker);
    await request.patch(`/api/v1/loans/${activeLoan.id}/approve`).set(authHeader(adminToken));

    // Defecto conocido: backend permite rechazar un préstamo ya activo sin revertir cuotas.
    const rejectActive = await request
      .patch(`/api/v1/loans/${activeLoan.id}/reject`)
      .set(authHeader(adminToken))
      .send({ observation: "Intento inválido" });
    expect(rejectActive.status).toBe(400);
  });

  // CP-I26
  it("oculta préstamos eliminados en GET /loans/:id/transactions", async () => {
    const toDelete = await createTestLoan(adminToken, clientId, {}, tracker);
    await request.delete(`/api/v1/loans/${toDelete.id}`).set(authHeader(adminToken));

    // Defecto conocido: /transactions responde 200 en lugar de 404 para préstamo eliminado.
    const txDeleted = await request
      .get(`/api/v1/loans/${toDelete.id}/transactions`)
      .set(authHeader(adminToken));
    expect(txDeleted.status).toBe(404);
  });

  // CP-I27
  it("GET /loans/summary para cliente excluye préstamos rechazados", async () => {
    const tempClient = await createTempUser(tracker, { role: "client", firstName: "Sum", lastName: "Cliente" });
    const tClientToken = await loginAs(tempClient.email, tempClient.password);

    const activeLoan = await createTestLoan(
      adminToken,
      tempClient.id,
      { principal: "1000", interestRate: "5", installmentsCount: 4 },
      tracker,
    );
    await request.patch(`/api/v1/loans/${activeLoan.id}/approve`).set(authHeader(adminToken));

    const rejectedLoan = await createTestLoan(
      adminToken,
      tempClient.id,
      { principal: "5000", interestRate: "5", installmentsCount: 4 },
      tracker,
    );
    await request.patch(`/api/v1/loans/${rejectedLoan.id}/reject`).set(authHeader(adminToken)).send({});

    // Defecto conocido: GET /loans/summary cliente suma el préstamo rechazado de 5000.
    const clientSummary = await request.get("/api/v1/loans/summary").set(authHeader(tClientToken));
    expect(clientSummary.status).toBe(200);
    expect(Number(clientSummary.body.data.stats.totalPrincipal)).toBe(1000);
  });

  // CP-I28
  it("GET /loans/summary para inversionista incluye cobros registrados en préstamos activos", async () => {
    const tempClient = await createTempUser(tracker, { role: "client", firstName: "SumInv", lastName: "Cliente" });
    const tempInv = await createTempUser(tracker, { role: "investor", firstName: "SumInv", lastName: "Inversor" });
    const tInvToken = await loginAs(tempInv.email, tempInv.password);

    const activeLoan = await createTestLoan(
      adminToken,
      tempClient.id,
      { investorId: tempInv.id, principal: "1000", interestRate: "5", installmentsCount: 4 },
      tracker,
    );
    await request.patch(`/api/v1/loans/${activeLoan.id}/approve`).set(authHeader(tInvToken));
    await request.patch(`/api/v1/loans/${activeLoan.id}/approve`).set(authHeader(adminToken));

    await request
      .post("/api/v1/payments")
      .set(authHeader(adminToken))
      .send({ loanId: activeLoan.id, amount: "200", method: "cash", paymentDate: "2026-02-01T00:00:00.000Z" });

    // Defecto conocido: GET /loans/summary inversionista filtra totalPaid por loans.status='paid' y reporta 0.
    const invSummary = await request.get("/api/v1/loans/summary").set(authHeader(tInvToken));
    expect(invSummary.status).toBe(200);
    expect(Number(invSummary.body.data.totalPaid)).toBe(200);
  });
});

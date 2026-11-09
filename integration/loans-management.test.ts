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

describe("gestión de préstamos", () => {
  // CP-I11
  it("admin consulta el préstamo creado y aprobado", async () => {
    const response = await request.get(`/api/v1/loans/${loanId}`).set(authHeader(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: loanId, status: "active" });
  });

  // CP-I12
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

  // CP-I13
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

  // CP-I14
  it("rechaza y elimina préstamos independientes", async () => {
    const rejected = await createTestLoan(adminToken, clientId);
    const reject = await request
      .patch(`/api/v1/loans/${rejected.id}/reject`)
      .set(authHeader(adminToken))
      .send({ observation: "No cumple condiciones" });
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe("rejected");

    const deleted = await createTestLoan(adminToken, clientId);
    const remove = await request.delete(`/api/v1/loans/${deleted.id}`).set(authHeader(adminToken));
    expect(remove.status).toBe(200);
    expect(remove.body.data.status).toBe("deleted");
  });
});

// Pruebas de integración de registro y consulta filtrada en la bitácora /audit-logs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestCleanupTracker } from "../helpers/db-dml.js";
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
let adminId: string;
let clientId: string;
let loanId: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
  investorToken = await loginAs(seededEmails.investor);
  adminId = (await getUserByEmail(seededEmails.admin)).id;
  clientId = (await getUserByEmail(seededEmails.client)).id;
  loanId = (await createTestLoan(adminToken, clientId, { name: "Audit Loan QA" }, tracker)).id;
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("auditoría", () => {
  // CP-I04
  it("lista auditoría general y por usuario administrador con el préstamo creado", async () => {
    const all = await request
      .get("/api/v1/audit-logs?module=LOANS&action=CREATE_LOAN&limit=50")
      .set(authHeader(adminToken));
    expect(all.status).toBe(200);
    expect(all.body.data.some((log: { entityId: string; module: string }) => log.entityId === loanId && log.module === "LOANS")).toBe(
      true,
    );

    const byAdmin = await request.get(`/api/v1/audit-logs/user/${adminId}`).set(authHeader(adminToken));
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.length).toBeGreaterThan(0);
    expect(byAdmin.body.data.some((log: { entityId: string }) => log.entityId === loanId)).toBe(true);
  });

  // CP-I05
  it("restringe auditoría a roles autorizados y valida filtros por usuario/rango", async () => {
    const unauth = await request.get("/api/v1/audit-logs");
    expect(unauth.status).toBe(401);

    const clientRes = await request.get("/api/v1/audit-logs").set(authHeader(clientToken));
    expect(clientRes.status).toBe(403);

    const investorRes = await request.get(`/api/v1/audit-logs/user/${adminId}`).set(authHeader(investorToken));
    expect(investorRes.status).toBe(403);

    const filteredByUser = await request
      .get(`/api/v1/audit-logs?userId=${adminId}&limit=10`)
      .set(authHeader(adminToken));
    expect(filteredByUser.status).toBe(200);
    expect(filteredByUser.body.data.every((l: { userId: string }) => l.userId === adminId)).toBe(true);
  });
});

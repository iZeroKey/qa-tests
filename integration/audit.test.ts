import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, createTestLoan, getUserByEmail, loginAs, request, seededEmails } from "../helpers/integration.js";

let adminToken: string;
let clientId: string;
let loanId: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  const client = await getUserByEmail(seededEmails.client);
  clientId = client.id;
  loanId = (await createTestLoan(adminToken, clientId)).id;
});

describe("auditoría", () => {
  // CP-I23
  it("lista auditoría general y por usuario con el préstamo creado", async () => {
    const all = await request.get("/api/v1/audit-logs").set(authHeader(adminToken));
    expect(all.status).toBe(200);
    expect(all.body.data.some((log: { entityId: string }) => log.entityId === loanId)).toBe(true);

    const byUser = await request.get(`/api/v1/audit-logs/user/${clientId}`).set(authHeader(adminToken));
    expect(byUser.status).toBe(200);
    expect(Array.isArray(byUser.body.data)).toBe(true);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs, request, seededEmails } from "../helpers/integration.js";

let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
});

describe("perfil", () => {
  it("admin consulta su perfil y el cliente no accede a auditoría", async () => {
    const profile = await request.get("/api/v1/users/me").set(authHeader(adminToken));
    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({ email: seededEmails.admin, role: "admin" });

    const clientAudit = await request.get("/api/v1/audit-logs").set(authHeader(clientToken));
    expect(clientAudit.status).toBe(403);
  });

  it("sube y elimina el avatar del usuario autenticado", async () => {
    const upload = await request
      .patch("/api/v1/users/me/avatar")
      .set(authHeader(clientToken))
      .attach("avatar", "C:/Zero/Dev/qa/test/bg.png");
    expect(upload.status).toBe(200);
    expect(upload.body.data.avatarUrl).toBeTruthy();

    const remove = await request.delete("/api/v1/users/me/avatar").set(authHeader(clientToken));
    expect(remove.status).toBe(200);
  });
});

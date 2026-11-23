// Pruebas de integración de consulta, edición de perfil y carga de avatar en /users/me.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml.js";
import { authHeader, loginAs, request, seededEmails } from "../helpers/integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_FIXTURE = path.resolve(__dirname, "../fixtures/avatar-sample.png");
const INVALID_FIXTURE = path.resolve(__dirname, "../fixtures/invalid-file.txt");
const OVERSIZED_AVATAR = path.resolve(__dirname, "../fixtures/oversized-2mb.png");

const tracker = new TestCleanupTracker();
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("perfil", () => {
  // CP-I41
  it("admin consulta su perfil y el cliente no accede a auditoría", async () => {
    const profile = await request.get("/api/v1/users/me").set(authHeader(adminToken));
    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({ email: seededEmails.admin, role: "admin" });

    const clientAudit = await request.get("/api/v1/audit-logs").set(authHeader(clientToken));
    expect(clientAudit.status).toBe(403);
  });

  // CP-I42
  it("sube y elimina el avatar del usuario autenticado", async () => {
    const upload = await request
      .patch("/api/v1/users/me/avatar")
      .set(authHeader(clientToken))
      .attach("avatar", AVATAR_FIXTURE);
    expect(upload.status).toBe(200);
    expect(upload.body.data.avatarUrl).toMatch(/^https?:\/\//);

    const remove = await request.delete("/api/v1/users/me/avatar").set(authHeader(clientToken));
    expect(remove.status).toBe(200);
    expect(remove.body.data.avatarUrl).toBeNull();
  });

  // CP-I43
  it("valida archivo, MIME y límite de 2 MB al subir avatar", async () => {
    const missing = await request.patch("/api/v1/users/me/avatar").set(authHeader(clientToken));
    expect(missing.status).toBe(400);

    const badMime = await request
      .patch("/api/v1/users/me/avatar")
      .set(authHeader(clientToken))
      .attach("avatar", INVALID_FIXTURE);
    expect(badMime.status).toBe(400);

    const tooBig = await request
      .patch("/api/v1/users/me/avatar")
      .set(authHeader(clientToken))
      .attach("avatar", OVERSIZED_AVATAR);
    expect(tooBig.status).toBe(413);
  });

  // CP-I44
  it("usuario actualiza sus propios datos permitidos (RF-29) y es rechazado si intenta cambiar rol/active", async () => {
    const temp = await createTempUser(tracker, {
      role: "client",
      firstName: "Perfil",
      lastName: "Inicial",
    });
    const token = await loginAs(temp.email, temp.password);

    const update = await request
      .patch(`/api/v1/users/${temp.id}`)
      .set(authHeader(token))
      .send({
        firstName: "Perfil Actualizado",
        address: "Av. Larco 450",
        bank: "Interbank",
        bankAccounts: ["200-300400500"],
        maritalStatus: "married",
      });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({
      firstName: "Perfil Actualizado",
      address: "Av. Larco 450",
      bank: "Interbank",
      maritalStatus: "married",
    });

    const forbiddenField = await request
      .patch(`/api/v1/users/${temp.id}`)
      .set(authHeader(token))
      .send({ active: false });
    expect(forbiddenField.status).toBe(400);

    const forbiddenRole = await request
      .patch(`/api/v1/users/${temp.id}`)
      .set(authHeader(token))
      .send({ role: "admin" });
    expect(forbiddenRole.status).toBe(400);

    const me = await request.get("/api/v1/users/me").set(authHeader(token));
    expect(me.status).toBe(200);
    expect(me.body.data.firstName).toBe("Perfil Actualizado");
  });
});

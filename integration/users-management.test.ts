import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs, request, seededEmails } from "../helpers/integration.js";

let adminToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
});

describe("gestión de usuarios", () => {
  it("lista usuarios paginados", async () => {
    const response = await request.get("/api/v1/users?page=1&limit=5").set(authHeader(adminToken));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toHaveProperty("pagination");
  });

  it("crea, consulta, actualiza y elimina un usuario", async () => {
    const create = await request
      .post("/api/v1/users")
      .set(authHeader(adminToken))
      .send({ firstName: "Usuario", lastName: "Integración", role: "client", active: true });
    expect(create.status).toBe(201);
    const userId = create.body.data.id;

    const detail = await request.get(`/api/v1/users/${userId}`).set(authHeader(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(userId);

    const update = await request
      .patch(`/api/v1/users/${userId}`)
      .set(authHeader(adminToken))
      .send({ firstName: "Usuario Editado", active: false });
    expect(update.status).toBe(200);
    expect(update.body.data.firstName).toBe("Usuario Editado");

    const remove = await request.delete(`/api/v1/users/${userId}`).set(authHeader(adminToken));
    expect(remove.status).toBe(200);
  });
});

// Pruebas de integración de administración de usuarios, vinculación Auth y jerarquía de roles.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, getUserRowByEmail, TestCleanupTracker } from "../helpers/db-dml.js";
import { authHeader, loginAs, request, seededEmails, TEST_PASSWORD, uniqueEmail } from "../helpers/integration.js";

const tracker = new TestCleanupTracker();
let ownerToken: string;
let clientToken: string;

beforeAll(async () => {
  ownerToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("gestión de usuarios", () => {
  // CP-I48
  it("lista usuarios paginados con filtros por rol, estado y búsqueda", async () => {
    const response = await request
      .get("/api/v1/users?page=1&limit=5&role=client&active=true")
      .set(authHeader(ownerToken));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toHaveProperty("pagination");
    expect(response.body.data.every((u: { role: string; active: boolean }) => u.role === "client" && u.active)).toBe(
      true,
    );

    const badPagination = await request.get("/api/v1/users?page=0").set(authHeader(ownerToken));
    expect(badPagination.status).toBe(400);

    const forbidden = await request.get("/api/v1/users").set(authHeader(clientToken));
    expect(forbidden.status).toBe(403);
  });

  // CP-I49
  it("crea sin acceso Auth, consulta, actualiza y elimina un usuario temporal", async () => {
    const create = await request
      .post("/api/v1/users")
      .set(authHeader(ownerToken))
      .send({
        firstName: "Usuario",
        lastName: "Operativo",
        role: "client",
        dni: "87654321",
        bank: "BCP",
        bankAccounts: ["191-00011122-0-01"],
        maritalStatus: "single",
        active: true,
      });
    expect(create.status).toBe(201);
    const userId = create.body.data.id as string;
    tracker.trackUser(userId, null);

    const detail = await request.get(`/api/v1/users/${userId}`).set(authHeader(ownerToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id: userId, dni: "87654321", bank: "BCP" });

    const update = await request
      .patch(`/api/v1/users/${userId}`)
      .set(authHeader(ownerToken))
      .send({ firstName: "Usuario Editado", active: false });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({ firstName: "Usuario Editado", active: false });

    const remove = await request.delete(`/api/v1/users/${userId}`).set(authHeader(ownerToken));
    expect(remove.status).toBe(200);
    expect(remove.body.data.active).toBe(false);
    expect(remove.body.data.deletedAt).toBeTruthy();
  });

  // CP-I50
  it("crea usuario con Auth, valida publicCode y vincula Auth a usuario existente (RF-08)", async () => {
    const invalidCode = await request
      .post("/api/v1/users")
      .set(authHeader(ownerToken))
      .send({ firstName: "Malo", lastName: "Codigo", role: "client", publicCode: "PR-00001" });
    expect(invalidCode.status).toBe(400);

    const emailAuth = uniqueEmail("user-with-auth");
    const createdWithAuth = await request
      .post("/api/v1/users")
      .set(authHeader(ownerToken))
      .send({
        firstName: "Con",
        lastName: "Acceso",
        role: "investor",
        email: emailAuth,
        password: TEST_PASSWORD,
        createAuthAccount: true,
      });
    expect(createdWithAuth.status).toBe(201);
    tracker.trackUser(createdWithAuth.body.data.id, createdWithAuth.body.data.authUserId, emailAuth);

    const loginCreated = await request
      .post("/api/v1/auth/login")
      .send({ email: emailAuth, password: TEST_PASSWORD });
    expect(loginCreated.status).toBe(200);

    const unlinked = await request
      .post("/api/v1/users")
      .set(authHeader(ownerToken))
      .send({ firstName: "Sin", lastName: "Auth", role: "client" });
    expect(unlinked.status).toBe(201);
    tracker.trackUser(unlinked.body.data.id, null);

    const linkedEmail = uniqueEmail("linked-auth");
    const linkRes = await request
      .post(`/api/v1/users/${unlinked.body.data.id}/auth-account`)
      .set(authHeader(ownerToken))
      .send({ email: linkedEmail, password: TEST_PASSWORD });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.data.authUserId).toBeTruthy();
    tracker.trackUser(unlinked.body.data.id, linkRes.body.data.authUserId, linkedEmail);

    const duplicateLink = await request
      .post(`/api/v1/users/${unlinked.body.data.id}/auth-account`)
      .set(authHeader(ownerToken))
      .send({ email: uniqueEmail("second-link"), password: TEST_PASSWORD });
    expect(duplicateLink.status).toBe(400);

    const linkedLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: linkedEmail, password: TEST_PASSWORD });
    expect(linkedLogin.status).toBe(200);
  });

  // CP-I51
  it("aplica restricciones owner vs admin no-propietario y devuelve 404 para usuario inexistente", async () => {
    const ownerRow = await getUserRowByEmail(seededEmails.admin);
    const nonOwnerAdmin = await createTempUser(tracker, {
      role: "admin",
      isOwner: false,
      firstName: "Admin",
      lastName: "Limitado",
    });
    const nonOwnerToken = await loginAs(nonOwnerAdmin.email, nonOwnerAdmin.password);

    const viewOwner = await request.get(`/api/v1/users/${ownerRow.id}`).set(authHeader(nonOwnerToken));
    expect(viewOwner.status).toBe(403);

    const editOwner = await request
      .patch(`/api/v1/users/${ownerRow.id}`)
      .set(authHeader(nonOwnerToken))
      .send({ firstName: "Hack" });
    expect(editOwner.status).toBe(403);

    const createAdmin = await request
      .post("/api/v1/users")
      .set(authHeader(nonOwnerToken))
      .send({ firstName: "Otro", lastName: "Admin", role: "admin", email: uniqueEmail("adm"), password: TEST_PASSWORD, createAuthAccount: true });
    expect(createAdmin.status).toBe(403);

    const notFound = await request
      .get("/api/v1/users/123e4567-e89b-12d3-a456-426614174999")
      .set(authHeader(ownerToken));
    expect(notFound.status).toBe(404);
  });

  // CP-I52
  it("valida formato de UUID en GET /users/:id devolviendo 400 ante ID malformado", async () => {
    // Defecto conocido: UUID malformado devuelve 500 en lugar de 400.
    const badUuid = await request.get("/api/v1/users/no-es-uuid").set(authHeader(ownerToken));
    expect(badUuid.status).toBe(400);
  });

  // CP-I53
  it("reactivar un usuario eliminado/desactivado restaura su visibilidad en GET /users", async () => {
    const disposable = await createTempUser(tracker, {
      role: "client",
      firstName: "Toggle",
      lastName: "Estado",
    });

    const delRes = await request.delete(`/api/v1/users/${disposable.id}`).set(authHeader(ownerToken));
    expect(delRes.status).toBe(200);

    const reactivate = await request
      .patch(`/api/v1/users/${disposable.id}`)
      .set(authHeader(ownerToken))
      .send({ active: true });
    expect(reactivate.status).toBe(200);

    // Defecto conocido: reactivar no limpia deletedAt y oculta el usuario del listado GET /users.
    const listAfterReactivate = await request
      .get(`/api/v1/users?search=${encodeURIComponent(disposable.email)}`)
      .set(authHeader(ownerToken));
    expect(listAfterReactivate.status).toBe(200);
    expect(listAfterReactivate.body.data.some((u: { id: string }) => u.id === disposable.id)).toBe(true);
  });

  // CP-I54
  it("bloquea la autoeliminación del administrador en DELETE /users/:id", async () => {
    // Defecto conocido: admin no debería poder autoeliminarse.
    const disposableAdmin = await createTempUser(tracker, {
      role: "admin",
      isOwner: false,
      firstName: "Self",
      lastName: "Delete",
    });
    const selfAdminToken = await loginAs(disposableAdmin.email, disposableAdmin.password);
    const selfDelete = await request
      .delete(`/api/v1/users/${disposableAdmin.id}`)
      .set(authHeader(selfAdminToken));
    expect(selfDelete.status).toBe(403);
  });
});

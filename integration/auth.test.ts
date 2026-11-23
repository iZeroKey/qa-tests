// Pruebas de integración de inicio de sesión, refresh token, registro y cambio de contraseña.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml.js";
import {
  authHeader,
  loginAs,
  loginFull,
  request,
  seededEmails,
  TEST_PASSWORD,
  uniqueEmail,
} from "../helpers/integration.js";

const tracker = new TestCleanupTracker();
let ownerToken: string;

beforeAll(async () => {
  ownerToken = await loginAs(seededEmails.admin);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("autenticación", () => {
  // CP-I06
  it("inicia sesión con credenciales válidas para owner, cliente e inversionista", async () => {
    const adminLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: seededEmails.admin, password: TEST_PASSWORD });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.data.session.access_token).toBeTruthy();
    expect(adminLogin.body.data.session.refresh_token).toBeTruthy();
    expect(adminLogin.body.data.user).toMatchObject({ role: "admin", isOwner: true });

    const clientLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: seededEmails.client, password: TEST_PASSWORD });
    expect(clientLogin.status).toBe(200);
    expect(clientLogin.body.data.user.role).toBe("client");

    const investorLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: seededEmails.investor, password: TEST_PASSWORD });
    expect(investorLogin.status).toBe(200);
    expect(investorLogin.body.data.user.role).toBe("investor");
  });

  // CP-I07
  it("rechaza credenciales inválidas y valida payload de login/refresh/register", async () => {
    const badFormat = await request.post("/api/v1/auth/login").send({ email: "no-es-correo", password: "123" });
    expect(badFormat.status).toBe(400);
    expect(badFormat.body.success).toBe(false);

    const invalidLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: seededEmails.admin, password: "wrong-password" });
    expect(invalidLogin.status).toBe(401);
    expect(invalidLogin.body.success).toBe(false);

    const badRefresh = await request.post("/api/v1/auth/refresh").send({ refresh_token: "invalid-token" });
    expect(badRefresh.status).toBe(401);

    const emptyRefresh = await request.post("/api/v1/auth/refresh").send({ refresh_token: "" });
    expect(emptyRefresh.status).toBe(400);

    const invalidRegister = await request
      .post("/api/v1/auth/register")
      .set(authHeader(ownerToken))
      .send({ firstName: "x" });
    expect(invalidRegister.status).toBe(400);
  });

  // CP-I08
  it("rechaza rutas protegidas sin token y cierra una sesión temporal independiente", async () => {
    const unauthenticated = await request.get("/api/v1/users/me");
    expect(unauthenticated.status).toBe(401);

    const badToken = await request.get("/api/v1/users/me").set(authHeader("token-invalido"));
    expect(badToken.status).toBe(401);

    const tempClient = await createTempUser(tracker, {
      role: "client",
      firstName: "Logout",
      lastName: "Temporal",
    });
    const session = await loginFull(tempClient.email, tempClient.password);
    const logout = await request.post("/api/v1/auth/logout").set(authHeader(session.accessToken));
    expect(logout.status).toBe(200);

    const afterLogout = await request.get("/api/v1/users/me").set(authHeader(session.accessToken));
    expect(afterLogout.status).toBe(401);
  });

  // CP-I09
  it("POST /auth/refresh renueva sesión válida y rechaza usuario desactivado", async () => {
    const temp = await createTempUser(tracker, {
      role: "client",
      firstName: "Refresh",
      lastName: "User",
    });
    const session = await loginFull(temp.email, temp.password);

    const refreshed = await request.post("/api/v1/auth/refresh").send({ refresh_token: session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.session.access_token).toBeTruthy();

    await request
      .patch(`/api/v1/users/${temp.id}`)
      .set(authHeader(ownerToken))
      .send({ active: false });

    const loginInactive = await request
      .post("/api/v1/auth/login")
      .send({ email: temp.email, password: temp.password });
    expect(loginInactive.status).toBe(403);

    const refreshInactive = await request
      .post("/api/v1/auth/refresh")
      .send({ refresh_token: refreshed.body.data.session.refresh_token });
    expect([401, 403]).toContain(refreshInactive.status);
  });

  // CP-I10
  it("POST /auth/register respeta permisos owner vs admin no-propietario", async () => {
    const nonOwnerAdmin = await createTempUser(tracker, {
      role: "admin",
      isOwner: false,
      firstName: "Admin",
      lastName: "NoOwner",
    });
    const nonOwnerToken = await loginAs(nonOwnerAdmin.email, nonOwnerAdmin.password);

    const clientToken = await loginAs(seededEmails.client);
    const forbiddenClient = await request
      .post("/api/v1/auth/register")
      .set(authHeader(clientToken))
      .send({ email: uniqueEmail("cli-reg"), password: TEST_PASSWORD, firstName: "No", lastName: "Permitido" });
    expect(forbiddenClient.status).toBe(403);

    const forbiddenAdminCreate = await request
      .post("/api/v1/auth/register")
      .set(authHeader(nonOwnerToken))
      .send({
        email: uniqueEmail("adm-reg"),
        password: TEST_PASSWORD,
        firstName: "Otro",
        lastName: "Admin",
        role: "admin",
      });
    expect(forbiddenAdminCreate.status).toBe(403);

    const email = uniqueEmail("auth-reg");
    const created = await request
      .post("/api/v1/auth/register")
      .set(authHeader(ownerToken))
      .send({
        email,
        password: TEST_PASSWORD,
        firstName: "Registrado",
        lastName: "QA",
        role: "investor",
      });
    expect(created.status).toBe(201);
    tracker.trackUser(created.body.data.user.id, created.body.data.user.authUserId, email);
  });

  // CP-I11
  it("POST /auth/register rechaza correo duplicado con conflicto 409", async () => {
    const existing = await createTempUser(tracker, {
      role: "investor",
      firstName: "DupOrig",
      lastName: "QA",
    });
    // Defecto conocido: registro duplicado responde 400 en vez de 409 Conflict.
    const duplicate = await request
      .post("/api/v1/auth/register")
      .set(authHeader(ownerToken))
      .send({
        email: existing.email,
        password: TEST_PASSWORD,
        firstName: "Duplicado",
        lastName: "QA",
        role: "investor",
      });
    expect(duplicate.status).toBe(409);
  });

  // CP-I12
  it("POST /auth/change-password valida contraseña actual, actualiza y permite ingresar con la nueva", async () => {
    const temp = await createTempUser(tracker, {
      role: "client",
      firstName: "Clave",
      lastName: "Cambio",
    });
    const token = await loginAs(temp.email, temp.password);

    const empty = await request
      .post("/api/v1/auth/change-password")
      .set(authHeader(token))
      .send({ currentPassword: "", newPassword: "" });
    expect(empty.status).toBe(400);

    const wrong = await request
      .post("/api/v1/auth/change-password")
      .set(authHeader(token))
      .send({ currentPassword: "clave-incorrecta", newPassword: "nueva-password-123" });
    expect(wrong.status).toBe(401);

    const changed = await request
      .post("/api/v1/auth/change-password")
      .set(authHeader(token))
      .send({ currentPassword: temp.password, newPassword: "NuevaPassword2026!" });
    expect(changed.status).toBe(200);

    const oldLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: temp.email, password: temp.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: temp.email, password: "NuevaPassword2026!" });
    expect(newLogin.status).toBe(200);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs, request, seededEmails, uniqueEmail } from "../helpers/integration.js";

let adminToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
});

describe("autenticación", () => {
  // CP-I03
  it("inicia sesión con credenciales válidas y devuelve el rol", async () => {
    const response = await request.post("/api/v1/auth/login").send({ email: seededEmails.admin, password: "password123" });
    expect(response.status).toBe(200);
    expect(response.body.data.session.access_token).toBeTruthy();
    expect(response.body.data.user.role).toBe("admin");
  });

  // CP-I04
  it("rechaza credenciales inválidas, refresh, registro y cambio de contraseña", async () => {
    const invalidLogin = await request.post("/api/v1/auth/login").send({ email: seededEmails.admin, password: "wrong" });
    expect([400, 401]).toContain(invalidLogin.status);
    expect(invalidLogin.body.success).toBe(false);

    const refresh = await request.post("/api/v1/auth/refresh").send({ refresh_token: "invalid" });
    expect([400, 401]).toContain(refresh.status);

    const invalidRegister = await request.post("/api/v1/auth/register").set(authHeader(adminToken)).send({ firstName: "x" });
    expect(invalidRegister.status).toBe(400);

    const email = uniqueEmail("auth-register");
    const register = await request
      .post("/api/v1/auth/register")
      .set(authHeader(adminToken))
      .send({ email, password: "password123", firstName: "Registrado", lastName: "Integración", role: "client" });
    expect(register.status).toBe(201);
    const remove = await request.delete(`/api/v1/users/${register.body.data.user.id}`).set(authHeader(adminToken));
    expect(remove.status).toBe(200);

    const invalidPassword = await request
      .post("/api/v1/auth/change-password")
      .set(authHeader(adminToken))
      .send({ currentPassword: "", newPassword: "" });
    expect(invalidPassword.status).toBe(400);

    const wrongPassword = await request
      .post("/api/v1/auth/change-password")
      .set(authHeader(adminToken))
      .send({ currentPassword: "wrong-password", newPassword: "new-password-123" });
    expect(wrongPassword.status).toBe(401);
  });

  // CP-I05
  it("rechaza perfiles sin token y cierra una sesión independiente", async () => {
    const unauthenticated = await request.get("/api/v1/users/me");
    expect(unauthenticated.status).toBe(401);

    const logoutToken = await loginAs(seededEmails.investor);
    const logout = await request.post("/api/v1/auth/logout").set(authHeader(logoutToken));
    expect(logout.status).toBe(200);
  });
});

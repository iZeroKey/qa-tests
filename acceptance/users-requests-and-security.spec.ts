// Pruebas de aceptación (HU-06, HU-07, HU-10, HU-16): gestión de usuarios, solicitudes de acceso y control RBAC.
import { test, expect } from "@playwright/test";
import { ensureApiAlive } from "../support/api-health";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml";
import {
  createTestLoan,
  loginAs as apiLoginAs,
  request,
  seededEmails,
  uniqueEmail,
} from "../helpers/integration";
import { loginAdmin, loginAs, logout, TEST_PASSWORD } from "../support/ui-flows";

const tracker = new TestCleanupTracker();
let adminToken: string;

test.beforeAll(async () => {
  adminToken = await apiLoginAs(seededEmails.admin);
});

test.afterAll(async () => {
  await tracker.cleanup();
});

test.beforeEach(async ({}, testInfo) => {
  await ensureApiAlive(testInfo.title);
  adminToken = await apiLoginAs(seededEmails.admin);
});

test.afterEach(async ({}, testInfo) => {
  await ensureApiAlive(testInfo.title);
});

// CP-A06 (HU-06)
test("CP-A06 (HU-06): administrador crea usuario operativo, vincula acceso Auth y controla activación", async ({
  page,
}) => {
  const uniqueFirst = `UatH6${Date.now().toString().slice(-5)}`;
  const linkedEmail = uniqueEmail("uat-h6");

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("button", { name: /Nuevo usuario/i }).click();
  await page.locator("#firstName").fill(uniqueFirst);
  await page.locator("#lastName").fill("Operativo");
  await page.locator("#phone").fill("987111222");

  const createPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/users") && res.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const createJson = (await (await createPromise).json()) as { data?: { id?: string } };
  tracker.trackUser(createJson.data?.id, null, linkedEmail);
  await expect(page.getByText("Usuario creado", { exact: true })).toBeVisible({ timeout: 15000 });

  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill(uniqueFirst);
  await page.locator("tbody tr", { hasText: uniqueFirst }).first().click();
  await page.getByRole("button", { name: /Vincular acceso/i }).click();
  await page.locator("#link-email").fill(linkedEmail);
  await page.locator("#link-password").fill(TEST_PASSWORD);
  const linkPromise = page.waitForResponse(
    (res) => res.url().includes("/auth-account") && res.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: /Vincular acceso/i }).last().click();
  const linkJson = (await (await linkPromise).json()) as { data?: { id?: string; authUserId?: string } };
  tracker.trackUser(linkJson.data?.id, linkJson.data?.authUserId, linkedEmail);
  await expect(page.getByText("Cuenta vinculada", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, linkedEmail, TEST_PASSWORD);
  await expect(page).toHaveURL(/#\/home$/);
  await logout(page);

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill(linkedEmail);
  await page.locator("tbody tr", { hasText: linkedEmail }).first().click();
  await page.getByRole("button", { name: /^Editar$/i }).click();
  await page.getByRole("switch").first().click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Usuario actualizado", { exact: true })).toBeVisible({ timeout: 15000 });
});

// CP-A07 (HU-07)
test("CP-A07 (HU-07): visitante solicita acceso desde login y administrador aprueba habilitando ingreso real", async ({
  page,
}) => {
  const reqEmail = uniqueEmail("uat-h7");
  tracker.trackAccessRequest(null, reqEmail);
  tracker.trackUser(null, null, reqEmail);

  await page.goto("/");
  await page.getByRole("button", { name: "Solicita tu acceso aquí" }).click();
  await page.locator("#first-name").fill("UatVisitante");
  await page.locator("#last-name").fill("Onboarding");
  await page.locator("#request-email").fill(reqEmail);
  await page.locator("#request-phone").fill("987654321");
  await page.getByRole("button", { name: /Enviar solicitud/i }).click();
  await expect(page.getByText("Solicitud enviada", { exact: true })).toBeVisible({ timeout: 15000 });

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("tab", { name: /Solicitudes/i }).click();
  await page.getByPlaceholder("Nombre, correo, teléfono u observación").fill(reqEmail);
  await page.locator("tbody tr", { hasText: reqEmail }).first().click();
  await page.getByRole("button", { name: /Aprobar/i }).click();
  await page.locator("#request-initial-password").fill("IngresoUAT2026!");
  await page.getByRole("button", { name: /^Aprobar$/i }).last().click();
  await expect(page.getByText("Solicitud aprobada", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, reqEmail, "IngresoUAT2026!");
  await expect(page.getByText("Mi Panel", { exact: true }).first()).toBeVisible();
});

// CP-A10 (HU-10)
test("CP-A10 (HU-10): permisos protegen módulos administrativos y aíslan préstamos entre clientes distintos", async ({
  page,
}) => {
  const clientA = await createTempUser(tracker, { role: "client", firstName: "UatPrivA", lastName: "Cli" });
  const clientB = await createTempUser(tracker, { role: "client", firstName: "UatPrivB", lastName: "Cli" });
  const secretLoanName = `Préstamo Privado UAT ${Date.now()}`;
  await createTestLoan(adminToken, clientA.id, { name: secretLoanName }, tracker);

  await loginAs(page, clientB.email, clientB.password);
  await page.goto("/#/loans");
  await expect(page.getByText("Mis préstamos", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(secretLoanName)).toHaveCount(0);

  for (const pathRoute of ["/#/users", "/#/requests", "/#/audit"]) {
    await page.goto(pathRoute);
    await expect(page.getByText("Acceso restringido", { exact: true })).toBeVisible({ timeout: 10000 });
  }
});

// CP-A16 (HU-16)
test("CP-A16 (HU-16): administrador rechaza solicitud de acceso con observación y no-propietario respeta restricciones RBAC", async ({
  page,
}) => {
  const nonOwnerAdmin = await createTempUser(tracker, {
    role: "admin",
    isOwner: false,
    firstName: "UatH16NoOwn",
    lastName: "Adm",
  });
  const reqEmail = uniqueEmail("uat-h16-rej");
  const reqRes = await request.post("/api/v1/access-requests").send({
    firstName: "UatRechaza",
    lastName: "Solicitud",
    email: reqEmail,
    phone: "987650099",
    roleRequested: "client",
  });
  expect(reqRes.status).toBe(201);
  tracker.trackAccessRequest(reqRes.body.data.id, reqEmail);

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("tab", { name: /Solicitudes/i }).click();
  await page.getByPlaceholder("Nombre, correo, teléfono u observación").fill(reqEmail);
  await page.locator("tbody tr", { hasText: reqEmail }).first().click();
  await page.getByRole("button", { name: /Rechazar/i }).click();
  await page.locator("#request-observation").fill("Registro duplicado en validación");
  await page.getByRole("button", { name: /^Rechazar$/i }).last().click();
  await expect(page.getByText("Solicitud rechazada", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, nonOwnerAdmin.email, nonOwnerAdmin.password);
  await page.goto("/#/users");
  await page.getByRole("button", { name: /Nuevo usuario/i }).click();
  await page.locator("#role").click();
  await expect(page.getByRole("option", { name: "Administrador" })).toHaveCount(0);
  await page.getByRole("option", { name: "Cliente", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.getByRole("tab", { name: /Usuarios/i }).click();
  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill("admin@abc.com");
  await page.locator("tbody tr", { hasText: "admin@abc.com" }).first().click();
  await expect(page.getByRole("dialog").getByText("admin@abc.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Editar$/i })).toHaveCount(0);
});

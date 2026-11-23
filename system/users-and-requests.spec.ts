// Pruebas de sistema de gestión de usuarios, solicitudes de acceso y jerarquía propietario vs administrador.
import { test, expect } from "@playwright/test";
import { ensureApiAlive } from "../support/api-health";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml";
import { request, uniqueEmail } from "../helpers/integration";
import { loginAdmin, loginAs, logout, TEST_PASSWORD } from "../support/ui-flows";

const tracker = new TestCleanupTracker();
let nonOwnerAdmin: Awaited<ReturnType<typeof createTempUser>>;

test.beforeAll(async () => {
  nonOwnerAdmin = await createTempUser(tracker, {
    role: "admin",
    isOwner: false,
    firstName: "NoOwnerUI",
    lastName: "AdminQA",
  });
});

test.afterAll(async () => {
  await tracker.cleanup();
});

test.beforeEach(async ({}, testInfo) => {
  await ensureApiAlive(testInfo.title);
});

test.afterEach(async ({}, testInfo) => {
  await ensureApiAlive(testInfo.title);
});

// CP-S11
test("CP-S11: administrador lista, busca, filtra por rol/estado y abre detalle de usuario", async ({ page }) => {
  const searchable = await createTempUser(tracker, {
    role: "investor",
    firstName: "BuscableQA",
    lastName: "FiltroInv",
  });

  await loginAdmin(page);
  await page.goto("/#/users");
  await expect(page.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible({ timeout: 15000 });

  // Primer combobox filtra por rol (Inversionistas)
  await page.locator("button[role='combobox']").first().click();
  await page.getByRole("option", { name: "Inversionistas", exact: true }).click();

  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill("BuscableQA");
  const row = page.locator("tbody tr", { hasText: searchable.email }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();

  await expect(page.getByText("Datos personales", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("dialog").getByText(searchable.email, { exact: true })).toBeVisible();
});

// CP-S12
test("CP-S12: crea usuario operativo sin Auth, vincula cuenta Auth y valida inicio de sesión (RF-05, RF-08)", async ({
  page,
}) => {
  const uniqueFirst = `Operativo${Date.now().toString().slice(-5)}`;
  const linkedEmail = uniqueEmail("linked-ui");

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("button", { name: /Nuevo usuario/i }).click();
  await expect(page.getByRole("heading", { name: "Nuevo usuario" })).toBeVisible();

  await page.locator("#firstName").fill(uniqueFirst);
  await page.locator("#lastName").fill("SinAuth");
  await page.locator("#phone").fill("987654321");

  const createResPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/users") && res.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const createRes = await createResPromise;
  expect(createRes.status()).toBe(201);
  const createdJson = (await createRes.json()) as { data?: { id?: string } };
  tracker.trackUser(createdJson.data?.id, null, linkedEmail);

  await expect(page.getByText("Usuario creado", { exact: true })).toBeVisible({ timeout: 15000 });

  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill(uniqueFirst);
  const row = page.locator("tbody tr", { hasText: uniqueFirst }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();

  await page.getByRole("button", { name: /Vincular acceso/i }).click();
  await expect(page.getByRole("heading", { name: "Vincular cuenta de acceso" })).toBeVisible();

  await page.locator("#link-email").fill(linkedEmail);
  await page.locator("#link-password").fill(TEST_PASSWORD);

  const linkResPromise = page.waitForResponse(
    (res) => res.url().includes("/auth-account") && res.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: /Vincular acceso/i }).last().click();
  const linkRes = await linkResPromise;
  expect([200, 201]).toContain(linkRes.status());
  const linkedJson = (await linkRes.json()) as { data?: { id?: string; authUserId?: string } };
  tracker.trackUser(linkedJson.data?.id, linkedJson.data?.authUserId, linkedEmail);

  await expect(page.getByText("Cuenta vinculada", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, linkedEmail, TEST_PASSWORD);
  await expect(page.getByText("Mi Panel", { exact: true }).first()).toBeVisible();
});

// CP-S13
test("CP-S13: crea usuario con Auth, edita datos en UI y verifica persistencia tras recarga", async ({ page }) => {
  const email = uniqueEmail("auth-ui");
  tracker.trackUser(null, null, email);

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("button", { name: /Nuevo usuario/i }).click();

  await page.locator("#firstName").fill("ConAuth");
  await page.locator("#lastName").fill("Persiste");
  await page.locator("#email").fill(email);
  await page.locator("#phone").fill("981234567");
  await page.getByText("Crear cuenta de acceso", { exact: true }).click();
  await page.locator("#password").fill(TEST_PASSWORD);

  const createResPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/users") && res.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const createRes = await createResPromise;
  expect(createRes.status()).toBe(201);
  const created = (await createRes.json()) as { data?: { id?: string; authUserId?: string } };
  tracker.trackUser(created.data?.id, created.data?.authUserId, email);

  await expect(page.getByText("Usuario creado", { exact: true })).toBeVisible({ timeout: 15000 });

  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill(email);
  const row = page.locator("tbody tr", { hasText: email }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();

  await page.getByRole("button", { name: /^Editar$/i }).click();
  await expect(page.getByRole("heading", { name: "Editar usuario" })).toBeVisible();
  await page.locator("#address").fill("Av. Persistencia UI 742");
  const patchResPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/users/") && res.request().method() === "PATCH",
    { timeout: 15000 },
  );
  const refreshResPromise = page.waitForResponse(
    (res) => /\/api\/v1\/users(\?|$)/.test(res.url()) && res.request().method() === "GET" && res.status() === 200,
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const patchRes = await patchResPromise;
  expect(patchRes.status()).toBe(200);
  await expect(page.getByText("Usuario actualizado", { exact: true })).toBeVisible({ timeout: 15000 });
  await refreshResPromise;
  await page.waitForTimeout(1500);

  await page.reload();
  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill(email);
  await page.locator("tbody tr", { hasText: email }).first().click();
  await expect(page.getByText("Av. Persistencia UI 742", { exact: true })).toBeVisible({ timeout: 10000 });
});

// CP-S14
test("CP-S14: desactiva y reactiva usuario desde UI bloqueando y restaurando su acceso (RF-07)", async ({ page }) => {
  const toggleUser = await createTempUser(tracker, {
    role: "client",
    firstName: "ToggleUI",
    lastName: "Estado",
  });

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill(toggleUser.email);
  await page.locator("tbody tr", { hasText: toggleUser.email }).first().click();
  await page.getByRole("button", { name: /^Editar$/i }).click();

  await page.getByRole("switch").first().click();
  await expect(page.getByText("El usuario quedará sin acceso", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Usuario actualizado", { exact: true })).toBeVisible({ timeout: 15000 });

  await page.keyboard.press("Escape");
  await logout(page);

  await page.locator("#email").fill(toggleUser.email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/#\/login/);

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill(toggleUser.email);
  await page.locator("tbody tr", { hasText: toggleUser.email }).first().click();
  await page.getByRole("button", { name: /^Editar$/i }).click();
  await page.getByRole("switch").first().click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Usuario actualizado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, toggleUser.email, TEST_PASSWORD);
  await expect(page).toHaveURL(/#\/home$/);
});

// CP-S15
test("CP-S15: administrador no-propietario no puede crear rol Admin ni editar al Owner en UI", async ({ page }) => {
  await loginAs(page, nonOwnerAdmin.email, nonOwnerAdmin.password);
  await page.goto("/#/users");

  await page.getByRole("button", { name: /Nuevo usuario/i }).click();
  await page.locator("#role").click();
  await expect(page.getByRole("option", { name: "Administrador" })).toHaveCount(0);
  await page.getByRole("option", { name: "Cliente", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.getByPlaceholder("Código, nombre, DNI, correo, teléfono o banco").fill("admin@abc.com");
  const ownerRow = page.locator("tbody tr", { hasText: "admin@abc.com" }).first();
  await expect(ownerRow).toBeVisible({ timeout: 15000 });
  await ownerRow.click();

  await expect(page.getByRole("dialog").getByText("admin@abc.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Editar$/i })).toHaveCount(0);
});

// CP-S16
test("CP-S16: navegar directamente a /#/requests debe abrir la pestaña Solicitudes aunque Usuarios fuera la última activa", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("tab", { name: /Solicitudes/i }).click();
  await page.getByRole("tab", { name: /Usuarios/i }).click();

  await page.goto("/#/requests");
  // Defecto conocido (UsersPage.tsx:65): preferencia localStorage "abc-users-preferences" sobrescribe initialTab="requests".
  await expect(page.getByRole("tab", { name: /Solicitudes/i })).toHaveAttribute("aria-selected", "true", {
    timeout: 5000,
  });
});

// CP-S17
test("CP-S17: administrador aprueba solicitud de acceso con contraseña temporal y el nuevo usuario ingresa (RF-10)", async ({
  page,
}) => {
  const reqEmail = uniqueEmail("req-app-ui");
  const createdReq = await request.post("/api/v1/access-requests").send({
    firstName: "AprobarUI",
    lastName: "Postulante",
    email: reqEmail,
    phone: "987650011",
    roleRequested: "client",
  });
  expect(createdReq.status).toBe(201);
  tracker.trackAccessRequest(createdReq.body.data.id, reqEmail);
  tracker.trackUser(null, null, reqEmail);

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("tab", { name: /Solicitudes/i }).click();
  await page.getByPlaceholder("Nombre, correo, teléfono u observación").fill(reqEmail);

  const reqRow = page.locator("tbody tr", { hasText: reqEmail }).first();
  await expect(reqRow).toBeVisible({ timeout: 15000 });
  await reqRow.click();

  await expect(page.getByRole("heading", { name: "Detalle de solicitud" })).toBeVisible();
  await page.getByRole("button", { name: /Aprobar/i }).click();
  await expect(page.getByRole("heading", { name: "Aprobar solicitud" })).toBeVisible();

  await page.locator("#request-initial-password").fill("ClaveReq2026!");
  await page.locator("#request-observation").fill("Aprobado en prueba de sistema");

  const approveResPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/access-requests/") && res.request().method() === "PATCH",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: /^Aprobar$/i }).last().click();
  const approveRes = await approveResPromise;
  expect(approveRes.status()).toBe(200);

  await expect(page.getByText("Solicitud aprobada", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, reqEmail, "ClaveReq2026!");
  await expect(page.getByText("Mi Panel", { exact: true }).first()).toBeVisible();
});

// CP-S18
test("CP-S18: administrador rechaza solicitud de acceso con observación y verifica estado actualizado (RF-10)", async ({
  page,
}) => {
  const reqEmail = uniqueEmail("req-rej-ui");
  const createdReq = await request.post("/api/v1/access-requests").send({
    firstName: "RechazarUI",
    lastName: "Postulante",
    email: reqEmail,
    phone: "987650022",
    roleRequested: "investor",
  });
  expect(createdReq.status).toBe(201);
  tracker.trackAccessRequest(createdReq.body.data.id, reqEmail);

  await loginAdmin(page);
  await page.goto("/#/users");
  await page.getByRole("tab", { name: /Solicitudes/i }).click();
  await page.getByPlaceholder("Nombre, correo, teléfono u observación").fill(reqEmail);

  const reqRow = page.locator("tbody tr", { hasText: reqEmail }).first();
  await expect(reqRow).toBeVisible({ timeout: 15000 });
  await reqRow.click();

  await page.getByRole("button", { name: /Rechazar/i }).click();
  await expect(page.getByRole("heading", { name: "Rechazar solicitud" })).toBeVisible();
  await page.locator("#request-observation").fill("Documentación incompleta en solicitud");
  await page.getByRole("button", { name: /^Rechazar$/i }).last().click();

  await expect(page.getByText("Solicitud rechazada", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Documentación incompleta en solicitud", { exact: true })).toBeVisible();
});

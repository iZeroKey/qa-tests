// Pruebas de sistema sobre autenticación, sesión y navegación por roles en navegador web.
import { test, expect } from "@playwright/test";
import { ensureApiAlive } from "../support/api-health";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml";
import { uniqueEmail } from "../helpers/integration";
import {
  attachPageErrorTracker,
  loginAdmin,
  loginAs,
  loginClient,
  loginInvestor,
  logout,
  TEST_PASSWORD,
} from "../support/ui-flows";

const tracker = new TestCleanupTracker();
let inactiveUser: Awaited<ReturnType<typeof createTempUser>>;

test.beforeAll(async () => {
  inactiveUser = await createTempUser(tracker, {
    role: "client",
    firstName: "Inactivo",
    lastName: "LoginQA",
    active: false,
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

// CP-S01
test("CP-S01: inicio de sesión válido por rol redirige a /#/home y actualiza título", async ({ page }) => {
  const trackerErr = attachPageErrorTracker(page);

  await loginAdmin(page);
  await expect(page.getByText("Administración", { exact: true }).first()).toBeVisible();
  await expect(page).toHaveTitle(/Inicio • ABC Inversiones/);
  await logout(page);

  await loginClient(page);
  await expect(page.getByText("Mi Panel", { exact: true }).first()).toBeVisible();
  await logout(page);

  await loginInvestor(page);
  await expect(page.getByText("Panel Inversionista", { exact: true }).first()).toBeVisible();

  expect(trackerErr.pageErrors).toHaveLength(0);
  expect(trackerErr.http5xx).toHaveLength(0);
});

// CP-S02
test("CP-S02: credenciales inválidas muestran mensaje exacto y mantienen /#/login", async ({ page }) => {
  await page.goto("/");
  await page.locator("#email").fill("admin@abc.com");
  await page.locator("#password").fill("clave-invalida-qa");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByText("Correo electrónico o contraseña incorrectos.", { exact: true })).toBeVisible({
    timeout: 10000,
  });
});

// CP-S03
test("CP-S03: validación Zod en formulario de login vacío y correo malformado", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByText("El correo es obligatorio", { exact: true })).toBeVisible();
  await expect(page.getByText("La contraseña es obligatoria", { exact: true })).toBeVisible();

  // "usuario@dominio" supera type="email" nativo y activa la validación Zod de correo válido + mínimo 6 chars
  await page.locator("#email").fill("usuario@dominio");
  await page.locator("#password").fill("123");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(page.getByText("Ingresa un correo válido", { exact: true })).toBeVisible();
  await expect(page.getByText("Mínimo 6 caracteres", { exact: true })).toBeVisible();
});

// CP-S04
test("CP-S04: usuario desactivado recibe mensaje claro de cuenta inactiva al intentar iniciar sesión", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#email").fill(inactiveUser.email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(page).toHaveURL(/#\/login/);
  // Defecto conocido (LoginPage.tsx:234-245): HTTP 403 dispara toast genérico en lugar de informar cuenta inactiva.
  await expect(page.getByText(/inactiv|desactivad|suspendid/i).first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Error del servidor", { exact: true })).toHaveCount(0);
});

// CP-S05
test("CP-S05: Recordarme persiste sesión en localStorage y Cerrar sesión la limpia por completo (RF-03)", async ({
  page,
}) => {
  await loginAs(page, "admin@abc.com", TEST_PASSWORD, { remember: true });

  const persistedBeforeReload = await page.evaluate(() => Boolean(localStorage.getItem("auth.session")));
  expect(persistedBeforeReload).toBe(true);

  await page.reload();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByText("Administración", { exact: true }).first()).toBeVisible();

  await logout(page);
  const tokensCleared = await page.evaluate(
    () => !localStorage.getItem("auth.session") && !sessionStorage.getItem("auth.session"),
  );
  expect(tokensCleared).toBe(true);
});

// CP-S06
test("CP-S06: solicitud de acceso pública desde LoginPage valida datos y registra envío (RF-09)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Solicita tu acceso aquí" }).click();
  await expect(page.getByRole("heading", { name: "Solicitar acceso" }).or(page.getByText("Solicitar acceso"))).toBeVisible();

  await page.locator("#first-name").fill("A");
  await page.locator("#last-name").fill("B");
  await page.locator("#request-email").fill("a@b.pe");
  await page.locator("#request-phone").fill("123");
  await page.getByRole("button", { name: /Enviar solicitud/i }).click();
  await expect(page.getByText("Revisa tus datos", { exact: true })).toBeVisible({ timeout: 5000 });

  const reqEmail = uniqueEmail("pub-req");
  tracker.trackAccessRequest(null, reqEmail);

  await page.locator("#first-name").fill("Postulante");
  await page.locator("#last-name").fill("PúblicoQA");
  await page.locator("#request-email").fill(reqEmail);
  await page.locator("#request-phone").fill("987654321");

  await page.getByRole("button", { name: /Enviar solicitud/i }).click();
  await expect(page.getByText("Solicitud enviada", { exact: true })).toBeVisible({ timeout: 15000 });
});

// CP-S07
test("CP-S07: navegación completa por módulos permitidos para administrador, cliente e inversionista", async ({
  page,
}) => {
  await loginAdmin(page);
  const sidebar = page.locator("aside, [data-sidebar='sidebar']").first();
  for (const label of ["Inicio", "Préstamos", "Usuarios", "Auditoría", "Perfil"]) {
    await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
  }

  for (const [path, heading] of [
    ["/#/loans", "Préstamos"],
    ["/#/users", "Usuarios"],
    ["/#/audit", "Auditoría"],
    ["/#/notifications", "Notificaciones"],
    ["/#/profile", "Mi perfil"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 15000 });
  }
  await logout(page);

  await loginClient(page);
  await expect(page.locator("a[href='#/users']")).toHaveCount(0);
  await expect(page.locator("a[href='#/audit']")).toHaveCount(0);
  await logout(page);

  await loginInvestor(page);
  await expect(page.locator("a[href='#/investments']")).toBeVisible();
  await expect(page.locator("a[href='#/users']")).toHaveCount(0);
});

// CP-S08
test("CP-S08: ruta inexistente renderiza NotFoundPage y permite volver al inicio", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/#/ruta-inexistente-qa-404");

  await expect(page.getByText("Página no encontrada", { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("link", { name: /Ir al inicio/i }).click();
  await expect(page).toHaveURL(/#\/home$/);
});

// CP-S09
test("CP-S09: usuario autenticado que navega a /#/login debe redirigirse a /#/home", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/#/login");

  // Defecto conocido (App.tsx/LoginPage.tsx): sesión activa no redirige fuera de /#/login.
  await expect(page).toHaveURL(/#\/home$/, { timeout: 5000 });
});

// CP-S10
test("CP-S10: rutas administrativas por URL muestran Acceso restringido sin disparar consultas 403 en segundo plano", async ({
  page,
}) => {
  await loginClient(page);
  const tracker403 = attachPageErrorTracker(page);

  for (const restrictedPath of ["/#/users", "/#/requests", "/#/audit"]) {
    await page.goto(restrictedPath);
    await expect(page.getByText("Acceso restringido", { exact: true })).toBeVisible({ timeout: 10000 });
  }
  await page.waitForTimeout(800);

  // Defecto conocido (UsersPage.tsx:107-121, AuditPage.tsx:412-417): disparan consultas sin enabled: isAdmin.
  expect(tracker403.http403).toHaveLength(0);
});

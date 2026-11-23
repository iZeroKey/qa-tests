// Pruebas de aceptación (HU-08, HU-09, HU-11, HU-17, HU-18): notificaciones, perfil, auditoría y experiencia web.
import { test, expect } from "@playwright/test";
import { ensureApiAlive } from "../support/api-health";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml";
import {
  authHeader,
  createTestLoan,
  loginAs as apiLoginAs,
  request,
  seededEmails,
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

// CP-A08 (HU-08)
test("CP-A08 (HU-08): usuario recibe notificaciones por evento real de préstamo y gestiona su lectura", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH8", lastName: "Notif" });
  const loan = await createTestLoan(adminToken, client.id, { name: "UAT Notif Loan" }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await page.goto("/#/notifications");
  await page.getByRole("tab", { name: "Sin leer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Marcar como leída" }).first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /Marcar todas leídas/i }).click();
  await expect(page.getByText("¡Estás al día!", { exact: true })).toBeVisible({ timeout: 10000 });
});

// CP-A09 (HU-09)
test("CP-A09 (HU-09): usuario actualiza su perfil, cambia contraseña y reingresa con la nueva credencial", async ({
  page,
}) => {
  const user = await createTempUser(tracker, { role: "client", firstName: "UatH9", lastName: "Perfil" });

  await loginAs(page, user.email, TEST_PASSWORD);
  await page.goto("/#/profile");
  await page.getByRole("button", { name: /Editar perfil/i }).click();
  await page.locator("#address").fill("Av. Aceptación UAT 100");
  await page.getByRole("button", { name: /Guardar Cambios/i }).click();
  await expect(page.getByText("Perfil actualizado", { exact: true })).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /Cambiar contraseña/i }).click();
  await page.locator("#currentPassword").fill(TEST_PASSWORD);
  await page.locator("#newPassword").fill("UatPass2026!");
  await page.locator("#confirmPassword").fill("UatPass2026!");
  await page.getByRole("button", { name: /Guardar Contraseña/i }).click();
  await expect(page.getByText("Contraseña actualizada", { exact: true })).toBeVisible({ timeout: 15000 });
  await logout(page);

  await loginAs(page, user.email, "UatPass2026!");
  await page.goto("/#/profile");
  await expect(page.getByText("Av. Aceptación UAT 100", { exact: true })).toBeVisible({ timeout: 15000 });
});

// CP-A11 (HU-11)
test("CP-A11 (HU-11): bitácora de auditoría registra y detalla operaciones críticas consultables por admin", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH11", lastName: "Audit" });
  await createTestLoan(adminToken, client.id, { name: "Préstamo Audit UAT" }, tracker);

  await loginAdmin(page);
  await page.goto("/#/audit");
  await page.locator("#audit-module").click();
  await page.getByRole("option", { name: "Préstamos", exact: true }).click();

  const row = page.locator("tbody tr", { hasText: "Préstamos" }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.locator("td").nth(2).click();
  await expect(page.getByText("Resumen", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Datos nuevos", { exact: true })).toBeVisible();
});

// CP-A17 (HU-17)
test("CP-A17 (HU-17): sesión con Recordarme persiste tras recarga, ruta 404 recupera al inicio y Cerrar sesión limpia almacenamiento", async ({
  page,
}) => {
  await loginAs(page, seededEmails.client, TEST_PASSWORD, { remember: true, resetStorage: true });
  const persistedSession = await page.evaluate(() => localStorage.getItem("auth.session"));
  expect(persistedSession).toBeTruthy();

  await page.reload();
  await expect(page).toHaveURL(/#\/home$/);

  await page.goto("/#/ruta-inexistente-uat-h17");
  await expect(page.getByText("Página no encontrada", { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("link", { name: /Ir al inicio/i }).click();
  await expect(page).toHaveURL(/#\/home$/);

  await logout(page);
  const storageCleared = await page.evaluate(() => ({
    ls: localStorage.getItem("auth.session"),
    ss: sessionStorage.getItem("auth.session"),
  }));
  expect(storageCleared.ls).toBeNull();
  expect(storageCleared.ss).toBeNull();
});

// CP-A18 (HU-18)
test("CP-A18 (HU-18): dashboard administrativo y vistas operativas mantienen legibilidad y sin desbordamiento móvil", async ({
  page,
}) => {
  await loginAdmin(page);
  await expect(page.getByText("Visión General del Capital", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Capital activo prestado", { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible({ timeout: 10000 });

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [pathRoute, readyText] of [
    ["/#/home", "Visión General del Capital"],
    ["/#/loans", "Préstamos"],
    ["/#/users", "Usuarios"],
    ["/#/profile", "Mi perfil"],
  ] as const) {
    await page.goto(pathRoute);
    await expect(page.getByText(readyText).first()).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});

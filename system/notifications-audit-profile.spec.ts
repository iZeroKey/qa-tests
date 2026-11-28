// Pruebas de sistema de notificaciones, bitácora de auditoría, perfil de usuario y avatar.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { ensureApiAlive } from "../support/api-health";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml";
import {
  authHeader,
  createTestLoan,
  loginAs as apiLoginAs,
  request,
  seededEmails,
  uniqueOperationId,
} from "../helpers/integration";
import { loginAdmin, loginAs, logout, openLoan, TEST_PASSWORD } from "../support/ui-flows";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_AVATAR = path.resolve(__dirname, "../fixtures/avatar-sample.png");

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

// CP-S35
test("CP-S35: notificaciones de evento real se consultan por pestañas, se marcan individualmente y en lote (RF-25, RF-26)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, {
    role: "client",
    firstName: "NotifUI",
    lastName: "Usuario",
  });
  // Generar 2 préstamos aprobados -> al menos 2 notificaciones LOAN_ACTIVE para este cliente
  const loan1 = await createTestLoan(adminToken, client.id, { name: "Notif Préstamo 1" }, tracker);
  const loan2 = await createTestLoan(adminToken, client.id, { name: "Notif Préstamo 2" }, tracker);
  await request.patch(`/api/v1/loans/${loan1.id}/approve`).set(authHeader(adminToken));
  await request.patch(`/api/v1/loans/${loan2.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await page.goto("/#/notifications");
  await expect(page.getByRole("heading", { name: "Notificaciones" })).toBeVisible({ timeout: 15000 });

  await page.getByRole("tab", { name: "Sin leer", exact: true }).click();
  const markSingleButtons = page.getByRole("button", { name: "Marcar como leída" });
  await expect(markSingleButtons.first()).toBeVisible({ timeout: 15000 });
  const initialUnreadCount = await markSingleButtons.count();
  expect(initialUnreadCount).toBeGreaterThanOrEqual(2);

  await markSingleButtons.first().click();
  await expect.poll(async () => await markSingleButtons.count(), { timeout: 10000 }).toBeLessThan(initialUnreadCount);

  const markAllBtn = page.getByRole("button", { name: /Marcar todas leídas/i });
  await expect(markAllBtn).toBeEnabled();
  await markAllBtn.click();

  await expect(page.getByText("Notificaciones al día", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("¡Estás al día!", { exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByRole("tab", { name: "Leídas", exact: true }).click();
  await expect(page.locator("article, [class*='card'], h2").filter({ hasText: /Préstamo/i }).first()).toBeVisible({
    timeout: 10000,
  });
});

// CP-S36
test("CP-S36: auditoría filtra por módulo, abre AuditDetailsSheet y abre detalle de usuario actor (RF-28, RNF-12, RNF-19)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, {
    role: "client",
    firstName: "AuditUI",
    lastName: "Cliente",
  });
  await createTestLoan(adminToken, client.id, { name: "Préstamo Auditado UI" }, tracker);

  await loginAdmin(page);
  await page.goto("/#/audit");
  await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible({ timeout: 15000 });

  await page.locator("#audit-module").click();
  await page.getByRole("option", { name: "Préstamos", exact: true }).click();

  const auditRow = page.locator("tbody tr", { hasText: "Préstamos" }).first();
  await expect(auditRow).toBeVisible({ timeout: 15000 });

  // Clic en columna Acción para abrir AuditDetailsSheet sin activar botón de usuario
  await auditRow.locator("td").nth(2).click();
  await expect(page.getByText("Contexto técnico", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Resumen", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Abrir UserDetailDrawer desde la columna Usuario
  const userCellBtn = auditRow.locator("td").nth(3).getByRole("button").first();
  await expect(userCellBtn).toBeVisible();
  await userCellBtn.click();
  await expect(page.getByText("Cuenta de acceso", { exact: true })).toBeVisible({ timeout: 10000 });
});

// CP-S37
test("CP-S37: usuario edita datos personales y bancarios en perfil y persisten tras recargar (RF-06, RF-29)", async ({
  page,
}) => {
  const user = await createTempUser(tracker, {
    role: "client",
    firstName: "PerfilUI",
    lastName: "Original",
  });

  await loginAs(page, user.email, user.password);
  await page.goto("/#/profile");
  await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /Editar perfil/i }).click();
  await expect(page.getByRole("heading", { name: "Editar Perfil" })).toBeVisible();

  await page.locator("#dni").fill("74859612");
  await page.locator("#address").fill("Jr. Comercio QA 450");
  await page.locator("#bank").fill("Interbank");

  await page.getByRole("button", { name: /Guardar Cambios/i }).click();
  await expect(page.getByText("Perfil actualizado", { exact: true })).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.getByText("74859612", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Jr. Comercio QA 450", { exact: true })).toBeVisible();
  await expect(page.getByText("Interbank", { exact: true })).toBeVisible();
});

// CP-S38
test("CP-S38: carga y recorte de avatar en ProfileEditDrawer debe persistir tras recarga sin URL blob efímera (RF-29)", async ({
  page,
}) => {
  const user = await createTempUser(tracker, {
    role: "client",
    firstName: "AvatarUI",
    lastName: "Persistente",
  });

  await loginAs(page, user.email, user.password);
  await page.goto("/#/profile");
  await page.getByRole("button", { name: /Editar perfil/i }).click();

  await page.locator("input[type='file']").setInputFiles(FIXTURE_AVATAR);
  await expect(page.getByRole("heading", { name: "Ajustar Foto de Perfil" })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Guardar foto/i }).click();
  await expect(page.getByRole("heading", { name: "Ajustar Foto de Perfil" })).toBeHidden({ timeout: 10000 });

  const avatarReqPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/users/me/avatar") && res.request().method() === "PATCH",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: /Guardar Cambios/i }).click();
  const avatarRes = await avatarReqPromise;
  expect(avatarRes.status()).toBe(200);
  await expect(page.getByText("Perfil actualizado", { exact: true })).toBeVisible({ timeout: 15000 });

  // Si ProfileEditDrawer guarda una URL blob: en estado/localStorage, al recargar la página la URL blob: falla o se mantiene inválida
  const persistedBeforeReload = await page.evaluate(() => localStorage.getItem("auth.user") || sessionStorage.getItem("auth.user") || "");
  expect(persistedBeforeReload).not.toContain("blob:");

  await page.reload();
  const avatarBtn = page.getByRole("button", { name: "Ver avatar en tamaño completo" });
  await expect(avatarBtn).toBeVisible({ timeout: 15000 });
  const imgSrc = await avatarBtn.locator("img").getAttribute("src");
  expect(imgSrc).toBeTruthy();
  expect(imgSrc).not.toMatch(/^blob:/);
});

// CP-S39
test("CP-S39: ChangePasswordDialog valida coincidencia y realiza cambio real de contraseña con reingreso (RF-04)", async ({
  page,
}) => {
  const user = await createTempUser(tracker, {
    role: "client",
    firstName: "ClaveUI",
    lastName: "Cambio",
  });

  await loginAs(page, user.email, TEST_PASSWORD);
  await page.goto("/#/profile");
  await page.getByRole("button", { name: /Cambiar contraseña/i }).click();
  await expect(page.getByRole("heading", { name: "Cambiar Contraseña" })).toBeVisible();

  await page.locator("#currentPassword").fill(TEST_PASSWORD);
  await page.locator("#newPassword").fill("NuevaClave2026!");
  await page.locator("#confirmPassword").fill("Diferente2026!");
  await page.getByRole("button", { name: /Guardar Contraseña/i }).click();
  await expect(page.getByText("Las contraseñas nuevas no coinciden.", { exact: true })).toBeVisible();

  await page.locator("#confirmPassword").fill("NuevaClave2026!");
  await page.getByRole("button", { name: /Guardar Contraseña/i }).click();
  await expect(page.getByText("Contraseña actualizada", { exact: true })).toBeVisible({ timeout: 15000 });

  await logout(page);
  await loginAs(page, user.email, "NuevaClave2026!");
  await expect(page).toHaveURL(/#\/home$/);
});

// CP-S40
test("CP-S40: panel del préstamo muestra banner funcional de vouchers pendientes para el inversionista", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "BannerCli", lastName: "QA" });
  const investor = await createTempUser(tracker, { role: "investor", firstName: "BannerInv", lastName: "QA" });
  const clientToken = await apiLoginAs(client.email, client.password);
  const invToken = await apiLoginAs(investor.email, investor.password);

  const loanName = `Préstamo Banner ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { investorId: investor.id, name: loanName }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(invToken));
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const vRes = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({
      loanId: loan.id,
      amount: "110",
      operationId: uniqueOperationId("BANNER"),
      operationDate: "2026-04-06T00:00:00.000Z",
    });
  expect(vRes.status).toBe(201);
  tracker.trackVoucher(vRes.body.data.id);

  await loginAs(page, investor.email, investor.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  // Defecto conocido en línea base (LoanDetailPanel.tsx:166-230, LoansPage.tsx:136): relatedData.vouchers llega vacío y omite el banner.
  await expect(page.getByText("Vouchers por revisar", { exact: true })).toBeVisible({ timeout: 10000 });
  const reviewBtn = page.getByRole("button", { name: "Revisar", exact: true });
  await expect(reviewBtn).toBeVisible();
  await reviewBtn.click();
});

// CP-S46
test("CP-S46: eliminación de foto de perfil desde ProfileEditDrawer ejecuta DELETE /users/me/avatar y persiste tras recarga (RF-29)", async ({
  page,
}) => {
  const user = await createTempUser(tracker, {
    role: "client",
    firstName: "DelAvatarUI",
    lastName: "Perfil",
  });
  const userToken = await apiLoginAs(user.email, user.password);
  const uploadRes = await request
    .patch("/api/v1/users/me/avatar")
    .set(authHeader(userToken))
    .attach("avatar", FIXTURE_AVATAR);
  expect(uploadRes.status).toBe(200);

  await loginAs(page, user.email, user.password);
  await page.goto("/#/profile");
  await expect(page.getByRole("button", { name: "Ver avatar en tamaño completo" })).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /Editar perfil/i }).click();
  await expect(page.getByRole("heading", { name: "Editar Perfil" })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar foto de perfil", exact: true }).click();

  const deleteReqPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/users/me/avatar") && res.request().method() === "DELETE",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: /Guardar Cambios/i }).click();
  const deleteRes = await deleteReqPromise;
  expect(deleteRes.status()).toBe(200);
  await expect(page.getByText("Perfil actualizado", { exact: true })).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Ver avatar en tamaño completo" })).toHaveCount(0);
});

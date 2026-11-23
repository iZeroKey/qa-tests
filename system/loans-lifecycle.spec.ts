// Pruebas de sistema del ciclo de vida de préstamos, aprobaciones, cronograma y filtros.
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
import {
  approveSelectedLoan,
  createLoanThroughUi,
  loginAdmin,
  loginAs,
  loginInvestor,
  logout,
  openLoan,
  rejectSelectedLoan,
} from "../support/ui-flows";

const tracker = new TestCleanupTracker();
let adminToken: string;
let invToken: string;
let seededClientId: string;
let seededInvestorId: string;

test.beforeAll(async () => {
  adminToken = await apiLoginAs(seededEmails.admin);
  invToken = await apiLoginAs(seededEmails.investor);
  const clientRes = await request.get(`/api/v1/users?search=${encodeURIComponent(seededEmails.client)}`).set(authHeader(adminToken));
  seededClientId = clientRes.body.data[0].id;
  const invRes = await request.get(`/api/v1/users?search=${encodeURIComponent(seededEmails.investor)}`).set(authHeader(adminToken));
  seededInvestorId = invRes.body.data[0].id;
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

// CP-S19
test("CP-S19: crea préstamo financiado por empresa con vista previa de cronograma y aprueba en 1 paso (RF-11, RF-12, RF-13)", async ({
  page,
}) => {
  const loanName = `Empresa UI ${Date.now()}`;
  await loginAdmin(page);

  const postLoanPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/loans") && res.request().method() === "POST",
    { timeout: 20000 },
  );
  await createLoanThroughUi(page, {
    loanName,
    clientSearch: "Cliente",
    principal: "1000",
    rate: "5",
    installments: "4",
    expandPreview: true,
    observation: "Financiado por ABC Inversiones",
  });
  const postRes = await postLoanPromise;
  expect(postRes.status()).toBe(201);
  const postJson = (await postRes.json()) as { data?: { loan?: { id?: string } } };
  tracker.trackLoan(postJson.data?.loan?.id);

  await openLoan(page, loanName);
  await expect(page.getByText("ABC Inversiones", { exact: true }).first()).toBeVisible();
  await approveSelectedLoan(page);
  await expect(page.getByText("Activo", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

// CP-S20
test("CP-S20: aprobación en 2 pasos por UI para préstamo con inversionista (RF-13, RF-14)", async ({ page }) => {
  const loanName = `DosPasos UI ${Date.now()}`;
  await loginAdmin(page);

  const postLoanPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/loans") && res.request().method() === "POST",
    { timeout: 20000 },
  );
  await createLoanThroughUi(page, {
    loanName,
    clientSearch: "Cliente",
    investorSearch: "Inversor Prueba",
    principal: "1200",
    rate: "5",
    installments: "4",
  });
  const postRes = await postLoanPromise;
  expect(postRes.status()).toBe(201);
  const postJson = (await postRes.json()) as { data?: { loan?: { id?: string } } };
  tracker.trackLoan(postJson.data?.loan?.id);

  await logout(page);
  await loginInvestor(page);
  await page.goto("/#/investments");
  await openLoan(page, loanName);
  await approveSelectedLoan(page);
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await approveSelectedLoan(page);
  await expect(page.getByText("Activo", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

// CP-S21
test("CP-S21: inversionista NO debe ver botones Aprobar/Rechazar cuando el préstamo ya pasó a pending_admin_review", async ({
  page,
}) => {
  const tempCli = await createTempUser(tracker, { role: "client", firstName: "PermInv", lastName: "Cli" });
  const tempInv = await createTempUser(tracker, { role: "investor", firstName: "PermInv", lastName: "Inv" });
  const tempInvToken = await apiLoginAs(tempInv.email, tempInv.password);

  const loanName = `PendingAdm UI ${Date.now()}`;
  const loan = await createTestLoan(adminToken, tempCli.id, { investorId: tempInv.id, name: loanName }, tracker);
  const invApproveRes = await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(tempInvToken));
  expect(invApproveRes.status).toBe(200);
  expect(invApproveRes.body.data.status).toBe("pending_admin_review");

  await loginAs(page, tempInv.email, tempInv.password);
  await page.goto("/#/investments");
  await openLoan(page, loanName);

  // Defecto conocido (loan-permissions.ts:53-67): canReviewLoan retorna true para inversionista en pending_admin_review.
  await expect(page.getByRole("button", { name: "Aprobar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar", exact: true })).toHaveCount(0);
});

// CP-S22
test("CP-S22: alterna vista Tarjetas/Tabla con persistencia y aplica filtros por estado en /#/loans", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/#/loans");
  await expect(page.getByRole("heading", { name: "Préstamos", level: 1 })).toBeVisible({ timeout: 15000 });

  await page.getByRole("tab", { name: /Tabla/i }).click();
  await expect(page.locator("table")).toBeVisible({ timeout: 10000 });

  await page.reload();
  await expect(page.locator("table")).toBeVisible({ timeout: 15000 });

  await page.getByRole("tab", { name: /Tarjetas/i }).click();
  await expect(page.locator("table")).toHaveCount(0);

  for (const label of ["Activos", "Pendientes", "Pagados", "Todos"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByText(/encontrados/)).toBeVisible({ timeout: 10000 });
  }
});

// CP-S23
test("CP-S23: buscador en /#/loans reinicia la paginación a página 1 cuando cambia el término de búsqueda", async ({
  page,
}) => {
  const tempCli = await createTempUser(tracker, { role: "client", firstName: "PagBusq", lastName: "Cli" });
  const prefix = `PagQA${Date.now().toString().slice(-4)}`;
  // 12 préstamos aseguran paginación de más de 1 página antes y después del filtro
  for (let idx = 0; idx < 12; idx += 1) {
    await createTestLoan(adminToken, tempCli.id, { name: `${prefix} ${idx + 1}` }, tracker);
  }

  await loginAs(page, tempCli.email, tempCli.password);
  await page.goto("/#/loans");
  const nav = page.getByRole("navigation", { name: "Paginación" });
  await expect(nav).toBeVisible({ timeout: 15000 });

  await nav.getByRole("button", { name: "2", exact: true }).click();
  await expect(nav.getByRole("button", { name: "2", exact: true })).toHaveAttribute("aria-current", "page");

  await page.getByPlaceholder("Código, cliente o monto").fill(prefix);
  await page.waitForTimeout(700);

  // Defecto conocido (LoansPage.tsx:556): onSearchQueryChange no reinicia la paginación a 1.
  await expect(nav.getByRole("button", { name: "1", exact: true })).toHaveAttribute("aria-current", "page", {
    timeout: 5000,
  });
});

// CP-S24
test("CP-S24: abre ScheduleDrawer y muestra todas las cuotas del cronograma completo (RF-15)", async ({ page }) => {
  const loanName = `Cronograma 12C ${Date.now()}`;
  const loan = await createTestLoan(
    adminToken,
    seededClientId,
    { name: loanName, installmentsCount: 12, principal: "1200" },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  await page.getByRole("button", { name: /Ver cronograma completo/i }).click();
  await expect(page.getByRole("heading", { name: "Cronograma completo" })).toBeVisible({ timeout: 10000 });
  const schedDialog = page.getByRole("dialog").last();
  const lastInstallmentDot = schedDialog.locator("span").filter({ hasText: /^12$/ }).last();
  await lastInstallmentDot.scrollIntoViewIfNeeded();
  await expect(lastInstallmentDot).toBeVisible({ timeout: 10000 });
});

// CP-S25
test("CP-S25: detalle del préstamo permite abrir ficha de Cliente e Inversionista asignado (UserDetailDrawer)", async ({
  page,
}) => {
  const loanName = `Partes UI ${Date.now()}`;
  await createTestLoan(adminToken, seededClientId, { investorId: seededInvestorId, name: loanName }, tracker);

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  await page.getByRole("button", { name: /Cliente.*Cliente Prueba/i }).first().click();
  await expect(page.getByText(seededEmails.client, { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Cerrar", exact: true }).last().click();

  await page.getByRole("button", { name: /Inversionista.*Inversor Prueba/i }).first().click();
  await expect(page.getByText(seededEmails.investor, { exact: true })).toBeVisible({ timeout: 10000 });
  expect(invToken).toBeTruthy();
});

// CP-S26
test("CP-S26: administrador rechaza un préstamo en revisión con observación y pasa a estado Rechazado (RF-13)", async ({
  page,
}) => {
  const loanName = `Rechazar UI ${Date.now()}`;
  await createTestLoan(adminToken, seededClientId, { name: loanName }, tracker);

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await rejectSelectedLoan(page, "Documentación de respaldo insuficiente");

  await expect(page.getByText("Rechazado", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

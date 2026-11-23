// Pruebas de aceptación (HU-01, HU-02, HU-03, HU-13): flujos de préstamos y portafolio.
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

// CP-A01 (HU-01)
test("CP-A01 (HU-01): administrador crea y aprueba un préstamo y el cliente lo visualiza activo con cuotas", async ({
  page,
}) => {
  const uniqueCliFirst = `UatH1${Date.now().toString().slice(-5)}`;
  const client = await createTempUser(tracker, { role: "client", firstName: uniqueCliFirst, lastName: "Cliente" });
  const loanName = `UAT H1 ${Date.now()}`;

  await loginAdmin(page);
  const postLoanPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/loans") && res.request().method() === "POST",
    { timeout: 20000 },
  );
  await createLoanThroughUi(page, {
    loanName,
    clientSearch: uniqueCliFirst,
    principal: "1000",
    rate: "5",
    installments: "4",
  });
  const postRes = await postLoanPromise;
  expect(postRes.status()).toBe(201);
  const postJson = (await postRes.json()) as { data?: { loan?: { id?: string } } };
  tracker.trackLoan(postJson.data?.loan?.id);

  await openLoan(page, loanName);
  await approveSelectedLoan(page);
  await expect(page.getByText("Activo", { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await expect(page.getByText("Activo", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cronograma", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Ver cronograma completo/i }).click();
  await expect(page.getByRole("heading", { name: "Cronograma completo" })).toBeVisible();
  const schedDialog = page.getByRole("dialog").last();
  await expect(schedDialog.locator("span").filter({ hasText: /^4$/ }).last()).toBeVisible();
});

// CP-A02 (HU-02)
test("CP-A02 (HU-02): cliente consulta su préstamo principal en el dashboard y su cronograma completo", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH2", lastName: "Cliente" });
  const loanName = `UAT H2 ${Date.now()}`;
  const loan = await createTestLoan(
    adminToken,
    client.id,
    { name: loanName, installmentsCount: 6, principal: "1200" },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await expect(page.getByText("Tu Préstamo Principal", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Saldo Restante", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: new RegExp(`Ver préstamo ${loan.publicCode}`, "i") }).click();
  await expect(page).toHaveURL(/#\/loans$/);
  await expect(page.getByRole("heading", { name: loanName })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /Ver cronograma completo/i }).click();
  await expect(page.getByRole("heading", { name: "Cronograma completo" })).toBeVisible();
  const schedDialog = page.getByRole("dialog").last();
  const lastInstallmentDot = schedDialog.locator("span").filter({ hasText: /^6$/ }).last();
  await lastInstallmentDot.scrollIntoViewIfNeeded();
  await expect(lastInstallmentDot).toBeVisible();
});

// CP-A03 (HU-03)
test("CP-A03 (HU-03): inversionista consulta su portafolio y el detalle de sus préstamos financiados", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH3", lastName: "Cliente" });
  const investor = await createTempUser(tracker, { role: "investor", firstName: "UatH3", lastName: "Inversor" });
  const invToken = await apiLoginAs(investor.email, investor.password);

  const loanName = `UAT H3 ${Date.now()}`;
  const loan = await createTestLoan(
    adminToken,
    client.id,
    { investorId: investor.id, name: loanName, principal: "2500" },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(invToken));
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, investor.email, investor.password);
  await expect(page.getByText("Capital Invertido", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Detalles del Portafolio", { exact: true })).toBeVisible();

  await page.goto("/#/investments");
  await openLoan(page, loanName);
  await expect(page.getByText(/2,500/).first()).toBeVisible();
});

// CP-A13 (HU-13)
test("CP-A13 (HU-13): préstamo con inversionista se aprueba en 2 pasos y préstamo pendiente puede rechazarse con observación", async ({
  page,
}) => {
  const uniqueCliFirst = `UatH13${Date.now().toString().slice(-5)}`;
  const client = await createTempUser(tracker, { role: "client", firstName: uniqueCliFirst, lastName: "Cli" });
  const twoStepName = `UAT H13 2P ${Date.now()}`;
  const rejLoanName = `UAT H13 Rej ${Date.now()}`;

  await loginAdmin(page);
  const postLoanPromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/loans") && res.request().method() === "POST",
    { timeout: 20000 },
  );
  await createLoanThroughUi(page, {
    loanName: twoStepName,
    clientSearch: uniqueCliFirst,
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
  await openLoan(page, twoStepName);
  await approveSelectedLoan(page);
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, twoStepName);
  await approveSelectedLoan(page);
  await expect(page.getByText("Activo", { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");

  const freshToken = await apiLoginAs(seededEmails.admin);
  await createTestLoan(freshToken, client.id, { name: rejLoanName }, tracker);
  await page.reload();
  await expect(page.getByPlaceholder("Código, cliente o monto")).toBeVisible({ timeout: 15000 });
  await openLoan(page, rejLoanName);
  await rejectSelectedLoan(page, "Capacidad de endeudamiento insuficiente");
  await expect(page.getByText("Rechazado", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

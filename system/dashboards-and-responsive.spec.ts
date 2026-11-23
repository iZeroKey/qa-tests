// Pruebas de sistema sobre dashboards por rol y adaptabilidad visual en móvil y escritorio.
import { execFileSync } from "node:child_process";
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
import { loginAdmin, loginAs } from "../support/ui-flows";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "../../abc_inversiones_api");
const tsxBin = path.join(apiDir, "node_modules", ".bin", "tsx.cmd");

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
});

test.afterEach(async ({}, testInfo) => {
  await ensureApiAlive(testInfo.title);
});

// CP-S41
test("CP-S41: AdminDashboard muestra KPIs/gráfico y AdminVouchersDrawer solo debe listar vouchers pendientes (RF-27)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "DashAdm", lastName: "S41" });
  const clientToken = await apiLoginAs(client.email, client.password);
  const loan = await createTestLoan(adminToken, client.id, { name: "Dash Admin Loan" }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const pendingVou = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({ loanId: loan.id, amount: "70", operationId: uniqueOperationId("DASHDRAW1"), operationDate: "2026-04-06T00:00:00.000Z" });
  tracker.trackVoucher(pendingVou.body.data.id);

  const approvedVou = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({ loanId: loan.id, amount: "80", operationId: uniqueOperationId("DASHDRAW2"), operationDate: "2026-04-06T00:00:00.000Z" });
  tracker.trackVoucher(approvedVou.body.data.id);
  await request
    .patch(`/api/v1/payment-vouchers/${approvedVou.body.data.id}/process`)
    .set(authHeader(adminToken))
    .send({ action: "approve" });

  await loginAdmin(page);
  await page.goto("/#/home");
  await expect(page.getByText("Visión General del Capital", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Capital activo prestado", { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible({ timeout: 10000 });

  const vouchersBtn = page.getByRole("button", { name: /Revisar Vouchers/i });
  await expect(vouchersBtn).toBeVisible({ timeout: 10000 });
  await vouchersBtn.click();
  await expect(page.getByRole("heading", { name: "Revisar Vouchers" })).toBeVisible();

  const drawerDialog = page.locator("[role='dialog']").last();
  await expect(drawerDialog.getByText(/En espera|Pendiente/).first()).toBeVisible({ timeout: 10000 });
  // Defecto conocido (AdminVouchersDrawer.tsx:59-80): lista vouchers aprobados/rechazados junto a los pendientes.
  await expect(drawerDialog.getByText("Aprobado", { exact: true })).toHaveCount(0);
});

// CP-S42
test("CP-S42: ClientDashboard muestra Tu Préstamo Principal, métricas reales y navega al préstamo (RF-27)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "DashCli", lastName: "S42" });
  const loan = await createTestLoan(adminToken, client.id, { name: `DashCliente ${Date.now()}` }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await page.goto("/#/home");
  await expect(page.getByText("Tu Préstamo Principal", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Saldo Restante", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: new RegExp(`Ver préstamo ${loan.publicCode}`, "i") }).click();
  await expect(page).toHaveURL(/#\/loans$/);
});

// CP-S43
test("CP-S43: InvestorDashboard muestra portafolio real y debe reflejar préstamos con cuotas vencidas en mora (RF-27)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "MoraCli", lastName: "S43" });
  const investor = await createTempUser(tracker, { role: "investor", firstName: "MoraInv", lastName: "S43" });
  const invToken = await apiLoginAs(investor.email, investor.password);

  const pastStart = new Date(Date.now() - 45 * 86400_000).toISOString();
  const loan = await createTestLoan(
    adminToken,
    client.id,
    { investorId: investor.id, startDate: pastStart, frequency: "monthly", installmentsCount: 2 },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(invToken));
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const cmd = process.platform === "win32" ? "cmd.exe" : tsxBin;
  const args = process.platform === "win32" ? ["/d", "/s", "/c", tsxBin, "src/scripts/check-overdue.ts"] : ["src/scripts/check-overdue.ts"];
  execFileSync(cmd, args, { cwd: apiDir, encoding: "utf8" });

  await loginAs(page, investor.email, investor.password);
  await page.goto("/#/home");
  await expect(page.getByText("Capital Invertido", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Detalles del Portafolio", { exact: true })).toBeVisible();

  // Defecto conocido (InvestorDashboard.tsx:180-182): contador "En mora" permanece fijo en 0.
  const moraRow = page.getByText("En mora", { exact: true }).locator("xpath=..");
  await expect(moraRow.locator("span").nth(1)).not.toHaveText("0", { timeout: 5000 });
});

// CP-S44
test("CP-S44: todas las vistas principales mantienen adaptabilidad móvil 390x844 tras carga de datos reales (RNF-09, RNF-10)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#email")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await loginAdmin(page);
  for (const [pathRoute, readyText] of [
    ["/#/home", "Visión General del Capital"],
    ["/#/loans", "Préstamos"],
    ["/#/users", "Usuarios"],
    ["/#/audit", "Auditoría"],
    ["/#/notifications", "Notificaciones"],
    ["/#/profile", "Mi perfil"],
  ] as const) {
    await page.goto(pathRoute);
    await expect(page.getByText(readyText).first()).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});

// CP-S45
test("CP-S45: drawers de creación (Nuevo préstamo y Nuevo usuario) no deben desbordar en desktop angosto 820x900 (RNF-10)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await loginAdmin(page);

  await page.goto("/#/loans");
  await page.getByRole("button", { name: /Nuevo préstamo/i }).click();
  const loanDrawer = page.getByRole("dialog").first();
  await expect(loanDrawer).toBeVisible();
  const loanBox = await loanDrawer.boundingBox();
  expect(loanBox).not.toBeNull();
  expect(loanBox!.width).toBeLessThanOrEqual(820);
  expect(loanBox!.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Escape");

  await page.goto("/#/users");
  await page.getByRole("button", { name: /Nuevo usuario/i }).click();
  const userDrawer = page.getByRole("dialog").first();
  await expect(userDrawer).toBeVisible();
  const userBox = await userDrawer.boundingBox();
  expect(userBox).not.toBeNull();
  expect(userBox!.width).toBeLessThanOrEqual(820);
  expect(userBox!.x).toBeGreaterThanOrEqual(0);
});

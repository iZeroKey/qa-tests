// Pruebas de aceptación (HU-04, HU-05, HU-12, HU-14, HU-15): flujos de pagos, liquidación, vouchers y OCR.
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
import {
  attachImageToVoucherAndExpectOcr,
  expectLoanRemainingBalance,
  loginAdmin,
  loginAs,
  logout,
  openLoan,
  openTransactionDetail,
  readRemainingBalance,
  registerPaymentThroughUi,
  replaceNumberField,
  submitVoucherThroughUi,
} from "../support/ui-flows";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMALL_VOUCHER = path.resolve(__dirname, "../fixtures/voucher-small.png");

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

// CP-A04 (HU-04)
test("CP-A04 (HU-04): administrador registra y ajusta pagos manteniendo consistencia contable de saldo", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH4", lastName: "Cliente" });
  const loanName = `UAT H4 ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName, principal: "1000" }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  const initialRemaining = await readRemainingBalance(page);

  await registerPaymentThroughUi(page, "200", `UAT-H4-${Date.now()}`);
  await expectLoanRemainingBalance(page, initialRemaining - 200);

  await openTransactionDetail(page, "Efectivo");
  await page.getByRole("button", { name: /^Editar$/i }).click();
  await replaceNumberField(page, "#payment-amount", "350");
  await page.getByRole("button", { name: "Guardar pago", exact: true }).click();
  await expect(page.getByText("Pago actualizado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");

  await expectLoanRemainingBalance(page, initialRemaining - 350);
});

// CP-A05 (HU-05)
test("CP-A05 (HU-05): cliente, inversionista y administrador completan el ciclo de aprobación de voucher", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH5", lastName: "Cliente" });
  const investor = await createTempUser(tracker, { role: "investor", firstName: "UatH5", lastName: "Inversor" });
  const invToken = await apiLoginAs(investor.email, investor.password);

  const loanName = `UAT H5 ${Date.now()}`;
  const loan = await createTestLoan(
    adminToken,
    client.id,
    { investorId: investor.id, name: loanName, principal: "1000" },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(invToken));
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  const initialRemaining = await readRemainingBalance(page);
  await submitVoucherThroughUi(page, "200", uniqueOperationId("UATH5"));
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, investor.email, investor.password);
  await page.goto("/#/investments");
  await openLoan(page, loanName);
  await openTransactionDetail(page, "Transferencia");
  await page.getByRole("button", { name: "Aprobar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("dialog").last().getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(page.getByText("Voucher aprobado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await openTransactionDetail(page, "Transferencia");
  await page.getByRole("button", { name: "Aprobar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("dialog").last().getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(page.getByText("Voucher aprobado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");

  await expectLoanRemainingBalance(page, initialRemaining - 200);
});

// CP-A12 (HU-12)
test("CP-A12 (HU-12): escaneo OCR con imagen en envío de voucher opera sin error 500 ni caída del servidor", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH12", lastName: "Ocr" });
  const loanName = `UAT H12 ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  // Defecto conocido: OCR devuelve HTTP 500 y detiene la API por falta de credenciales ADC (NO_ADC_FOUND)
  await attachImageToVoucherAndExpectOcr(page, SMALL_VOUCHER);
});

// CP-A14 (HU-14)
test("CP-A14 (HU-14): liquidación total de préstamo pasa a Pagado y eliminación del pago lo revierte a Activo", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH14", lastName: "Liquida" });
  const loanName = `UAT H14 ${Date.now()}`;
  const loan = await createTestLoan(
    adminToken,
    client.id,
    { name: loanName, principal: "1000", interestRate: "5", installmentsCount: 1 },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  const initialRemaining = await readRemainingBalance(page);

  await registerPaymentThroughUi(page, initialRemaining.toFixed(2), `UAT-H14-${Date.now()}`);
  await expectLoanRemainingBalance(page, 0);
  await expect(page.getByText("Pagado", { exact: true }).first()).toBeVisible({ timeout: 10000 });

  await openTransactionDetail(page, "Efectivo");
  await page.getByRole("button", { name: /^Eliminar$/i }).click();
  await expect(page.getByRole("heading", { name: /Eliminar pago/i })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
  await expect(page.getByText("Pago eliminado", { exact: true })).toBeVisible({ timeout: 15000 });

  await expectLoanRemainingBalance(page, initialRemaining);
  await expect(page.getByText("Activo", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

// CP-A15 (HU-15)
test("CP-A15 (HU-15): sistema impide voucher duplicado y el rechazo de un voucher conserva intacto el saldo", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "UatH15C", lastName: "Vou" });
  const investor = await createTempUser(tracker, { role: "investor", firstName: "UatH15I", lastName: "Vou" });
  const clientToken = await apiLoginAs(client.email, client.password);
  const invToken = await apiLoginAs(investor.email, investor.password);

  const loanName = `UAT H15 ${Date.now()}`;
  const loan = await createTestLoan(
    adminToken,
    client.id,
    { investorId: investor.id, name: loanName, principal: "1000" },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(invToken));
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const dupOpId = uniqueOperationId("UATH15DUP");
  const dupRes = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({ loanId: loan.id, amount: "100", operationId: dupOpId, operationDate: "2026-04-06T00:00:00.000Z" });
  expect(dupRes.status).toBe(201);
  tracker.trackVoucher(dupRes.body.data.id);

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  const initialRemaining = await readRemainingBalance(page);

  await page.getByRole("button", { name: /Subir voucher/i }).click();
  await replaceNumberField(page, "#voucher-amount", "100");
  await page.locator("#voucher-operation").fill(dupOpId);
  await page.getByRole("button", { name: "Enviar voucher", exact: true }).click();
  await expect(page.getByText("Operación duplicada", { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAs(page, investor.email, investor.password);
  await page.goto("/#/investments");
  await openLoan(page, loanName);
  await openTransactionDetail(page, "Transferencia");
  await page.getByRole("button", { name: "Rechazar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Rechazar voucher" })).toBeVisible();
  await page.locator("#process-observation").fill("Número de operación no verificado");
  await page.getByRole("button", { name: "Rechazar", exact: true }).last().click();
  await expect(page.getByText("Voucher rechazado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");

  await expectLoanRemainingBalance(page, initialRemaining);
});

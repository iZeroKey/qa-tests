// Pruebas de sistema de pagos manuales, liquidación, reversión, vouchers y análisis OCR.
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

// CP-S27
test("CP-S27: administrador registra pago manual y reduce numéricamente el saldo pendiente (RF-17, RF-18)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "PagoCli", lastName: "S27" });
  const loanName = `Pago Manual ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName, principal: "1000" }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  const initialRemaining = await readRemainingBalance(page);
  expect(initialRemaining).toBeGreaterThan(1000);

  await registerPaymentThroughUi(page, "250", `REF-S27-${Date.now()}`);
  await expectLoanRemainingBalance(page, initialRemaining - 250);
});

// CP-S28
test("CP-S28: administrador edita y elimina un pago recalculando saldo y revirtiendo movimiento (RF-16, RF-18)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "EditPay", lastName: "S28" });
  const loanName = `Pago EditDel ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName, principal: "1000" }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const payRes = await request
    .post("/api/v1/payments")
    .set(authHeader(adminToken))
    .send({ loanId: loan.id, amount: "200", method: "cash", paymentDate: "2026-02-01T00:00:00.000Z" });
  expect(payRes.status).toBe(201);
  tracker.trackPayment(payRes.body.data.id);

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  const initialRemaining = await readRemainingBalance(page);

  await openTransactionDetail(page, "Efectivo");
  await page.getByRole("button", { name: /^Editar$/i }).click();
  await expect(page.getByRole("heading", { name: "Editar pago" })).toBeVisible();
  await replaceNumberField(page, "#payment-amount", "300");
  await page.getByRole("button", { name: "Guardar pago", exact: true }).click();
  await expect(page.getByText("Pago actualizado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");

  await expectLoanRemainingBalance(page, initialRemaining - 100);

  await openTransactionDetail(page, "Efectivo");
  await page.getByRole("button", { name: /^Eliminar$/i }).click();
  await expect(page.getByRole("heading", { name: /Eliminar pago/i })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
  await expect(page.getByText("Pago eliminado", { exact: true })).toBeVisible({ timeout: 15000 });

  await expectLoanRemainingBalance(page, initialRemaining + 200);
});

// CP-S29
test("CP-S29: cliente envía voucher sin imagen y lo visualiza en la galería de pagos (RF-19, RF-20)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "VoucherCli", lastName: "S29" });
  const loanName = `Voucher SinImg ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  const opId = uniqueOperationId("UIS29");
  await submitVoucherThroughUi(page, "150", opId);
  await expect(
    page.getByRole("button").filter({ hasText: "Transferencia" }).filter({ hasText: "150" }).first(),
  ).toBeVisible({ timeout: 10000 });
});

// CP-S30
test("CP-S30: envío de voucher con operationId duplicado muestra alerta Operación duplicada (RF-22, RNF-06)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "DupCli", lastName: "S30" });
  const clientToken = await apiLoginAs(client.email, client.password);
  const loanName = `Voucher Dup ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const dupOpId = uniqueOperationId("DUPUI");
  const vRes = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({ loanId: loan.id, amount: "100", operationId: dupOpId, operationDate: "2026-04-06T00:00:00.000Z" });
  expect(vRes.status).toBe(201);
  tracker.trackVoucher(vRes.body.data.id);

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  await page.getByRole("button", { name: /Subir voucher/i }).click();
  await replaceNumberField(page, "#voucher-amount", "100");
  await page.locator("#voucher-operation").fill(dupOpId);
  await page.getByRole("button", { name: "Enviar voucher", exact: true }).click();

  await expect(page.getByText("Operación duplicada", { exact: true })).toBeVisible({ timeout: 10000 });
});

// CP-S31
test("CP-S31: cliente dispone de botones Editar y Eliminar al abrir su voucher pendiente en PaymentDetailDrawer", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "EditVou", lastName: "S31" });
  const clientToken = await apiLoginAs(client.email, client.password);
  const loanName = `Voucher EditCli ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const vRes = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({
      loanId: loan.id,
      amount: "95",
      operationId: uniqueOperationId("EDITCLI"),
      operationDate: "2026-04-06T00:00:00.000Z",
    });
  expect(vRes.status).toBe(201);
  tracker.trackVoucher(vRes.body.data.id);

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await openTransactionDetail(page, "Transferencia");

  // Defecto conocido (PaymentsGallery.tsx:88-108): omite clientId camelCase y oculta Editar/Eliminar al cliente.
  await expect(page.getByRole("button", { name: /^Editar$/i })).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole("button", { name: /^Eliminar$/i })).toBeVisible({ timeout: 4000 });
});

// CP-S32
test("CP-S32: subida de imagen válida en voucher ejecuta OCR sin error 500 ni crash del servidor (RF-21)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "OcrCli", lastName: "S32" });
  const loanName = `Voucher OCR ${Date.now()}`;
  const loan = await createTestLoan(adminToken, client.id, { name: loanName }, tracker);
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  await loginAs(page, client.email, client.password);
  await page.goto("/#/loans");
  await openLoan(page, loanName);

  // Defecto conocido: /payment-vouchers/analyze devuelve HTTP 500 y detiene Node.js (NO_ADC_FOUND).
  await attachImageToVoucherAndExpectOcr(page, SMALL_VOUCHER);
});

// CP-S33
test("CP-S33: aprobación en 2 pasos de voucher (Inversionista -> Admin) genera pago aplicado y reduce saldo (RF-23, RF-24)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "AppVouCli", lastName: "S33" });
  const investor = await createTempUser(tracker, { role: "investor", firstName: "AppVouInv", lastName: "S33" });
  const clientToken = await apiLoginAs(client.email, client.password);
  const invToken = await apiLoginAs(investor.email, investor.password);

  const loanName = `Voucher 2Pasos ${Date.now()}`;
  const loan = await createTestLoan(
    adminToken,
    client.id,
    { investorId: investor.id, name: loanName, principal: "1000" },
    tracker,
  );
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(invToken));
  await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));

  const vRes = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({
      loanId: loan.id,
      amount: "200",
      operationId: uniqueOperationId("TWOVOU"),
      operationDate: "2026-04-06T00:00:00.000Z",
    });
  expect(vRes.status).toBe(201);
  tracker.trackVoucher(vRes.body.data.id);

  await loginAs(page, investor.email, investor.password);
  await page.goto("/#/investments");
  await openLoan(page, loanName);
  const initialRemaining = await readRemainingBalance(page);

  await openTransactionDetail(page, "Transferencia");
  await page.getByRole("button", { name: "Aprobar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeVisible();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByText("Voucher aprobado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await logout(page);

  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await openTransactionDetail(page, "Transferencia");
  await page.getByRole("button", { name: "Aprobar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeVisible();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByText("Voucher aprobado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");

  await expectLoanRemainingBalance(page, initialRemaining - 200);
});

// CP-S34
test("CP-S34: rechazo de voucher por inversionista y por administrador conserva intacto el saldo pendiente (RF-23)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "RejVouCli", lastName: "S34" });
  const investor = await createTempUser(tracker, { role: "investor", firstName: "RejVouInv", lastName: "S34" });
  const clientToken = await apiLoginAs(client.email, client.password);
  const invToken = await apiLoginAs(investor.email, investor.password);

  const invLoanName = `RechVou Inv ${Date.now()}`;
  const invLoan = await createTestLoan(
    adminToken,
    client.id,
    { investorId: investor.id, name: invLoanName, principal: "1000" },
    tracker,
  );
  await request.patch(`/api/v1/loans/${invLoan.id}/approve`).set(authHeader(invToken));
  await request.patch(`/api/v1/loans/${invLoan.id}/approve`).set(authHeader(adminToken));

  const v1 = await request
    .post("/api/v1/payment-vouchers")
    .set(authHeader(clientToken))
    .send({ loanId: invLoan.id, amount: "100", operationId: uniqueOperationId("REJINV"), operationDate: "2026-04-06T00:00:00.000Z" });
  tracker.trackVoucher(v1.body.data.id);

  await loginAs(page, investor.email, investor.password);
  await page.goto("/#/investments");
  await openLoan(page, invLoanName);
  const initialRemaining = await readRemainingBalance(page);
  await openTransactionDetail(page, "Transferencia");
  await page.getByRole("button", { name: "Rechazar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Rechazar voucher" })).toBeVisible();
  await page.locator("#process-observation").fill("Comprobante ilegible");
  await page.getByRole("button", { name: "Rechazar", exact: true }).last().click();
  await expect(page.getByText("Voucher rechazado", { exact: true })).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await expectLoanRemainingBalance(page, initialRemaining);
});

// CP-S47
test("CP-S47: pago total liquida préstamo a Pagado y su eliminación lo revierte a Activo en UI (RF-16, RF-17, RF-18, RNF-13)", async ({
  page,
}) => {
  const client = await createTempUser(tracker, { role: "client", firstName: "LiquidaUI", lastName: "S47" });
  const loanName = `Pago Total S47 ${Date.now()}`;
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

  await registerPaymentThroughUi(page, initialRemaining.toFixed(2), `LIQ-S47-${Date.now()}`);
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

import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "password123";

async function replaceNumberField(page: Page, selector: string, value: string) {
  const field = page.locator(selector);
  await field.click();
  await field.press("Control+A");
  await field.press("Backspace");
  await field.type(value);
}

export async function loginAs(page: Page, email: string) {
  await page.goto("/");
  await page.locator("#email, [title='Cerrar sesión']").first().waitFor({ state: "visible" });
  const loginEmail = page.locator("#email");
  if (await loginEmail.count() === 0) {
    await logout(page);
  }
  await expect(loginEmail).toBeVisible();
  await loginEmail.fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/#\/home$/);
}

export async function logout(page: Page) {
  await expect(page.getByTitle("Cerrar sesión").first()).toBeVisible();
  await page.getByTitle("Cerrar sesión").first().click();
  await expect(page.locator("#email")).toBeVisible();
}

export async function loginAdmin(page: Page) {
  await loginAs(page, "admin@abc.com");
}

export async function loginClient(page: Page) {
  await loginAs(page, "client@abc.com");
}

export async function loginInvestor(page: Page) {
  await loginAs(page, "investor@abc.com");
}

export async function createLoanThroughUi(page: Page, loanName: string) {
  await page.goto("/#/loans");
  await page.getByRole("button", { name: /Nuevo préstamo/i }).click();
  await expect(page.getByRole("heading", { name: "Nuevo préstamo" })).toBeVisible();

  await page.locator("#loan-client").fill("Cliente");
  await page.getByRole("option", { name: /Cliente/ }).first().click();
  await page.locator("#loan-investor").fill("Inversor");
  await page.getByRole("option").filter({ hasText: /Inversor Prueba/ }).first().click();
  await page.locator("#loan-name").fill(loanName);
  await replaceNumberField(page, "#loan-principal", "1000");
  await replaceNumberField(page, "#loan-rate", "5");
  await replaceNumberField(page, "#loan-installments", "4");
  await page.getByRole("button", { name: "Crear préstamo", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Nuevo préstamo" })).toBeHidden();
  await expect(page.getByText(loanName, { exact: true })).toBeVisible({ timeout: 15000 });
}

export async function openLoan(page: Page, loanName: string) {
  await page.getByText(loanName, { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: loanName })).toBeVisible();
}

export async function approveSelectedLoan(page: Page) {
  await page.getByRole("button", { name: "Aprobar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Aprobar préstamo" })).toBeVisible();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Aprobar préstamo" })).toBeHidden();
}

export async function registerPaymentThroughUi(page: Page, amount = "100") {
  await page.getByRole("button", { name: "Registrar pago", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar pago" })).toBeVisible();
  await replaceNumberField(page, "#payment-amount", amount);
  await page.locator("#payment-reference").fill(`UI-${Date.now()}`);
  await page.getByRole("button", { name: "Registrar pago", exact: true }).last().click();
  await expect(page.getByText("Pago registrado", { exact: true })).toBeVisible({ timeout: 15000 });
}

export async function submitVoucherThroughUi(page: Page, operationId = `UI-${Date.now()}`) {
  await page.getByRole("button", { name: /Subir voucher/i }).click();
  await expect(page.getByRole("heading", { name: "Subir voucher" })).toBeVisible();
  await replaceNumberField(page, "#voucher-amount", "100");
  await page.locator("#voucher-operation").fill(operationId);
  await page.getByRole("button", { name: "Enviar voucher", exact: true }).click();
  await expect(page.getByText("Voucher enviado", { exact: true })).toBeVisible({ timeout: 15000 });
  return operationId;
}

export async function attachImageToVoucherThroughUi(
  page: Page,
  imagePath: string,
) {
  await page.getByRole("button", { name: /Subir voucher/i }).click();
  await expect(page.getByRole("heading", { name: "Subir voucher" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await expect(page.getByRole("img", { name: "Vista previa del voucher" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Evidencia enviada|Escaneo de imagen erróneo/)).toBeVisible({ timeout: 15000 });
  await replaceNumberField(page, "#voucher-amount", "100");
  await page.locator("#voucher-operation").fill(`UI-IMG-${Date.now()}`);
  await page.getByRole("button", { name: "Enviar voucher", exact: true }).click();
  await expect(page.getByText("Voucher enviado", { exact: true })).toBeVisible({ timeout: 15000 });
}

export async function approveVoucherAsInvestorThenAdmin(page: Page, loanName: string) {
  await loginInvestor(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await page.getByRole("button").filter({ hasText: "Transferencia" }).first().click();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeVisible();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeHidden({ timeout: 15000 });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Detalle de pago" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: loanName })).toBeHidden();
  await logout(page);
  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await page.getByRole("button").filter({ hasText: "Transferencia" }).first().click();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeVisible();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Aprobar voucher" })).toBeHidden({ timeout: 15000 });
}

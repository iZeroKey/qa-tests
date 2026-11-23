// Flujos reutilizables de Playwright para autenticación, préstamos, pagos, vouchers y lectura de saldos.
import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "password123";

export const UI_EMAILS = {
  admin: "admin@abc.com",
  client: "client@abc.com",
  investor: "investor@abc.com",
} as const;

export async function replaceNumberField(page: Page, selector: string, value: string) {
  // Selecciona y sobreescribe el valor porque los inputs numéricos controlados ignoran .fill()
  const field = page.locator(selector);
  await field.click();
  await field.press("Control+A");
  await field.press("Backspace");
  await field.type(value);
}

export async function clearBrowserSession(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function logout(page: Page) {
  const logoutBtn = page.getByTitle("Cerrar sesión").first();
  await expect(logoutBtn).toBeVisible({ timeout: 10000 });
  await logoutBtn.click();
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.locator("#email")).toBeVisible({ timeout: 10000 });
}

export async function loginAs(
  page: Page,
  email: string,
  password = TEST_PASSWORD,
  options: { remember?: boolean; resetStorage?: boolean } = {},
) {
  await page.goto("/");
  if (options.resetStorage) {
    await clearBrowserSession(page);
    await page.reload();
  }
  await page.locator("#email, [title='Cerrar sesión']").first().waitFor({ state: "visible", timeout: 15000 });
  if (await page.locator("#email").count() === 0) {
    await logout(page);
  }
  await expect(page.locator("#email")).toBeVisible({ timeout: 10000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  if (options.remember) {
    // Hace clic en la etiqueta visible porque el input del switch Base UI está fuera del viewport
    await page.getByText("Recordarme", { exact: true }).click();
  }
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/#\/home$/, { timeout: 20000 });
}

export async function loginAdmin(page: Page) {
  await loginAs(page, UI_EMAILS.admin);
}

export async function loginClient(page: Page) {
  await loginAs(page, UI_EMAILS.client);
}

export async function loginInvestor(page: Page) {
  await loginAs(page, UI_EMAILS.investor);
}

export async function createLoanThroughUi(
  page: Page,
  opts: {
    loanName: string;
    clientSearch?: string;
    investorSearch?: string;
    principal?: string;
    rate?: string;
    installments?: string;
    observation?: string;
    expandPreview?: boolean;
  },
) {
  await page.goto("/#/loans");
  await page.getByRole("button", { name: /Nuevo préstamo/i }).click();
  await expect(page.getByRole("heading", { name: "Nuevo préstamo" })).toBeVisible();

  await page.locator("#loan-client").fill(opts.clientSearch ?? "Cliente");
  await page.getByRole("option", { name: new RegExp(opts.clientSearch ?? "Cliente", "i") }).first().click();

  if (opts.investorSearch) {
    await page.locator("#loan-investor").fill(opts.investorSearch);
    await page.getByRole("option", { name: new RegExp(opts.investorSearch, "i") }).first().click();
  }

  await page.locator("#loan-name").fill(opts.loanName);
  await replaceNumberField(page, "#loan-principal", opts.principal ?? "1000");
  await replaceNumberField(page, "#loan-rate", opts.rate ?? "5");
  await replaceNumberField(page, "#loan-installments", opts.installments ?? "4");

  if (opts.expandPreview) {
    const toggleBtn = page.getByRole("button", { name: /^Mostrar$/i });
    await toggleBtn.click();
    await expect(page.getByRole("button", { name: /^Ocultar$/i })).toBeVisible();
  }

  if (opts.observation) {
    await page.locator("#loan-observation").fill(opts.observation);
  }

  await page.getByRole("button", { name: "Crear préstamo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nuevo préstamo" })).toBeHidden({ timeout: 15000 });
  await expect(page.getByText(opts.loanName, { exact: true }).first()).toBeVisible({ timeout: 15000 });
}

export async function openLoan(page: Page, loanName: string) {
  const searchInput = page.getByPlaceholder("Código, cliente o monto");
  if (await searchInput.isVisible()) {
    await searchInput.fill(loanName);
  }
  const target = page.getByText(loanName, { exact: true }).first();
  await expect(target).toBeVisible({ timeout: 15000 });
  await target.click();
  await expect(page.getByRole("heading", { name: loanName })).toBeVisible({ timeout: 15000 });
}

export async function approveSelectedLoan(page: Page) {
  await page.getByRole("button", { name: "Aprobar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Aprobar préstamo" })).toBeVisible();
  await page.getByRole("button", { name: "Aprobar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Aprobar préstamo" })).toBeHidden({ timeout: 15000 });
}

export async function rejectSelectedLoan(page: Page, observation = "Rechazado por evaluación QA") {
  await page.getByRole("button", { name: "Rechazar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Rechazar préstamo" })).toBeVisible();
  await page.locator("#reject-observation").fill(observation);
  await page.getByRole("button", { name: "Rechazar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Rechazar préstamo" })).toBeHidden({ timeout: 15000 });
}

export async function registerPaymentThroughUi(
  page: Page,
  amount = "100",
  reference = `UI-${Date.now()}`,
  observation?: string,
) {
  await page.getByRole("button", { name: "Registrar pago", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrar pago" })).toBeVisible();
  await replaceNumberField(page, "#payment-amount", amount);
  await page.locator("#payment-reference").fill(reference);
  if (observation) {
    await page.locator("#payment-observation").fill(observation);
  }
  await page.getByRole("button", { name: "Registrar pago", exact: true }).last().click();
  await expect(page.getByText("Pago registrado", { exact: true })).toBeVisible({ timeout: 15000 });
}

export async function submitVoucherThroughUi(
  page: Page,
  amount = "100",
  operationId = `UI-${Date.now()}`,
) {
  await page.getByRole("button", { name: /Subir voucher/i }).click();
  await expect(page.getByRole("heading", { name: "Subir voucher" })).toBeVisible();
  await replaceNumberField(page, "#voucher-amount", amount);
  await page.locator("#voucher-operation").fill(operationId);
  await page.getByRole("button", { name: "Enviar voucher", exact: true }).click();
  await expect(page.getByText("Voucher enviado", { exact: true })).toBeVisible({ timeout: 15000 });
  return operationId;
}

export async function attachImageToVoucherAndExpectOcr(page: Page, imagePath: string) {
  await page.getByRole("button", { name: /Subir voucher/i }).click();
  await expect(page.getByRole("heading", { name: "Subir voucher" })).toBeVisible();
  const analyzePromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/payment-vouchers/analyze") && res.request().method() === "POST",
    { timeout: 25000 },
  );
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await expect(page.getByRole("img", { name: "Vista previa del voucher" })).toBeVisible({ timeout: 15000 });
  const analyzeResponse = await analyzePromise;
  expect(analyzeResponse.status()).toBe(200);
  await expect(page.getByText("Imagen escaneada con éxito")).toBeVisible({ timeout: 15000 });
  await replaceNumberField(page, "#voucher-amount", "100");
  await page.locator("#voucher-operation").fill(`UIIMG${Date.now()}`);
  await page.getByRole("button", { name: "Enviar voucher", exact: true }).click();
  await expect(page.getByText("Voucher enviado", { exact: true })).toBeVisible({ timeout: 15000 });
}

export async function openTransactionDetail(page: Page, matcher: string | RegExp = /Transferencia|Efectivo/) {
  const card = page.getByRole("button").filter({ hasText: matcher }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  await expect(page.getByRole("heading", { name: "Detalle de pago" })).toBeVisible({ timeout: 10000 });
}

export async function readRemainingBalance(page: Page): Promise<number> {
  const label = page.getByText("Saldo total pendiente", { exact: true });
  await expect(label).toBeVisible({ timeout: 10000 });
  // El monto numérico se renderiza en el segundo párrafo dentro del contenedor padre de la etiqueta
  const balanceContainer = label.locator("xpath=ancestor::div[2]");
  const text = await balanceContainer.locator("p").nth(1).innerText();
  const normalized = text.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  return Number.parseFloat(normalized);
}

export async function expectLoanRemainingBalance(page: Page, expectedAmount: number) {
  await expect
    .poll(async () => await readRemainingBalance(page), { timeout: 10000 })
    .toBeCloseTo(expectedAmount, 1);
}

export function attachPageErrorTracker(page: Page) {
  const pageErrors: string[] = [];
  const http5xx: string[] = [];
  const http403: string[] = [];

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) {
      http5xx.push(`${res.status()} ${res.url()}`);
    } else if (res.status() === 403) {
      http403.push(`${res.status()} ${res.url()}`);
    }
  });

  return { pageErrors, http5xx, http403 };
}

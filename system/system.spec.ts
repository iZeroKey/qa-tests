import { test, expect } from "@playwright/test";
import {
  approveSelectedLoan,
  approveVoucherAsInvestorThenAdmin,
  createLoanThroughUi,
  loginAdmin,
  loginClient,
  loginInvestor,
  openLoan,
  registerPaymentThroughUi,
  submitVoucherThroughUi,
  attachImageToVoucherThroughUi,
} from "../support/ui-flows";

test.describe.configure({ mode: "serial" });

const loanName = `Préstamo sistema ${Date.now()}`;

// CP-S01
test("CP-S01: administrador completa el ciclo de un préstamo", async ({ page }) => {
  await loginAdmin(page);
  await createLoanThroughUi(page, loanName);
  await openLoan(page, loanName);
  await approveSelectedLoan(page);
  await expect(page.getByText(/Activo/i).first()).toBeVisible();
  await registerPaymentThroughUi(page);
  await expect(page.getByText(/Pagado|Saldo/i).first()).toBeVisible();
});

// CP-S02
test("CP-S02: cliente consulta su préstamo y envía un voucher", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await submitVoucherThroughUi(page);
});

// CP-S03
test("CP-S03: inversionista y administrador aprueban el voucher en orden", async ({ page }) => {
  await approveVoucherAsInvestorThenAdmin(page, loanName);
  await expect(page.getByText("Administración")).toBeVisible();
  await expect(page).toHaveURL(/#\/loans$/);
});

// CP-S04
test("CP-S04: cada rol visualiza su módulo permitido", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/loans");
  await expect(page.getByRole("button", { name: /Nuevo préstamo/i })).toHaveCount(0);

  await loginInvestor(page);
  await expect(page.getByText("Capital Invertido")).toBeVisible();
  await page.goto("/#/users");
  await expect(page.getByText("Usuarios")).toHaveCount(0);
});

// CP-S05
test("CP-S05: la aplicación se adapta al viewport móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#email")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// CP-S06
test("CP-S06: el cliente puede enviar un voucher con imagen aunque el OCR falle", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await attachImageToVoucherThroughUi(page, "fixtures/voucher-sample.jpg");
});

// CP-S07
test("CP-S07: credenciales inválidas mantienen al usuario en login", async ({ page }) => {
  await page.goto("/");
  await page.locator("#email").fill("admin@abc.com");
  await page.locator("#password").fill("clave-invalida");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByText(/credenciales|Error del servidor/i).first()).toBeVisible();
});

// CP-S08
test("CP-S08: formulario de login vacío no inicia sesión", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.locator("#email")).toBeVisible();
});

// CP-S09
test("CP-S09: usuario autenticado puede cerrar sesión", async ({ page }) => {
  await loginAdmin(page);
  await page.getByTitle("Cerrar sesión").first().click();
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.locator("#email")).toBeVisible();
});

// CP-S10
test("CP-S10: administrador navega por sus módulos principales", async ({ page }) => {
  await loginAdmin(page);
  for (const [path, heading] of [
    ["/#/loans", "Préstamos"],
    ["/#/users", "Usuarios"],
    ["/#/audit", "Auditoría"],
    ["/#/notifications", "Notificaciones"],
    ["/#/profile", "Perfil"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
  }
});

// CP-S11
test("CP-S11: administrador consulta reportes financieros", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/#/home");
  await expect(page.getByText("Administrador", { exact: true })).toBeVisible();
  await expect(page.getByText(/Capital|Cartera|Vouchers|Cobrado/i).first()).toBeVisible();
});

// CP-S12
test("CP-S12: usuario consulta y marca sus notificaciones", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/notifications");
  await expect(page.getByText("Notificaciones", { exact: true })).toBeVisible();
  const markAll = page.getByRole("button", { name: /Marcar todas|Leer todas/i });
  if (await markAll.count()) {
    await markAll.click();
    await expect(markAll).toBeVisible();
  }
});

// CP-S13
test("CP-S13: acceso directo a usuarios permanece restringido para el inversionista", async ({ page }) => {
  await loginInvestor(page);
  await page.goto("/#/users");
  await expect(page.getByText("Usuarios", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Acceso restringido")).toBeVisible();
});

// CP-S14
test("CP-S14: módulos principales no generan desbordamiento en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAdmin(page);
  for (const path of ["/#/home", "/#/loans", "/#/users", "/#/audit"]) {
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

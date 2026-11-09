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

const loanName = `Préstamo aceptación ${Date.now()}`;

// CP-A01
test("CP-A01: el administrador crea y aprueba un préstamo", async ({ page }) => {
  await loginAdmin(page);
  await createLoanThroughUi(page, loanName);
  await openLoan(page, loanName);
  await approveSelectedLoan(page);
  await expect(page.getByText(/Activo/i).first()).toBeVisible();
});

// CP-A02
test("CP-A02: el cliente consulta su préstamo y sus cuotas", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await expect(page.getByText(/Cuotas|Cronograma/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: loanName })).toBeVisible();
});

// CP-A03
test("CP-A03: el inversionista consulta su portafolio", async ({ page }) => {
  await loginInvestor(page);
  await expect(page.getByText("Capital Invertido")).toBeVisible();
  await expect(page.getByText(/Detalles del Portafolio|Portafolio/i).first()).toBeVisible();
});

// CP-A04
test("CP-A04: el administrador registra un pago y el sistema actualiza el préstamo", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await registerPaymentThroughUi(page, "125");
  await expect(page.getByText(/Pagado|Saldo/i).first()).toBeVisible();
});

// CP-A05
test("CP-A05: el cliente envía un comprobante para revisión", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await submitVoucherThroughUi(page);
});

// CP-A06
test("CP-A06: el administrador revisa y aprueba el comprobante", async ({ page }) => {
  await approveVoucherAsInvestorThenAdmin(page, loanName);
  await expect(page).toHaveURL(/#\/loans$/);
});

// CP-A07
test("CP-A07: el cliente puede enviar un comprobante con imagen", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/loans");
  await openLoan(page, loanName);
  await attachImageToVoucherThroughUi(page, "fixtures/voucher-sample.jpg");
});

// CP-A08
test("CP-A08: el administrador puede consultar la información operativa", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/#/users");
  await expect(page.getByText("Usuarios", { exact: true })).toBeVisible();
  await page.goto("/#/audit");
  await expect(page.getByText("Auditoría", { exact: true })).toBeVisible();
});

// CP-A09
test("CP-A09: el cliente observa información financiera de su préstamo", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/home");
  await expect(page.getByText("Tu Préstamo Principal")).toBeVisible();
  await expect(page.getByText(/Cuotas|Saldo|Préstamos/i).first()).toBeVisible();
});

// CP-A10
test("CP-A10: los reportes se muestran según el rol", async ({ page }) => {
  await loginInvestor(page);
  await expect(page.getByText("Capital Invertido")).toBeVisible();
  await page.goto("/#/investments");
  await expect(page.getByText(/Inversiones|Portafolio|Capital invertido/i).first()).toBeVisible();
});

// CP-A11
test("CP-A11: las notificaciones de negocio están disponibles para el usuario", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/notifications");
  await expect(page.getByText("Notificaciones", { exact: true })).toBeVisible();
});

// CP-A12
test("CP-A12: los permisos protegen la información de otros roles", async ({ page }) => {
  await loginClient(page);
  await page.goto("/#/users");
  await expect(page.getByText("Usuarios", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Acceso restringido")).toBeVisible();
});

// CP-A13
test("CP-A13: el administrador puede mantener su perfil operativo", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/#/profile");
  await expect(page.getByText("Perfil", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Editar perfil/i })).toBeVisible();
});

// CP-A14
test("CP-A14: la información de aceptación se presenta sin errores técnicos", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/#/home");
  await expect(page.getByText(/Administración|Visión General del Capital/i).first()).toBeVisible();
  await expect(page.getByText(/Error 5\d\d|Failed to fetch/i)).toHaveCount(0);
});

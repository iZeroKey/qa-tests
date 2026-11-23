// Pruebas de integración de scripts programados (check-overdue y send-reminders) sobre BD real.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml.js";
import { authHeader, createTestLoan, loginAs, request, seededEmails } from "../helpers/integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "../../abc_inversiones_api");
const tsxBin = path.join(apiDir, "node_modules", ".bin", "tsx.cmd");

function runApiScript(scriptRelPath: string) {
  const cmd = process.platform === "win32" ? "cmd.exe" : tsxBin;
  const args = process.platform === "win32" ? ["/d", "/s", "/c", tsxBin, scriptRelPath] : [scriptRelPath];
  return execFileSync(cmd, args, { cwd: apiDir, encoding: "utf8" });
}

const tracker = new TestCleanupTracker();
let adminToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("jobs programados (check-overdue y send-reminders)", () => {
  // CP-I16
  it("check-overdue marca cuotas vencidas como overdue y envía notificación INSTALLMENT_OVERDUE", async () => {
    const tempClient = await createTempUser(tracker, { role: "client", firstName: "Job", lastName: "Overdue" });
    const clientToken = await loginAs(tempClient.email, tempClient.password);

    const pastStart = new Date(Date.now() - 45 * 86400_000).toISOString();
    const loan = await createTestLoan(
      adminToken,
      tempClient.id,
      { startDate: pastStart, frequency: "monthly", installmentsCount: 2 },
      tracker,
    );
    expect((await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken))).status).toBe(200);

    const out = runApiScript("src/scripts/check-overdue.ts");
    expect(out).toContain("Proceso completado");

    const insts = await request.get(`/api/v1/loans/${loan.id}/installments`).set(authHeader(adminToken));
    expect(insts.status).toBe(200);
    expect(insts.body.data[0].status).toBe("overdue");

    const notifs = await request.get("/api/v1/notifications").set(authHeader(clientToken));
    expect(
      notifs.body.data.some((n: { type: string; data?: string }) => n.type === "INSTALLMENT_OVERDUE" && n.data?.includes(loan.id)),
    ).toBe(true);
  });

  // CP-I17
  it("send-reminders envía notificación INSTALLMENT_REMINDER para cuotas próximas a vencer", async () => {
    const tempClient = await createTempUser(tracker, { role: "client", firstName: "Job", lastName: "Reminder" });
    const clientToken = await loginAs(tempClient.email, tempClient.password);

    // Frecuencia daily programa cuota #1 para startDate + 2 días (dentro de la ventana DAYS_BEFORE=3)
    const todayStart = new Date().toISOString();
    const loan = await createTestLoan(
      adminToken,
      tempClient.id,
      { startDate: todayStart, frequency: "daily", installmentsCount: 2 },
      tracker,
    );
    expect((await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken))).status).toBe(200);

    const out = runApiScript("src/scripts/send-reminders.ts");
    expect(out).toContain("recordatorio(s) enviado(s)");

    const notifs = await request.get("/api/v1/notifications").set(authHeader(clientToken));
    expect(
      notifs.body.data.some((n: { type: string; data?: string }) => n.type === "INSTALLMENT_REMINDER" && n.data?.includes(loan.id)),
    ).toBe(true);
  });
});

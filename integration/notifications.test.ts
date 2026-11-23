// Pruebas de integración de emisión automática y marcado de lectura en /notifications.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml.js";
import {
  authHeader,
  createTestLoan,
  loginAs,
  request,
  seededEmails,
  uniqueOperationId,
} from "../helpers/integration.js";

const tracker = new TestCleanupTracker();
let adminToken: string;
let tempClient: Awaited<ReturnType<typeof createTempUser>>;
let tempInvestor: Awaited<ReturnType<typeof createTempUser>>;
let tempClientToken: string;
let tempInvestorToken: string;
let loanId: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  tempClient = await createTempUser(tracker, { role: "client", firstName: "Notif", lastName: "Cliente" });
  tempInvestor = await createTempUser(tracker, { role: "investor", firstName: "Notif", lastName: "Inversor" });
  tempClientToken = await loginAs(tempClient.email, tempClient.password);
  tempInvestorToken = await loginAs(tempInvestor.email, tempInvestor.password);

  loanId = (
    await createTestLoan(adminToken, tempClient.id, { investorId: tempInvestor.id, name: "Notif Loan QA" }, tracker)
  ).id;
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("notificaciones", () => {
  // CP-I29
  it("genera notificaciones de ciclo de préstamo (LOAN_SUBMITTED, LOAN_INVESTOR_APPROVED, LOAN_ACTIVE)", async () => {
    const afterCreate = await request
      .get("/api/v1/notifications?isRead=false&page=1&limit=20")
      .set(authHeader(tempClientToken));
    expect(afterCreate.status).toBe(200);
    expect(
      afterCreate.body.data.some(
        (n: { type: string; data?: string }) => n.type === "LOAN_SUBMITTED" && n.data?.includes(loanId),
      ),
    ).toBe(true);

    await request.patch(`/api/v1/loans/${loanId}/approve`).set(authHeader(tempInvestorToken));
    await request.patch(`/api/v1/loans/${loanId}/approve`).set(authHeader(adminToken));

    const clientNotifs = await request
      .get("/api/v1/notifications?isRead=false&page=1&limit=20")
      .set(authHeader(tempClientToken));
    const types = clientNotifs.body.data.map((n: { type: string }) => n.type);
    expect(types).toContain("LOAN_INVESTOR_APPROVED");
    expect(types).toContain("LOAN_ACTIVE");

    const invNotifs = await request
      .get("/api/v1/notifications?isRead=false&page=1&limit=20")
      .set(authHeader(tempInvestorToken));
    expect(invNotifs.body.data.some((n: { type: string }) => n.type === "LOAN_ACTIVE_INVESTOR")).toBe(true);
  });

  // CP-I30
  it("lista notificaciones, marca una individualmente y luego marca todas como leídas", async () => {
    const listBefore = await request
      .get("/api/v1/notifications?isRead=false&page=1&limit=20")
      .set(authHeader(tempClientToken));
    expect(listBefore.status).toBe(200);
    expect(listBefore.body.data.length).toBeGreaterThanOrEqual(2);
    const unreadBefore = listBefore.body.meta.unreadCount as number;
    const firstId = listBefore.body.data[0].id as string;

    const readOne = await request
      .patch(`/api/v1/notifications/${firstId}/read`)
      .set(authHeader(tempClientToken));
    expect(readOne.status).toBe(200);
    expect(readOne.body.data.isRead).toBe(true);

    const listAfterOne = await request
      .get("/api/v1/notifications?isRead=false&page=1&limit=20")
      .set(authHeader(tempClientToken));
    expect(listAfterOne.body.meta.unreadCount).toBe(unreadBefore - 1);

    // Usuario ajeno no puede marcar notificación de otro
    const otherMark = await request
      .patch(`/api/v1/notifications/${firstId}/read`)
      .set(authHeader(tempInvestorToken));
    expect(otherMark.status).toBe(404);

    const readAll = await request.patch("/api/v1/notifications/read-all").set(authHeader(tempClientToken));
    expect(readAll.status).toBe(200);

    const listAfterAll = await request
      .get("/api/v1/notifications?isRead=false&page=1&limit=20")
      .set(authHeader(tempClientToken));
    expect(listAfterAll.body.meta.unreadCount).toBe(0);
    expect(listAfterAll.body.data).toHaveLength(0);
  });

  // CP-I31
  it("genera notificaciones para flujo de vouchers (VOUCHER_PENDING_REVIEW y VOUCHER_APPROVED)", async () => {
    const voucherRes = await request
      .post("/api/v1/payment-vouchers")
      .set(authHeader(tempClientToken))
      .send({ loanId, amount: "80", operationId: uniqueOperationId("NTFV") });
    expect(voucherRes.status).toBe(201);
    const voucherId = voucherRes.body.data.id as string;
    tracker.trackVoucher(voucherId);

    const invList = await request.get("/api/v1/notifications").set(authHeader(tempInvestorToken));
    expect(invList.body.data.some((n: { type: string }) => n.type === "VOUCHER_PENDING_REVIEW")).toBe(true);

    await request
      .patch(`/api/v1/payment-vouchers/${voucherId}/process`)
      .set(authHeader(tempInvestorToken))
      .send({ action: "approve" });
    await request
      .patch(`/api/v1/payment-vouchers/${voucherId}/process`)
      .set(authHeader(adminToken))
      .send({ action: "approve" });

    const clientList = await request.get("/api/v1/notifications").set(authHeader(tempClientToken));
    expect(clientList.body.data.some((n: { type: string }) => n.type === "VOUCHER_APPROVED")).toBe(true);
  });
});

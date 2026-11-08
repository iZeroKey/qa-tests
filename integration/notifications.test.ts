import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, createTestLoan, getUserByEmail, loginAs, request, seededEmails } from "../helpers/integration.js";

let clientToken: string;
let loanId: string;

beforeAll(async () => {
  const adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
  const clientId = (await getUserByEmail(seededEmails.client)).id;
  const loan = await createTestLoan(adminToken, clientId);
  loanId = loan.id;
  const approve = await request.patch(`/api/v1/loans/${loan.id}/approve`).set(authHeader(adminToken));
  expect([200, 201]).toContain(approve.status);
});

describe("notificaciones", () => {
  it("genera una notificación al enviar un préstamo", async () => {
    const list = await request
      .get("/api/v1/notifications")
      .query({ isRead: "false", page: 1, limit: 50 })
      .set(authHeader(clientToken));

    expect(list.status).toBe(200);
    const notification = list.body.data.find(
      (item: { type?: string; data?: string }) => item.type === "LOAN_SUBMITTED",
    );
    expect(notification).toBeTruthy();
    expect(JSON.parse(notification.data)).toMatchObject({ loanId });
  });

  it("lista y marca notificaciones", async () => {
    const list = await request.get("/api/v1/notifications").set(authHeader(clientToken));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const readAll = await request.patch("/api/v1/notifications/read-all").set(authHeader(clientToken));
    expect(readAll.status).toBe(200);

    const first = list.body.data[0] as { id?: string } | undefined;
    if (first?.id) {
      const read = await request.patch(`/api/v1/notifications/${first.id}/read`).set(authHeader(clientToken));
      expect(read.status).toBe(200);
    }
  });
});

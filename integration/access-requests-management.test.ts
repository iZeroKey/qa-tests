import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs, request, seededEmails, uniqueEmail } from "../helpers/integration.js";

let adminToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
});

describe("solicitudes de acceso", () => {
  // CP-I10
  it("crea, lista, consulta y rechaza una solicitud", async () => {
    const create = await request.post("/api/v1/access-requests").send({
      email: uniqueEmail("request"),
      firstName: "Solicitud",
      lastName: "Integración",
      phone: "999888777",
      roleRequested: "client",
    });
    expect(create.status).toBe(201);
    const requestId = create.body.data.id;

    const list = await request.get("/api/v1/access-requests").set(authHeader(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((item: { id: string }) => item.id === requestId)).toBe(true);

    const detail = await request.get(`/api/v1/access-requests/${requestId}`).set(authHeader(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(requestId);

    const review = await request
      .patch(`/api/v1/access-requests/${requestId}/status`)
      .set(authHeader(adminToken))
      .send({ status: "rejected", observation: "Prueba" });
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe("rejected");
  });
});

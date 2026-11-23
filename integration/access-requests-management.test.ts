// Pruebas de integración del ciclo completo y validaciones de /access-requests.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestCleanupTracker } from "../helpers/db-dml.js";
import { authHeader, loginAs, request, seededEmails, TEST_PASSWORD, uniqueEmail } from "../helpers/integration.js";

const tracker = new TestCleanupTracker();
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("solicitudes de acceso", () => {
  // CP-I01
  it("crea, lista, consulta y rechaza una solicitud", async () => {
    const reqEmail = uniqueEmail("request-rej");
    const create = await request.post("/api/v1/access-requests").send({
      email: reqEmail,
      firstName: "Solicitud",
      lastName: "Integración",
      phone: "999888777",
      roleRequested: "client",
    });
    expect(create.status).toBe(201);
    const requestId = create.body.data.id as string;
    tracker.trackAccessRequest(requestId, reqEmail);

    const list = await request
      .get("/api/v1/access-requests?roleRequested=client&status=pending")
      .set(authHeader(adminToken));
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
    expect(review.body.data.observation).toBe("Prueba");
  });

  // CP-I02
  it("aprueba solicitud con contraseña inicial, crea usuario operativo y permite login (RF-10)", async () => {
    const reqEmail = uniqueEmail("request-app");
    const create = await request.post("/api/v1/access-requests").send({
      email: reqEmail,
      firstName: "Aprobado",
      lastName: "Inversionista",
      phone: "988777666",
      roleRequested: "investor",
    });
    expect(create.status).toBe(201);
    const requestId = create.body.data.id as string;
    tracker.trackAccessRequest(requestId, reqEmail);
    tracker.trackUser(null, null, reqEmail);

    const noPwd = await request
      .patch(`/api/v1/access-requests/${requestId}/status`)
      .set(authHeader(adminToken))
      .send({ status: "approved" });
    expect(noPwd.status).toBe(400);

    const inReview = await request
      .patch(`/api/v1/access-requests/${requestId}/status`)
      .set(authHeader(adminToken))
      .send({ status: "in_review", observation: "Evaluando" });
    expect(inReview.status).toBe(200);
    expect(inReview.body.data.status).toBe("in_review");

    const approved = await request
      .patch(`/api/v1/access-requests/${requestId}/status`)
      .set(authHeader(adminToken))
      .send({ status: "approved", initialPassword: TEST_PASSWORD, observation: "Bienvenido" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("approved");

    const alreadyApproved = await request
      .patch(`/api/v1/access-requests/${requestId}/status`)
      .set(authHeader(adminToken))
      .send({ status: "rejected" });
    expect(alreadyApproved.status).toBe(400);

    const newUserLogin = await request
      .post("/api/v1/auth/login")
      .send({ email: reqEmail, password: TEST_PASSWORD });
    expect(newUserLogin.status).toBe(200);
    expect(newUserLogin.body.data.user.role).toBe("investor");
  });

  // CP-I03
  it("valida permisos, entradas inválidas y 404 en solicitudes", async () => {
    const badCreate = await request.post("/api/v1/access-requests").send({ email: "malo", firstName: "A" });
    expect(badCreate.status).toBe(400);

    const forbidden = await request.get("/api/v1/access-requests").set(authHeader(clientToken));
    expect(forbidden.status).toBe(403);

    const missing = await request
      .get("/api/v1/access-requests/123e4567-e89b-12d3-a456-426614174999")
      .set(authHeader(adminToken));
    expect(missing.status).toBe(404);
  });
});

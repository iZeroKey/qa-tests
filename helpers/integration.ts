// Cliente HTTP (supertest en memoria o contra QA_API_URL en vivo) y utilidades para pruebas de integración y UI.
import supertest from "supertest";
import { getUserRowByEmail, TestCleanupTracker } from "./db-dml.js";

const liveApiUrl = process.env.QA_API_URL?.trim();
export const request = liveApiUrl
  ? supertest(liveApiUrl)
  : supertest((await import("../../abc_inversiones_api/src/app.js")).app);

export const TEST_PASSWORD = "password123";

export const seededEmails = {
  admin: "admin@abc.com",
  client: "client@abc.com",
  investor: "investor@abc.com",
} as const;

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

export const loginFull = async (email: string, password = TEST_PASSWORD) => {
  const res = await request.post("/api/v1/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`No se pudo iniciar sesión para ${email}: ${res.status} ${res.text}`);
  }
  return {
    accessToken: res.body.data.session.access_token as string,
    refreshToken: res.body.data.session.refresh_token as string,
    user: res.body.data.user as { id: string; email: string; role: string; isOwner: boolean },
  };
};

export const loginAs = async (email: string, password = TEST_PASSWORD): Promise<string> => {
  const res = await loginFull(email, password);
  return res.accessToken;
};

export const getUserByEmail = async (email: string) => {
  return getUserRowByEmail(email);
};

export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@abc.com`;

export const uniqueOperationId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();

export async function createTestLoan(
  adminToken: string,
  clientId: string,
  overrides: Record<string, unknown> = {},
  tracker?: TestCleanupTracker,
) {
  const res = await request
    .post("/api/v1/loans")
    .set(authHeader(adminToken))
    .send({
      clientId,
      principal: "1000",
      interestRate: "5",
      installmentsCount: 4,
      frequency: "monthly",
      startDate: "2026-01-01T00:00:00.000Z",
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`No se pudo crear el préstamo de prueba: ${res.status} ${res.text}`);
  }

  const loan = res.body.data?.loan ?? res.body.data;
  if (!loan?.id) throw new Error("La API no devolvió el ID del préstamo de prueba");
  tracker?.trackLoan(loan.id as string);
  return loan as { id: string; status: string; publicCode: string; totalDebt: string; name: string };
}

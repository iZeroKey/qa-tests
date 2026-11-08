import supertest from "supertest";
import { app } from "../../abc_inversiones_api/src/app.js";
import { db } from "../../abc_inversiones_api/src/config/db.js";
import { supabaseAdmin } from "../../abc_inversiones_api/src/config/supabase.js";
import { users } from "../../abc_inversiones_api/src/db/schema/users.js";
import { eq } from "drizzle-orm";

export const request = supertest(app);
export const TEST_PASSWORD = "password123";

export const seededEmails = {
  admin: "admin@abc.com",
  client: "client@abc.com",
  investor: "investor@abc.com",
} as const;

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

export const loginAs = async (email: string, password = TEST_PASSWORD): Promise<string> => {
  const res = await request.post("/api/v1/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`No se pudo iniciar sesión para ${email}: ${res.status} ${res.text}`);
  }
  return res.body.data.session.access_token as string;
};

export const getUserByEmail = async (email: string) => {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`No existe el usuario sembrado ${email}`);
  return user;
};

export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@abc.com`;

export const uniqueOperationId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();

export async function createTestLoan(adminToken: string, clientId: string) {
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
    });

  if (res.status !== 201) {
    throw new Error(`No se pudo crear el préstamo de prueba: ${res.status} ${res.text}`);
  }

  const loan = res.body.data?.loan ?? res.body.data;
  if (!loan?.id) throw new Error("La API no devolvió el ID del préstamo de prueba");
  return loan as { id: string };
}

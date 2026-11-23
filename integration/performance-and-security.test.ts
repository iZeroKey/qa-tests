// Pruebas de integración de latencias críticas (RNF-07), privacidad (RNF-03) y rate limit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { authHeader, loginAs, request, seededEmails, TEST_PASSWORD } from "../helpers/integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const latenciesPath = path.resolve(__dirname, "../reports/rnf07-latencies.json");

let adminToken: string;
let clientToken: string;
let investorToken: string;

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
  clientToken = await loginAs(seededEmails.client);
  investorToken = await loginAs(seededEmails.investor);
});

describe("rendimiento (RNF-07), privacidad (RNF-03) y rate limit", () => {
  // CP-I38
  it("endpoints críticos responden por debajo de 2000 ms (RNF-07)", async () => {
    const measurements: Array<{ endpoint: string; method: string; ms: number; status: number }> = [];

    const measure = async (label: string, method: string, fn: () => Promise<{ status: number }>) => {
      const start = performance.now();
      const res = await fn();
      const ms = Math.round((performance.now() - start) * 100) / 100;
      measurements.push({ endpoint: label, method, ms, status: res.status });
      expect(res.status).toBe(200);
      expect(ms).toBeLessThan(2000);
    };

    await measure("/api/v1/health", "GET", () => request.get("/api/v1/health"));
    await measure("/api/v1/auth/login", "POST", () =>
      request.post("/api/v1/auth/login").send({ email: seededEmails.admin, password: TEST_PASSWORD }),
    );
    await measure("/api/v1/loans", "GET", () => request.get("/api/v1/loans").set(authHeader(adminToken)));
    await measure("/api/v1/loans/summary", "GET", () =>
      request.get("/api/v1/loans/summary").set(authHeader(adminToken)),
    );
    await measure("/api/v1/reports/dashboard", "GET", () =>
      request.get("/api/v1/reports/dashboard").set(authHeader(adminToken)),
    );
    await measure("/api/v1/reports/portfolio", "GET", () =>
      request.get("/api/v1/reports/portfolio").set(authHeader(investorToken)),
    );
    await measure("/api/v1/reports/statement", "GET", () =>
      request.get("/api/v1/reports/statement").set(authHeader(clientToken)),
    );
    await measure("/api/v1/audit-logs", "GET", () =>
      request.get("/api/v1/audit-logs?limit=20").set(authHeader(adminToken)),
    );

    fs.mkdirSync(path.dirname(latenciesPath), { recursive: true });
    fs.writeFileSync(
      latenciesPath,
      JSON.stringify({ measuredAt: new Date().toISOString(), thresholdMs: 2000, measurements }, null, 2),
      "utf8",
    );
  });

  // CP-I39
  it("respuestas HTTP no exponen secretos, tokens de servicio ni cadenas de BD (RNF-03)", async () => {
    const responses = await Promise.all([
      request.get("/api/v1/health"),
      request.get("/api/v1/users/me").set(authHeader(adminToken)),
      request.get("/api/v1/no-existe"),
      request.post("/api/v1/auth/login").send({ email: seededEmails.admin, password: "incorrect" }),
    ]);

    const forbiddenPatterns = [
      process.env.SUPABASE_SERVICE_ROLE_KEY || "SERVICE_ROLE_SECRET_SENTINEL",
      process.env.DATABASE_URL || "DATABASE_URL_SENTINEL",
      "postgresql://",
      "postgres://",
    ].filter((s) => s.length > 8);

    for (const res of responses) {
      const text = JSON.stringify(res.body);
      for (const secret of forbiddenPatterns) {
        expect(text).not.toContain(secret);
      }
    }
  });

  // CP-I40
  it("authRateLimit aplica límite de tasa (429) tras exceder 12 intentos consecutivos", async () => {
    // Defecto conocido (rate-limit.middleware.ts:21-22): RATE_LIMIT_DISABLED = true desactiva el límite 429.
    let lastStatus = 200;
    let rateLimitHeader: string | undefined;
    for (let i = 0; i < 14; i++) {
      const res = await request
        .post("/api/v1/auth/login")
        .send({ email: "ratelimit-test@abc.com", password: "wrong-password" });
      lastStatus = res.status;
      rateLimitHeader = res.headers["x-ratelimit-limit"];
    }
    expect(rateLimitHeader).toBeTruthy();
    expect(lastStatus).toBe(429);
  });
});

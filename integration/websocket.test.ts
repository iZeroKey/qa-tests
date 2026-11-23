// Pruebas de integración del canal en tiempo real WebSocket (/ws) y aislamiento por usuario.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, TestCleanupTracker } from "../helpers/db-dml.js";
import { authHeader, createTestLoan, loginAs, request, seededEmails } from "../helpers/integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromApi = createRequire(path.resolve(__dirname, "../../abc_inversiones_api/package.json"));
const wsMod = requireFromApi("ws") as { default?: typeof import("ws"); WebSocket?: typeof import("ws") } & typeof import("ws");
const WebSocket = wsMod.WebSocket ?? wsMod.default ?? wsMod;

const WS_URL = (process.env.QA_API_URL || "http://127.0.0.1:3000").replace(/^http/, "ws") + "/ws";

const tracker = new TestCleanupTracker();
let adminToken: string;

function connectWs(): Promise<{
  ws: InstanceType<typeof WebSocket>;
  nextMessage: (timeoutMs?: number) => Promise<Record<string, unknown>>;
  waitForType: (type: string, timeoutMs?: number) => Promise<Record<string, unknown>>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const queue: Record<string, unknown>[] = [];
    const waiters: Array<{ fn: (msg: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> }> = [];

    ws.on("message", (raw: Buffer) => {
      const parsed = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
      if (waiters.length > 0) {
        const waiter = waiters.shift()!;
        clearTimeout(waiter.timer);
        waiter.fn(parsed);
      } else {
        queue.push(parsed);
      }
    });

    const nextMessage = (timeoutMs = 5000) => {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return new Promise<Record<string, unknown>>((resMsg, rejMsg) => {
        const timer = setTimeout(() => {
          rejMsg(new Error(`Timeout esperando mensaje WebSocket (${timeoutMs}ms)`));
        }, timeoutMs);
        waiters.push({ fn: resMsg, timer });
      });
    };

    const waitForType = async (type: string, timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const msg = await nextMessage(Math.max(500, deadline - Date.now()));
        if (msg.type === type) return msg;
      }
      throw new Error(`No llegó evento WS tipo "${type}"`);
    };

    ws.on("open", () => resolve({ ws, nextMessage, waitForType, close: () => ws.close() }));
    ws.on("error", (err: Error) => reject(err));
  });
}

beforeAll(async () => {
  adminToken = await loginAs(seededEmails.admin);
});

afterAll(async () => {
  await tracker.cleanup();
});

describe("WebSocket en tiempo real (/ws)", () => {
  // CP-I63
  it("envía connected inicial, rechaza mensajes sin autenticar y JSON inválido", async () => {
    const conn = await connectWs();
    try {
      const welcome = await conn.nextMessage();
      expect(welcome).toMatchObject({ type: "connected", data: { authenticated: false } });

      conn.ws.send("no-es-json");
      const invalidJson = await conn.nextMessage();
      expect(invalidJson).toMatchObject({ type: "error", data: { message: "Mensaje inválido" } });

      conn.ws.send(JSON.stringify({ type: "ping" }));
      const unauthErr = await conn.nextMessage();
      expect(unauthErr).toMatchObject({ type: "error", data: { message: "Primero debes autenticarte" } });
    } finally {
      conn.close();
    }
  });

  // CP-I64
  it("cierra con código 4003 ante token inválido", async () => {
    const conn = await connectWs();
    const closed = new Promise<{ code: number }>((resolve) => {
      conn.ws.on("close", (code: number) => resolve({ code }));
    });
    try {
      await conn.nextMessage();
      conn.ws.send(JSON.stringify({ type: "auth", token: "token-falso" }));
      const errMsg = await conn.nextMessage();
      expect(errMsg.type).toBe("auth.error");
      const closeInfo = await closed;
      expect(closeInfo.code).toBe(4003);
    } finally {
      conn.close();
    }
  });

  // CP-I65
  it("autentica usuario, responde ping->pong y entrega eventos en tiempo real solo al destinatario", async () => {
    const clientA = await createTempUser(tracker, { role: "client", firstName: "WS", lastName: "CliA" });
    const clientB = await createTempUser(tracker, { role: "client", firstName: "WS", lastName: "CliB" });
    const tokenA = await loginAs(clientA.email, clientA.password);
    const tokenB = await loginAs(clientB.email, clientB.password);

    const connA = await connectWs();
    const connB = await connectWs();
    try {
      await connA.nextMessage();
      await connB.nextMessage();

      connA.ws.send(JSON.stringify({ type: "auth", token: tokenA }));
      const okA = await connA.nextMessage();
      expect(okA).toMatchObject({ type: "auth.ok", data: { userId: clientA.id, role: "client" } });

      connB.ws.send(JSON.stringify({ type: "auth", token: tokenB }));
      const okB = await connB.nextMessage();
      expect(okB).toMatchObject({ type: "auth.ok", data: { userId: clientB.id, role: "client" } });

      connA.ws.send(JSON.stringify({ type: "ping" }));
      const pong = await connA.nextMessage();
      expect(pong).toMatchObject({ type: "pong", data: { userId: clientA.id } });

      connA.ws.send(JSON.stringify({ type: "unknown_action" }));
      const unsupported = await connA.nextMessage();
      expect(unsupported.type).toBe("error");

      // Admin crea préstamo para Client A -> Client A recibe evento en tiempo real
      const loan = await createTestLoan(adminToken, clientA.id, { name: "WS Live Loan" }, tracker);
      expect(loan.id).toBeTruthy();

      const eventA = await connA.waitForType("loan.created", 8000);
      expect(eventA.data).toMatchObject({ loanId: loan.id, clientId: clientA.id });

      // Client B NO debe recibir eventos del préstamo de Client A
      await expect(connB.nextMessage(1200)).rejects.toThrow(/Timeout/);
    } finally {
      connA.close();
      connB.close();
    }
  });
});

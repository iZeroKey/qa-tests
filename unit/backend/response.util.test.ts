// Pruebas unitarias de utilidades de respuesta HTTP estándar y formateo de errores Zod.
import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { z } from "zod";
import {
  formatZodError,
  sendError,
  sendSuccess,
} from "../../../abc_inversiones_api/src/utils/response.util.js";
import { env } from "../../../abc_inversiones_api/src/config/env.js";

function createMockResponse() {
  const res = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; payload: Record<string, unknown> };
}

describe("response.util", () => {
  // CP-U46
  it("formatZodError formatea issues con path y message", () => {
    const schema = z.object({ user: z.object({ email: z.string().email() }) });
    const result = schema.safeParse({ user: { email: "bad" } });
    expect(result.success).toBe(false);
    if (result.success) return;

    const formatted = formatZodError(result.error);
    expect(formatted).toHaveLength(1);
    expect(formatted[0].path).toBe("user.email");
    expect(formatted[0].message).toBeTruthy();
  });

  // CP-U47
  it("sendSuccess construye contrato estandar con meta y timestamp", () => {
    const res = createMockResponse();
    sendSuccess(res, 201, "Creado", { id: "1" }, { page: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({
      success: true,
      message: "Creado",
      data: { id: "1" },
      meta: { page: 1 },
    });
    expect(typeof (res.payload.meta as { timestamp?: string }).timestamp).toBe("string");
  });

  // CP-U48
  it("sendError oculta detalles 5xx en produccion y conserva 4xx", () => {
    const mutableEnv = env as { NODE_ENV: string };
    const originalEnv = mutableEnv.NODE_ENV;
    try {
      mutableEnv.NODE_ENV = "production";
      const res500 = createMockResponse();
      sendError(res500, 500, "Detalle secreto SQL", { stack: "trace" });
      expect(res500.statusCode).toBe(500);
      expect(res500.payload).toMatchObject({
        success: false,
        message: "Error interno del servidor",
        data: null,
      });

      const res400 = createMockResponse();
      sendError(res400, 400, "Datos invalidos", [{ path: "amount", message: "requerido" }]);
      expect(res400.statusCode).toBe(400);
      expect(res400.payload).toMatchObject({
        success: false,
        message: "Datos invalidos",
        data: [{ path: "amount", message: "requerido" }],
      });
    } finally {
      mutableEnv.NODE_ENV = originalEnv;
    }
  });
});

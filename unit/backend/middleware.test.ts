// Pruebas unitarias de middlewares de autorización por rol/propietario y manejo de errores HTTP.
import { describe, it, expect, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { authorize } from "../../../abc_inversiones_api/src/middleware/role.middleware.js";
import {
  errorHandler,
  notFoundHandler,
} from "../../../abc_inversiones_api/src/middleware/error-handler.middleware.js";
import type { AuthRequest } from "../../../abc_inversiones_api/src/middleware/auth.middleware.js";

function createMockRes() {
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

describe("Middlewares de autorizacion y errores", () => {
  // CP-U27
  it("authorize rechaza usuario no autenticado (401) y rol no permitido (403)", () => {
    const next = vi.fn() as unknown as NextFunction;
    const res401 = createMockRes();
    authorize(["admin"])({} as AuthRequest, res401, next);
    expect(res401.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();

    const res403 = createMockRes();
    authorize(["admin"])(
      { user: { id: "u1", role: "client", isOwner: false } } as AuthRequest,
      res403,
      next,
    );
    expect(res403.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  // CP-U28
  it("authorize respeta allowOwner=true vs allowOwner=false", () => {
    const ownerReq = { user: { id: "u0", role: "admin", isOwner: true } } as AuthRequest;
    const nextAllowed = vi.fn() as unknown as NextFunction;
    authorize(["client"], true)(ownerReq, createMockRes(), nextAllowed);
    expect(nextAllowed).toHaveBeenCalledTimes(1);

    const nextBlocked = vi.fn() as unknown as NextFunction;
    const res403 = createMockRes();
    authorize(["client"], false)(ownerReq, res403, nextBlocked);
    expect(res403.statusCode).toBe(403);
    expect(nextBlocked).not.toHaveBeenCalled();
  });

  // CP-U29
  it("notFoundHandler y errorHandler devuelven estructura JSON controlada", () => {
    const res404 = createMockRes();
    notFoundHandler({} as Request, res404);
    expect(res404.statusCode).toBe(404);
    expect(res404.payload).toMatchObject({ success: false, message: "Recurso no encontrado" });

    const res400 = createMockRes();
    errorHandler({ status: 400, message: "JSON malformado" }, {} as Request, res400, vi.fn());
    expect(res400.statusCode).toBe(400);
    expect(res400.payload).toMatchObject({ success: false, message: "JSON malformado" });

    const res500 = createMockRes();
    errorHandler(new Error("Fallo inesperado"), {} as Request, res500, vi.fn());
    expect(res500.statusCode).toBe(500);
    expect(res500.payload).toMatchObject({ success: false });
  });
});

// Pruebas unitarias del cliente HTTP autenticado y construcción de rutas con parámetros.
import { describe, expect, it, vi } from "vitest";
import {
  buildApiUrl,
  getApiBaseUrl,
  getErrorMessage,
  readApiPath,
  readApiPayload,
  readApiUrl,
} from "@/lib/api-client";

describe("api-client", () => {
  // CP-U71
  it("construye URLs y omite parámetros vacíos", () => {
    expect(getApiBaseUrl()).toBe("http://localhost:3000");
    expect(
      buildApiUrl("/api/v1/users", { page: 2, active: false, q: "", skip: undefined }),
    ).toBe("http://localhost:3000/api/v1/users?page=2&active=false");
  });

  // CP-U72
  it("lee payloads exitosos", async () => {
    const response = new Response(JSON.stringify({ success: true, data: { id: "1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(readApiPayload<{ id: string }>(response)).resolves.toMatchObject({
      success: true,
      data: { id: "1" },
    });
  });

  // CP-U73
  it("propaga el mensaje de error de la API y usa fallback si no hay JSON", async () => {
    const apiError = new Response(JSON.stringify({ success: false, message: "No autorizado" }), {
      status: 401,
    });
    await expect(readApiPayload(apiError)).rejects.toThrow("No autorizado");

    const emptyError = new Response("", { status: 500 });
    await expect(readApiPayload(emptyError)).rejects.toThrow("No se pudo completar la solicitud");
  });

  // CP-U74
  it("lee una ruta usando el fetch autenticado y el helper de errores", async () => {
    const fetchWithAuth = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: ["ok"] }), { status: 200 }),
    );

    await expect(readApiPath(fetchWithAuth, "/api/v1/health")).resolves.toMatchObject({
      data: ["ok"],
    });
    expect(fetchWithAuth).toHaveBeenCalledWith("http://localhost:3000/api/v1/health", undefined);
    expect(getErrorMessage(new Error("falló"), "fallback")).toBe("falló");
    expect(getErrorMessage("falló", "fallback")).toBe("fallback");
  });

  // CP-U75
  it("readApiUrl consume URLs completas y rechaza respuestas HTTP 200 con success=false", async () => {
    const fetchWithAuth = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, message: "Regla rechazada" }), { status: 200 }),
      );

    await expect(readApiUrl(fetchWithAuth, "http://localhost:3000/api/v1/loans?page=1")).resolves.toMatchObject({
      data: { ok: true },
    });
    await expect(readApiUrl(fetchWithAuth, "http://localhost:3000/api/v1/loans")).rejects.toThrow("Regla rechazada");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildApiUrl,
  getApiBaseUrl,
  getErrorMessage,
  readApiPath,
  readApiPayload,
} from "@/lib/api-client";

describe("api-client", () => {
  // CP-U42
  it("construye URLs y omite parámetros vacíos", () => {
    expect(getApiBaseUrl()).toBe("http://localhost:3000");
    expect(
      buildApiUrl("/api/v1/users", { page: 2, active: false, q: "", skip: undefined }),
    ).toBe("http://localhost:3000/api/v1/users?page=2&active=false");
  });

  // CP-U43
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

  // CP-U44
  it("propaga el mensaje de error de la API y usa fallback si no hay JSON", async () => {
    const apiError = new Response(JSON.stringify({ success: false, message: "No autorizado" }), {
      status: 401,
    });
    await expect(readApiPayload(apiError)).rejects.toThrow("No autorizado");

    const emptyError = new Response("", { status: 500 });
    await expect(readApiPayload(emptyError)).rejects.toThrow("No se pudo completar la solicitud");
  });

  // CP-U45
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
});

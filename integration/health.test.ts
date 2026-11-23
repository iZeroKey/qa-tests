// Pruebas de integración de endpoints de salud, rutas inexistentes y payloads malformados.
import { describe, expect, it } from "vitest";
import { request } from "../helpers/integration.js";

describe("salud de la API", () => {
  // CP-I13
  it("GET /api/v1/health devuelve la estructura estándar y cabeceras de seguridad", async () => {
    const response = await request.get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        service: "abc-inversiones-api",
      },
    });
    expect(response.body.data.uptime).toHaveProperty("seconds");
    expect(response.body.data.memory).toHaveProperty("heapUsed");
    expect(response.body.data).toHaveProperty("node");
    expect(response.body.data).toHaveProperty("pid");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toContain("no-cache");
    expect(response.body).toHaveProperty("meta.timestamp");
  });

  // CP-I14
  it("GET /health y rutas inexistentes responden correctamente", async () => {
    const root = await request.get("/health");
    expect(root.status).toBe(200);
    expect(root.body).toHaveProperty("name", "abc-inversiones-api");
    expect(root.body).toHaveProperty("version");
    expect(root.body).toHaveProperty("uptime");
    expect(root.headers["cache-control"]).toContain("max-age=300");

    const missing = await request.get("/api/v1/no-existe");
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);
    expect(missing.body).toHaveProperty("meta.timestamp");
  });

  // CP-I15
  it("JSON malformado en el cuerpo responde 400 controlado sin exponer stack", async () => {
    const res = await request
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{malformed-json");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty("meta.timestamp");
  });
});

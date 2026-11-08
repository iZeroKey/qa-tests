import { describe, expect, it } from "vitest";
import { request } from "../helpers/integration.js";

describe("salud de la API", () => {
  it("GET /api/v1/health devuelve la estructura estándar", async () => {
    const response = await request.get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: "ok", service: "abc-inversiones-api" },
    });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("GET /health y rutas inexistentes responden correctamente", async () => {
    const root = await request.get("/health");
    expect(root.status).toBe(200);
    expect(root.body).toHaveProperty("name");
    expect(root.body).toHaveProperty("version");

    const missing = await request.get("/api/v1/no-existe");
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);
    expect(missing.body).toHaveProperty("meta.timestamp");
  });
});

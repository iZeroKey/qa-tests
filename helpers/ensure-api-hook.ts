// Asegura disponibilidad de la API supervisada antes y después de cada test cuando QA_API_URL está definido.
import { afterEach, beforeAll, beforeEach } from "vitest";
import { ensureApiAlive } from "../support/api-health.js";

if (process.env.QA_API_URL?.trim()) {
  beforeAll(async () => {
    await ensureApiAlive("integration:beforeAll");
  }, 30000);

  beforeEach(async (ctx) => {
    await ensureApiAlive(ctx.task.name);
  }, 30000);

  afterEach(async (ctx) => {
    await ensureApiAlive(ctx.task.name);
  }, 30000);
}

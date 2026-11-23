// Cliente de consulta y recuperación automática hacia api-supervisor.mjs (:3099) o salud directa (:3000).
const SUPERVISOR_URL = process.env.QA_SUPERVISOR_URL || "http://127.0.0.1:3099";
const API_URL = process.env.QA_API_URL || "http://127.0.0.1:3000";

export async function markCurrentTest(testName: string): Promise<void> {
  try {
    await fetch(`${SUPERVISOR_URL}/mark-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testName }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Si el supervisor no está activo, se omite silenciosamente.
  }
}

export async function ensureApiAlive(testName?: string): Promise<void> {
  try {
    await fetch(`${SUPERVISOR_URL}/ensure-alive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testName ? { testName } : {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    // Fallback: verificar directamente el endpoint de salud si no hay supervisor.
  }

  const deadline = Date.now() + 25000;
  let lastError = "sin respuesta";

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_URL}/api/v1/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (res.status === 200) {
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`La API no respondió en ${API_URL}/api/v1/health (${lastError})`);
}

export async function getSupervisorStatus(): Promise<{
  alive: boolean;
  pid: number | null;
  mode: string;
  restarts: number;
  currentTest: string | null;
  crashesCount: number;
} | null> {
  try {
    const res = await fetch(`${SUPERVISOR_URL}/status`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Supervisa la API local (control HTTP :3099, watchdog e historial de caídas) con fallback de pnpm dev a tsx directo.
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "../../abc_inversiones_api");
const reportsDir = path.resolve(__dirname, "../reports");
const crashLogPath = path.join(reportsDir, "api-crashes.json");

const API_HEALTH_URL = "http://127.0.0.1:3000/api/v1/health";
const CONTROL_HOST = "127.0.0.1";
const CONTROL_PORT = 3099;
const MAX_LOG_LINES = 60;

fs.mkdirSync(reportsDir, { recursive: true });

let child = null;
let intentionalStop = false;
let spawnMode = "pnpm-dev"; // "pnpm-dev" | "tsx-direct"
let currentTest = null;
let restarts = 0;
let consecutiveWatchdogFailures = 0;
let bootInProgress = null;
let isShuttingDown = false;
let stdoutBuffer = [];
let stderrBuffer = [];
let crashes = [];

function pushLogLines(buffer, chunk) {
  const lines = chunk
    .toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  for (const line of lines) {
    buffer.push(line);
    if (buffer.length > MAX_LOG_LINES) {
      buffer.shift();
    }
  }
}

function persistCrashLog() {
  try {
    fs.writeFileSync(
      crashLogPath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          restarts,
          crashesCount: crashes.length,
          crashes,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (err) {
    console.error("[api-supervisor] Error guardando api-crashes.json:", err);
  }
}

async function probeApiHealth(timeoutMs = 2500) {
  try {
    const res = await fetch(API_HEALTH_URL, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function waitForApiHealthy(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeApiHealth(2000)) {
      return true;
    }
    if (!child || child.exitCode !== null) {
      return false;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function killChildTree(proc) {
  if (!proc || proc.exitCode !== null || !proc.pid) {
    return;
  }
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      proc.kill("SIGKILL");
    }
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      // Ignoramos si el proceso ya terminó.
    }
  }
}

function recordCrash(reason, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    reason,
    currentTest,
    mode: spawnMode,
    restartNumber: restarts + 1,
    exitCode: details.exitCode ?? null,
    signal: details.signal ?? null,
    stderrTail: [...stderrBuffer],
    stdoutTail: [...stdoutBuffer],
  };
  crashes.push(entry);
  persistCrashLog();
  console.error(
    `[api-supervisor] Incidente API detectado (${reason}) durante test "${currentTest ?? "desconocido"}". Reiniciando...`,
  );
}

function spawnApiProcess(mode) {
  stdoutBuffer = [];
  stderrBuffer = [];
  intentionalStop = false;

  const command =
    process.platform === "win32" ? "cmd.exe" : mode === "pnpm-dev" ? "pnpm" : "./node_modules/.bin/tsx";
  const args =
    process.platform === "win32"
      ? mode === "pnpm-dev"
        ? ["/d", "/s", "/c", "pnpm dev"]
        : ["/d", "/s", "/c", ".\\node_modules\\.bin\\tsx.cmd src/server.ts"]
      : mode === "pnpm-dev"
        ? ["dev"]
        : ["src/server.ts"];

  const proc = spawn(command, args, {
    cwd: apiDir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env },
  });

  proc.stdout?.on("data", (chunk) => pushLogLines(stdoutBuffer, chunk));
  proc.stderr?.on("data", (chunk) => pushLogLines(stderrBuffer, chunk));

  proc.on("error", (err) => {
    pushLogLines(stderrBuffer, `spawn error: ${err.message}`);
  });

  proc.on("exit", (code, signal) => {
    const wasIntentional = intentionalStop;
    const isCurrentChild = child === proc;
    if (isCurrentChild) {
      child = null;
    }
    if (!wasIntentional && !isShuttingDown && isCurrentChild && !bootInProgress) {
      recordCrash("process_exit", { exitCode: code, signal });
      void ensureApiRunning("auto_restart_after_exit", true);
    }
  });

  child = proc;
  return proc;
}

async function startInitialOrRestart(forceRestart = false) {
  if (isShuttingDown) return false;

  if (forceRestart && child) {
    intentionalStop = true;
    killChildTree(child);
    child = null;
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!forceRestart && (await probeApiHealth(1500))) {
    consecutiveWatchdogFailures = 0;
    return true;
  }

  if (spawnMode === "pnpm-dev") {
    spawnApiProcess("pnpm-dev");
    const okPnpm = await waitForApiHealthy(12000);
    if (okPnpm) {
      consecutiveWatchdogFailures = 0;
      return true;
    }
    console.warn(
      "[api-supervisor] pnpm dev no respondió en 12s; cambiando a tsx directo (src/server.ts)...",
    );
    intentionalStop = true;
    killChildTree(child);
    child = null;
    await new Promise((r) => setTimeout(r, 300));
    spawnMode = "tsx-direct";
  }

  spawnApiProcess("tsx-direct");
  const okTsx = await waitForApiHealthy(25000);
  if (okTsx) {
    consecutiveWatchdogFailures = 0;
    return true;
  }
  return false;
}

async function ensureApiRunning(reason = "ensure_alive", forceRestart = false) {
  if (bootInProgress) {
    return bootInProgress;
  }

  bootInProgress = (async () => {
    try {
      if (!forceRestart && (await probeApiHealth(2000))) {
        consecutiveWatchdogFailures = 0;
        return { alive: true, restarted: false };
      }

      if (reason !== "initial_boot" && reason !== "auto_restart_after_exit") {
        recordCrash(reason, {
          exitCode: child?.exitCode ?? null,
          signal: child?.signalCode ?? null,
        });
      }

      if (reason !== "initial_boot") {
        restarts += 1;
        persistCrashLog();
      }

      const ok = await startInitialOrRestart(true);
      if (!ok) {
        console.error("[api-supervisor] La API no respondió tras reiniciar.");
      }
      return { alive: ok, restarted: reason !== "initial_boot" };
    } finally {
      bootInProgress = null;
    }
  })();

  return bootInProgress;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

const controlServer = http.createServer(async (req, res) => {
  const urlPath = (req.url || "/").split("?")[0];

  if (req.method === "GET" && urlPath === "/status") {
    const alive = await probeApiHealth(1500);
    sendJson(res, 200, {
      alive,
      pid: child?.pid ?? null,
      mode: spawnMode,
      restarts,
      currentTest,
      crashesCount: crashes.length,
      crashes,
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/mark-test") {
    const body = await readJsonBody(req);
    if (typeof body.testName === "string") {
      currentTest = body.testName;
    }
    sendJson(res, 200, { ok: true, currentTest });
    return;
  }

  if (req.method === "POST" && urlPath === "/reset-crashes") {
    crashes = [];
    restarts = 0;
    persistCrashLog();
    sendJson(res, 200, { ok: true, crashesCount: 0, restarts: 0 });
    return;
  }

  if (req.method === "POST" && urlPath === "/ensure-alive") {
    const body = await readJsonBody(req);
    if (typeof body.testName === "string") {
      currentTest = body.testName;
    }
    const result = await ensureApiRunning("ensure_alive_health_failed", false);
    sendJson(res, result.alive ? 200 : 503, {
      alive: result.alive,
      restarted: result.restarted,
      restarts,
      crashesCount: crashes.length,
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

const watchdogTimer = setInterval(async () => {
  if (isShuttingDown || bootInProgress) return;
  const ok = await probeApiHealth(2000);
  if (ok) {
    consecutiveWatchdogFailures = 0;
    return;
  }
  consecutiveWatchdogFailures += 1;
  if (consecutiveWatchdogFailures >= 2) {
    consecutiveWatchdogFailures = 0;
    await ensureApiRunning("watchdog_unhealthy", true);
  }
}, 2000);
watchdogTimer.unref();

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearInterval(watchdogTimer);
  intentionalStop = true;
  killChildTree(child);
  controlServer.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

persistCrashLog();

controlServer.listen(CONTROL_PORT, CONTROL_HOST, async () => {
  console.log(`[api-supervisor] Control HTTP escuchando en http://${CONTROL_HOST}:${CONTROL_PORT}`);
  const boot = await ensureApiRunning("initial_boot", false);
  console.log(
    `[api-supervisor] Estado inicial API: alive=${boot.alive} mode=${spawnMode} pid=${child?.pid ?? "none"}`,
  );
});

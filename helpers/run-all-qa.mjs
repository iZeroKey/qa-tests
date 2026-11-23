// Ejecuta de forma secuencial las suites unit, integration, system y acceptance consolidando reports/qa-summary.json.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const qaDir = path.resolve(__dirname, "..");
const reportsDir = path.join(qaDir, "reports");
fs.mkdirSync(reportsDir, { recursive: true });

const SUPERVISOR_URL = "http://127.0.0.1:3099";
const API_URL = "http://127.0.0.1:3000";
const APP_URL = "http://localhost:5173";

async function httpOk(url, timeoutMs = 2500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function ensureSupervisorAndApi() {
  let spawnedSupervisor = null;
  if (!(await httpOk(`${SUPERVISOR_URL}/status`))) {
    console.log("[run-all-qa] Iniciando api-supervisor.mjs...");
    spawnedSupervisor = spawn("node", [path.join(__dirname, "api-supervisor.mjs")], {
      cwd: qaDir,
      stdio: "inherit",
      windowsHide: true,
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await httpOk(`${SUPERVISOR_URL}/status`)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await fetch(`${SUPERVISOR_URL}/reset-crashes`, { method: "POST" }).catch(() => {});
  await fetch(`${SUPERVISOR_URL}/ensure-alive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testName: "run-all-qa:startup" }),
  }).catch(() => {});

  if (!(await httpOk(`${API_URL}/api/v1/health`))) {
    throw new Error(`La API no respondió en ${API_URL}/api/v1/health`);
  }
  if (!(await httpOk(APP_URL))) {
    throw new Error(`El frontend no está disponible en ${APP_URL}. Inícialo antes de correr E2E.`);
  }

  return spawnedSupervisor;
}

function runBin(binName, args, extraEnv = {}) {
  const binPath = path.join(qaDir, "node_modules", ".bin", `${binName}.cmd`);
  const cmd = process.platform === "win32" ? "cmd.exe" : binPath;
  const cmdArgs = process.platform === "win32" ? ["/d", "/s", "/c", binPath, ...args] : args;

  try {
    execFileSync(cmd, cmdArgs, {
      cwd: qaDir,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    return 0;
  } catch (err) {
    return err?.status ?? 1;
  }
}

function parseVitestReport(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const tests = [];
  for (const suite of raw.testResults ?? []) {
    for (const t of suite.assertionResults ?? []) {
      tests.push({
        file: path.relative(qaDir, suite.name || ""),
        title: t.fullName || t.title,
        status: t.status,
        failureMessages: t.failureMessages ?? [],
      });
    }
  }
  return {
    total: raw.numTotalTests ?? tests.length,
    passed: raw.numPassedTests ?? tests.filter((t) => t.status === "passed").length,
    failed: raw.numFailedTests ?? tests.filter((t) => t.status === "failed").length,
    skipped:
      (raw.numPendingTests ?? 0) +
      (raw.numTodoTests ?? 0) +
      tests.filter((t) => t.status === "pending" || t.status === "skipped").length,
    tests,
  };
}

function collectPlaywrightSpecs(suites, out = []) {
  for (const s of suites ?? []) {
    for (const spec of s.specs ?? []) {
      const lastResult = spec.tests?.[0]?.results?.at(-1);
      const status = spec.tests?.[0]?.status ?? lastResult?.status ?? "unknown";
      out.push({
        file: spec.file,
        title: spec.title,
        ok: Boolean(spec.ok),
        status,
        error: lastResult?.error?.message ?? null,
      });
    }
    if (s.suites?.length) collectPlaywrightSpecs(s.suites, out);
  }
  return out;
}

function parsePlaywrightReport(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const tests = collectPlaywrightSpecs(raw.suites, []);
  return {
    total:
      (raw.stats?.expected ?? 0) +
      (raw.stats?.unexpected ?? 0) +
      (raw.stats?.skipped ?? 0) +
      (raw.stats?.flaky ?? 0),
    passed: (raw.stats?.expected ?? 0) + (raw.stats?.flaky ?? 0),
    failed: raw.stats?.unexpected ?? 0,
    skipped: raw.stats?.skipped ?? 0,
    tests,
  };
}

async function main() {
  const spawnedSupervisor = await ensureSupervisorAndApi();
  try {
    console.log("\n=== 1/4 Pruebas Unitarias ===");
    runBin("vitest", [
      "run",
      "unit",
      "--reporter=verbose",
      "--reporter=json",
      "--outputFile=reports/unit-final.json",
    ]);

    console.log("\n=== 2/4 Pruebas de Integración ===");
    runBin(
      "vitest",
      [
        "run",
        "integration",
        "--reporter=verbose",
        "--reporter=json",
        "--outputFile=reports/integration-final.json",
      ],
      { QA_API_URL: API_URL },
    );

    // Reejecuta archivos de integración que hayan tenido pruebas omitidas tras una caída de API
    let integrationSummary = parseVitestReport(path.join(reportsDir, "integration-final.json"));
    const skippedFiles = [
      ...new Set(integrationSummary.tests.filter((t) => t.status === "pending" || t.status === "skipped").map((t) => t.file)),
    ];
    for (const file of skippedFiles) {
      console.log(`\n[run-all-qa] Reejecutando archivo de integración con tests saltados: ${file}`);
      await fetch(`${SUPERVISOR_URL}/ensure-alive`, { method: "POST" }).catch(() => {});
      const retryReport = path.join(reportsDir, "integration-retry.json");
      runBin(
        "vitest",
        ["run", file, "--reporter=verbose", "--reporter=json", `--outputFile=${retryReport}`],
        { QA_API_URL: API_URL },
      );
      if (fs.existsSync(retryReport)) {
        const retried = parseVitestReport(retryReport);
        integrationSummary.tests = [
          ...integrationSummary.tests.filter((t) => t.file !== file),
          ...retried.tests,
        ];
      }
    }
    integrationSummary = {
      total: integrationSummary.tests.length,
      passed: integrationSummary.tests.filter((t) => t.status === "passed").length,
      failed: integrationSummary.tests.filter((t) => t.status === "failed").length,
      skipped: integrationSummary.tests.filter((t) => t.status === "pending" || t.status === "skipped").length,
      tests: integrationSummary.tests,
    };

    console.log("\n=== 3/4 Pruebas de Sistema (Playwright) ===");
    runBin("playwright", ["test", "system"], {
      QA_API_URL: API_URL,
      PLAYWRIGHT_JSON_OUTPUT_NAME: "reports/system-final.json",
    });

    console.log("\n=== 4/4 Pruebas de Aceptación (Playwright) ===");
    runBin("playwright", ["test", "acceptance"], {
      QA_API_URL: API_URL,
      PLAYWRIGHT_JSON_OUTPUT_NAME: "reports/acceptance-final.json",
    });

    const unitSummary = parseVitestReport(path.join(reportsDir, "unit-final.json"));
    const systemSummary = parsePlaywrightReport(path.join(reportsDir, "system-final.json"));
    const acceptanceSummary = parsePlaywrightReport(path.join(reportsDir, "acceptance-final.json"));
    const crashes = fs.existsSync(path.join(reportsDir, "api-crashes.json"))
      ? JSON.parse(fs.readFileSync(path.join(reportsDir, "api-crashes.json"), "utf8"))
      : { restarts: 0, crashesCount: 0, crashes: [] };

    const summary = {
      generatedAt: new Date().toISOString(),
      totals: {
        total: unitSummary.total + integrationSummary.total + systemSummary.total + acceptanceSummary.total,
        passed: unitSummary.passed + integrationSummary.passed + systemSummary.passed + acceptanceSummary.passed,
        failed: unitSummary.failed + integrationSummary.failed + systemSummary.failed + acceptanceSummary.failed,
        skipped: unitSummary.skipped + integrationSummary.skipped + systemSummary.skipped + acceptanceSummary.skipped,
      },
      suites: {
        unit: unitSummary,
        integration: integrationSummary,
        system: systemSummary,
        acceptance: acceptanceSummary,
      },
      apiCrashes: crashes,
    };

    fs.writeFileSync(path.join(reportsDir, "qa-summary.json"), JSON.stringify(summary, null, 2), "utf8");
    console.log("\n=== RESUMEN CONSOLIDADO ===");
    console.log(JSON.stringify(summary.totals, null, 2));
    console.log("Crashes de API:", crashes.crashesCount, "Reinicios:", crashes.restarts);

    if (summary.totals.skipped > 0) {
      process.exitCode = 2;
    } else if (summary.totals.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (spawnedSupervisor) {
      spawnedSupervisor.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error("[run-all-qa] Error fatal:", err);
  process.exit(1);
});

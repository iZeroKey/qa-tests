import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(currentDir, "..", "..", "abc_inversiones_api");

export async function setup() {
  try {
    execSync("pnpm app:reset --confirm", { cwd: API_DIR, stdio: "pipe" });
    execSync("pnpm app:setup", { cwd: API_DIR, stdio: "pipe" });
  } catch (error) {
    console.error("Error en setup de pruebas:", error);
    throw error;
  }
}

export async function teardown() {}

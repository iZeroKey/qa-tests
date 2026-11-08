import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..", "..", "abc_inversiones_api");

console.log("Preparando base de datos de prueba...");
execSync("pnpm app:reset --confirm", { cwd: apiDir, stdio: "inherit" });
execSync("pnpm app:setup", { cwd: apiDir, stdio: "inherit" });
console.log("Base de datos lista.");
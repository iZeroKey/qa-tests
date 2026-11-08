import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Suprimir warnings de Node.js (MetadataLookupWarning, etc.)
process.env.NODE_NO_WARNINGS = "1";
process.noDeprecation = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", "..", "abc_inversiones_api", ".env");
dotenv.config({ path: envPath, quiet: true });
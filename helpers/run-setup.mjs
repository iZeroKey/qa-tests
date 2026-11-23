// Comprueba conectividad y usuarios base en PostgreSQL mediante SELECT (sin cambios DDL).
import { verifySeededUsersExist, getDbDeps } from "./db-dml.ts";

console.log("Verificando usuarios base en BD mediante DML/SELECT (sin modificar esquema)...");
try {
  const rows = await verifySeededUsersExist();
  console.log(`Usuarios base verificados (${rows.length}): ${rows.map((r) => `${r.email}[${r.role}]`).join(", ")}`);
} finally {
  const { queryClient } = await getDbDeps();
  await queryClient.end({ timeout: 5 }).catch(() => {});
}

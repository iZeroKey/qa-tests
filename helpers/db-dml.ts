// Utilidades DML para pruebas (solo SELECT/INSERT/DELETE; sin DDL) que preservan las cuentas base en PostgreSQL.
import dotenv from "dotenv";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "../../abc_inversiones_api");
const apiEnvPath = path.join(apiDir, ".env");
dotenv.config({ path: apiEnvPath, quiet: true });

const requireFromApi = createRequire(path.join(apiDir, "package.json"));
const postgres = requireFromApi("postgres") as typeof import("postgres");
const { createClient } = requireFromApi("@supabase/supabase-js") as typeof import("@supabase/supabase-js");

export const SEEDED_EMAILS = ["admin@abc.com", "client@abc.com", "investor@abc.com"] as const;
export const TEMP_USER_PASSWORD = "password123";

type RoleType = "admin" | "client" | "investor";

export type SeededUserRow = {
  id: string;
  email: string;
  role: RoleType;
  isOwner: boolean;
  firstName: string;
  lastName: string;
  publicCode: string | null;
};

let queryClientInstance: ReturnType<typeof postgres> | null = null;
let supabaseAdminInstance: ReturnType<typeof createClient> | null = null;

function getQueryClient() {
  if (!queryClientInstance) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL no está definida en abc_inversiones_api/.env");
    queryClientInstance = postgres(dbUrl, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 30,
      prepare: false,
    });
  }
  return queryClientInstance;
}

function getSupabaseAdmin() {
  if (!supabaseAdminInstance) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están definidas en abc_inversiones_api/.env");
    }
    supabaseAdminInstance = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdminInstance;
}

export async function getDbDeps() {
  return {
    queryClient: getQueryClient(),
    supabaseAdmin: getSupabaseAdmin(),
  };
}

export function parseStorageReference(value: string): { bucket: string; path: string } | null {
  if (!value.startsWith("storage://")) return null;
  const raw = value.slice("storage://".length);
  const slash = raw.indexOf("/");
  if (slash <= 0 || slash === raw.length - 1) return null;
  return { bucket: raw.slice(0, slash), path: raw.slice(slash + 1) };
}

async function generatePublicCodeForRole(role: RoleType): Promise<string> {
  const sql = getQueryClient();
  const map: Record<RoleType, { prefix: string; seq: string }> = {
    client: { prefix: "CL", seq: "client_public_code_seq" },
    investor: { prefix: "IN", seq: "investor_public_code_seq" },
    admin: { prefix: "AD", seq: "admin_public_code_seq" },
  };
  const spec = map[role];
  const rows = await sql.unsafe("SELECT nextval($1::regclass) AS value", [spec.seq]);
  const num = Number(rows[0]?.value);
  return `${spec.prefix}-${num.toString().padStart(5, "0")}`;
}

export async function verifySeededUsersExist() {
  const sql = getQueryClient();
  const rows = await sql`
    SELECT id, email, role, is_owner, active, deleted_at
    FROM users
    WHERE email = ANY(${[...SEEDED_EMAILS]}::text[])
  `;

  const byEmail = new Map(rows.map((r) => [r.email as string, r]));
  for (const email of SEEDED_EMAILS) {
    const row = byEmail.get(email);
    if (!row || !row.active || row.deleted_at) {
      throw new Error(
        `Usuario base faltante o inactivo: ${email}. Verifica los datos sembrados mediante DML (sin modificar tablas).`,
      );
    }
  }
  return rows;
}

export async function getUserRowByEmail(email: string): Promise<SeededUserRow> {
  const sql = getQueryClient();
  const [row] = await sql`
    SELECT id, email, role, is_owner, first_name, last_name, public_code
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;
  if (!row) {
    throw new Error(`Usuario no encontrado: ${email}`);
  }
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as RoleType,
    isOwner: Boolean(row.is_owner),
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    publicCode: (row.public_code as string | null) ?? null,
  };
}

export class TestCleanupTracker {
  userIds = new Set<string>();
  authUserIds = new Set<string>();
  userEmails = new Set<string>();
  loanIds = new Set<string>();
  paymentIds = new Set<string>();
  voucherIds = new Set<string>();
  accessRequestIds = new Set<string>();
  accessRequestEmails = new Set<string>();
  notificationIds = new Set<string>();
  storageRefs = new Set<string>();

  trackUser(userId?: string | null, authUserId?: string | null, email?: string | null) {
    if (userId) this.userIds.add(userId);
    if (authUserId) this.authUserIds.add(authUserId);
    if (email && !SEEDED_EMAILS.includes(email as (typeof SEEDED_EMAILS)[number])) {
      this.userEmails.add(email);
    }
  }

  trackLoan(loanId?: string | null) {
    if (loanId) this.loanIds.add(loanId);
  }

  trackPayment(paymentId?: string | null) {
    if (paymentId) this.paymentIds.add(paymentId);
  }

  trackVoucher(voucherId?: string | null) {
    if (voucherId) this.voucherIds.add(voucherId);
  }

  trackAccessRequest(id?: string | null, email?: string | null) {
    if (id) this.accessRequestIds.add(id);
    if (email) this.accessRequestEmails.add(email);
  }

  trackNotification(id?: string | null) {
    if (id) this.notificationIds.add(id);
  }

  trackStorageRef(ref?: string | null) {
    if (ref && ref.startsWith("storage://")) {
      this.storageRefs.add(ref);
    }
  }

  async cleanup(): Promise<void> {
    const sql = getQueryClient();
    const supabaseAdmin = getSupabaseAdmin();

    const tempEmails = [...this.userEmails].filter(
      (e) => !SEEDED_EMAILS.includes(e as (typeof SEEDED_EMAILS)[number]),
    );
    if (tempEmails.length > 0) {
      const extraUsers = await sql`
        SELECT id, auth_user_id, avatar_url
        FROM users
        WHERE email = ANY(${tempEmails}::text[])
      `;
      for (const u of extraUsers) {
        if (u.id) this.userIds.add(u.id as string);
        if (u.auth_user_id) this.authUserIds.add(u.auth_user_id as string);
        if (typeof u.avatar_url === "string") this.trackStorageRef(u.avatar_url);
      }
    }

    const seededRows = await sql`
      SELECT id FROM users WHERE email = ANY(${[...SEEDED_EMAILS]}::text[])
    `;
    const protectedUserIds = new Set(seededRows.map((r) => r.id as string));
    const tempUserIds = [...this.userIds].filter((id) => !protectedUserIds.has(id));

    const trackedLoanIds = new Set(this.loanIds);
    if (tempUserIds.length > 0) {
      const userLoans = await sql`
        SELECT id FROM loans
        WHERE client_id = ANY(${tempUserIds}::uuid[])
           OR investor_id = ANY(${tempUserIds}::uuid[])
      `;
      for (const l of userLoans) {
        trackedLoanIds.add(l.id as string);
      }
    }

    const loanIdArr = [...trackedLoanIds];
    const paymentIdArr = [...this.paymentIds];
    const voucherIdArr = [...this.voucherIds];

    if (voucherIdArr.length > 0 || loanIdArr.length > 0 || tempUserIds.length > 0) {
      const voucherRows = await sql`
        SELECT id, evidence_url FROM payment_vouchers
        WHERE id = ANY(${voucherIdArr}::uuid[])
           OR loan_id = ANY(${loanIdArr}::uuid[])
           OR client_id = ANY(${tempUserIds}::uuid[])
           OR processed_by_id = ANY(${tempUserIds}::uuid[])
      `;
      for (const v of voucherRows) {
        this.voucherIds.add(v.id as string);
        if (typeof v.evidence_url === "string") this.trackStorageRef(v.evidence_url);
      }
    }

    const allVoucherIds = [...this.voucherIds];

    if (
      paymentIdArr.length > 0 ||
      loanIdArr.length > 0 ||
      allVoucherIds.length > 0 ||
      tempUserIds.length > 0
    ) {
      const payRows = await sql`
        SELECT id, evidence_url FROM payments
        WHERE id = ANY(${paymentIdArr}::uuid[])
           OR loan_id = ANY(${loanIdArr}::uuid[])
           OR voucher_id = ANY(${allVoucherIds}::uuid[])
           OR registered_by_id = ANY(${tempUserIds}::uuid[])
      `;
      for (const p of payRows) {
        this.paymentIds.add(p.id as string);
        if (typeof p.evidence_url === "string") this.trackStorageRef(p.evidence_url);
      }
    }

    const allPaymentIds = [...this.paymentIds];

    if (tempUserIds.length > 0) {
      const userMeta = await sql`
        SELECT auth_user_id, avatar_url FROM users WHERE id = ANY(${tempUserIds}::uuid[])
      `;
      for (const u of userMeta) {
        if (u.auth_user_id) this.authUserIds.add(u.auth_user_id as string);
        if (typeof u.avatar_url === "string") this.trackStorageRef(u.avatar_url);
      }
    }

    // Elimina registros en orden inverso de claves foráneas para no dejar referencias huérfanas
    if (allPaymentIds.length > 0 || loanIdArr.length > 0 || allVoucherIds.length > 0 || tempUserIds.length > 0) {
      await sql`
        DELETE FROM payments
        WHERE id = ANY(${allPaymentIds}::uuid[])
           OR loan_id = ANY(${loanIdArr}::uuid[])
           OR voucher_id = ANY(${allVoucherIds}::uuid[])
           OR registered_by_id = ANY(${tempUserIds}::uuid[])
      `;
    }

    if (allVoucherIds.length > 0 || loanIdArr.length > 0 || tempUserIds.length > 0) {
      await sql`
        DELETE FROM payment_vouchers
        WHERE id = ANY(${allVoucherIds}::uuid[])
           OR loan_id = ANY(${loanIdArr}::uuid[])
           OR client_id = ANY(${tempUserIds}::uuid[])
           OR processed_by_id = ANY(${tempUserIds}::uuid[])
      `;
    }

    if (loanIdArr.length > 0) {
      await sql`
        DELETE FROM installments
        WHERE loan_id = ANY(${loanIdArr}::uuid[])
      `;
      await sql`
        DELETE FROM loans
        WHERE id = ANY(${loanIdArr}::uuid[])
      `;
    }

    const notifIds = [...this.notificationIds];
    if (notifIds.length > 0 || tempUserIds.length > 0) {
      await sql`
        DELETE FROM notifications
        WHERE id = ANY(${notifIds}::uuid[])
           OR user_id = ANY(${tempUserIds}::uuid[])
      `;
    }
    for (const lid of loanIdArr) {
      await sql`
        DELETE FROM notifications WHERE data LIKE ${`%${lid}%`}
      `;
    }

    const entityIds = [...loanIdArr, ...allPaymentIds, ...allVoucherIds, ...this.accessRequestIds, ...tempUserIds];
    if (tempUserIds.length > 0 || entityIds.length > 0) {
      await sql`
        DELETE FROM audit_logs
        WHERE user_id = ANY(${tempUserIds}::uuid[])
           OR entity_id = ANY(${entityIds}::text[])
      `;
    }

    const reqIds = [...this.accessRequestIds];
    const reqEmails = [...this.accessRequestEmails];
    if (reqIds.length > 0 || reqEmails.length > 0) {
      await sql`
        DELETE FROM access_requests
        WHERE id = ANY(${reqIds}::uuid[])
           OR email = ANY(${reqEmails}::text[])
      `;
    }

    if (tempUserIds.length > 0) {
      await sql`
        DELETE FROM users
        WHERE id = ANY(${tempUserIds}::uuid[])
          AND (email IS NULL OR email <> ALL(${[...SEEDED_EMAILS]}::text[]))
      `;
    }

    const byBucket = new Map<string, string[]>();
    for (const ref of this.storageRefs) {
      const parsed = parseStorageReference(ref);
      if (parsed) {
        const list = byBucket.get(parsed.bucket) ?? [];
        list.push(parsed.path);
        byBucket.set(parsed.bucket, list);
      }
    }
    for (const [bucket, paths] of byBucket.entries()) {
      await supabaseAdmin.storage.from(bucket).remove(paths).catch(() => {});
    }

    for (const authId of this.authUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {});
    }
  }
}

// Crea un usuario temporal (con cuenta Auth opcional) y lo registra en tracker para su limpieza posterior.
export async function createTempUser(
  tracker: TestCleanupTracker,
  opts: {
    role: RoleType;
    firstName: string;
    lastName: string;
    email?: string;
    password?: string;
    withAuth?: boolean;
    active?: boolean;
    isOwner?: boolean;
    phone?: string;
  },
) {
  const sql = getQueryClient();
  const supabaseAdmin = getSupabaseAdmin();
  const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const email = opts.email ?? `qa.${opts.role}.${suffix}@abc.com`;
  const password = opts.password ?? TEMP_USER_PASSWORD;
  const phone = opts.phone ?? `+519${Math.floor(10000000 + Math.random() * 89999999)}`;

  let authUserId: string | null = null;
  if (opts.withAuth !== false) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      phone,
      phone_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Error creando Auth temporal (${email}): ${error?.message ?? "sin user"}`);
    }
    authUserId = data.user.id;
    tracker.authUserIds.add(authUserId);
  }

  const publicCode = await generatePublicCodeForRole(opts.role);
  const [inserted] = await sql`
    INSERT INTO users (
      auth_user_id, public_code, first_name, last_name, email, phone,
      role, is_owner, active
    )
    VALUES (
      ${authUserId},
      ${publicCode},
      ${opts.firstName},
      ${opts.lastName},
      ${email},
      ${phone},
      ${opts.role},
      ${Boolean(opts.isOwner)},
      ${opts.active ?? true}
    )
    RETURNING id, auth_user_id, public_code, email, role, is_owner
  `;

  tracker.trackUser(inserted.id as string, authUserId, email);

  return {
    id: inserted.id as string,
    authUserId,
    email,
    password,
    role: inserted.role as RoleType,
    isOwner: Boolean(inserted.is_owner),
    publicCode: inserted.public_code as string,
  };
}

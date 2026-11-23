// Pruebas unitarias de generación y compactación de claves de caché para TanStack Query.
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";

describe("query-keys", () => {
  // CP-U105
  it("usa scope guest/anonymous cuando no hay usuario autenticado", () => {
    expect(queryKeys.dashboard.admin()).toEqual([
      "abc",
      "dashboard",
      "admin",
      { role: "guest", userId: "anonymous" },
    ]);
    expect(queryKeys.profile.me(undefined)).toEqual([
      "abc",
      "profile",
      "me",
      { role: "guest", userId: "anonymous" },
    ]);
  });

  // CP-U106
  it("compacta parametros omitiendo vacios, null y undefined", () => {
    const scope = { role: "admin", userId: "u-1" };
    expect(
      queryKeys.loans.list(scope, { page: 1, limit: 10, search: "", status: undefined }),
    ).toEqual(["abc", "loans", "list", { role: "admin", userId: "u-1" }, { page: 1, limit: 10 }]);

    expect(
      queryKeys.audit.logs(scope, { action: "", module: "LOANS", page: 2, userId: undefined }),
    ).toEqual(["abc", "audit", "logs", { role: "admin", userId: "u-1" }, { module: "LOANS", page: 2 }]);
  });

  // CP-U107
  it("genera llaves diferenciadas para pagos, vouchers, transacciones, notificaciones y usuarios", () => {
    const scope = { role: "client", userId: "c-1" };
    expect(queryKeys.payments.list(scope, "l-1", { method: "cash" })).toEqual([
      "abc",
      "payments",
      "list",
      scope,
      "l-1",
      { method: "cash" },
    ]);
    expect(queryKeys.vouchers.list(scope, "l-1", { q: "OP1" })).toEqual([
      "abc",
      "vouchers",
      "list",
      scope,
      "l-1",
      { q: "OP1" },
    ]);
    expect(queryKeys.transactions.list(scope, "l-1", { page: 1 })).toEqual([
      "abc",
      "transactions",
      "list",
      scope,
      "l-1",
      { page: 1 },
    ]);
    expect(queryKeys.notifications.unreadCount(scope)).toEqual([
      "abc",
      "notifications",
      "unread-count",
      scope,
    ]);
    expect(queryKeys.users.accessRequests(scope)).toEqual(["abc", "users", "access-requests", scope]);
  });
});

// Pruebas unitarias de utilidades, normalizadores y restricciones de gestión de usuarios.
import { describe, expect, it, vi } from "vitest";
import {
  buildUserPayload,
  canLinkAuthAccount,
  canManageUser,
  canUseAdministrativeUpdate,
  createUser,
  displayPersonName,
  formatDate,
  formatPhoneNumber,
  generateTemporaryPassword,
  getMaritalStatusLabel,
  getRequestStatusLabel,
  getRoleLabel,
  getUserEditPermissions,
  initials,
  isPendingRequest,
  linkAuthAccount,
  normalizeRequestStatus,
  normalizeRole,
  normalizeSearch,
  nullableText,
  parsePhoneDisplay,
  reviewAccessRequest,
  serializeBankAccounts,
  updateUser,
  type ManagedUser,
  type UserFormState,
} from "@/pages/users/utils";

const form: UserFormState = {
  firstName: " Ana ",
  lastName: " Pérez ",
  email: "ana@example.com",
  phone: "987654321",
  role: "client",
  dni: " 12345678 ",
  address: " Lima ",
  bank: " BCP ",
  bankAccounts: [" 001 ", "", "002"],
  maritalStatus: "none",
  active: true,
  createAuthAccount: false,
  password: "",
};

const target: ManagedUser = { id: "user-2", role: "client", active: true };

describe("users utils", () => {
  // CP-U111
  it("normaliza formularios de usuario respetando permisos", () => {
    expect(buildUserPayload(form, { canUpdateAdministrativeFields: true, canUpdateActive: true })).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      phone: "+51 987654321",
      email: "ana@example.com",
      dni: "12345678",
      address: "Lima",
      bank: "BCP",
      bankAccounts: ["001", "002"],
      maritalStatus: null,
      active: true,
    });
    expect(buildUserPayload(form, { canUpdateAdministrativeFields: false, canUpdateActive: false }).email).toBeUndefined();
  });

  // CP-U112
  it("formatea y normaliza teléfono, rol y búsqueda", () => {
    expect(formatPhoneNumber("+51 987-654-3210")).toBe("519 876 543");
    expect(parsePhoneDisplay("+51 987 654 321")).toBe("987654321");
    expect(normalizeRole("desconocido")).toBe("client");
    expect(normalizeSearch("  ÁNÁ Pérez ")).toBe("ana perez");
    expect(displayPersonName({ firstName: "Ana", lastName: "Pérez" })).toBe("Ana Pérez");
  });

  // CP-U113
  it("aplica permisos de administración sin permitir editar al dueño", () => {
    const admin = { id: "admin-1", role: "admin" };
    expect(canManageUser(admin, target)).toBe(true);
    expect(canUseAdministrativeUpdate(admin, target)).toBe(true);
    expect(getUserEditPermissions(admin, target)).toEqual({
      canUpdateAdministrativeFields: true,
      canUpdateActive: true,
    });
    expect(canManageUser(admin, { ...target, isOwner: true })).toBe(false);
    expect(canLinkAuthAccount(admin, { ...target, authUserId: "auth-1" })).toBe(false);
  });

  // CP-U114
  it("envía la revisión de una solicitud con el payload correcto", async () => {
    const fetchWithAuth = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: "request-1" } }), { status: 200 }),
    );
    await expect(reviewAccessRequest(fetchWithAuth, "request-1", "approved", "  aprobado  ", "password123"))
      .resolves.toMatchObject({ data: { id: "request-1" } });
    expect(fetchWithAuth).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/access-requests/request-1/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "approved", observation: "aprobado", initialPassword: "password123" }),
      }),
    );
  });

  // CP-U115
  it("generateTemporaryPassword genera contraseña segura de 14 caracteres con simbolo y digito", () => {
    vi.stubGlobal("window", { crypto: globalThis.crypto });
    try {
      const pwd = generateTemporaryPassword();
      expect(pwd).toHaveLength(14);
      expect(pwd).toMatch(/[!@#$%&*]\d$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // CP-U116
  it("etiquetas de estado, rol, estado civil e iniciales manejan faltantes", () => {
    expect(nullableText("   ")).toBeNull();
    expect(serializeBankAccounts(null)).toEqual([""]);
    expect(normalizeRequestStatus(undefined)).toBe("pending");
    expect(getRequestStatusLabel("in_review")).toBe("En revisión");
    expect(getRoleLabel("investor")).toBe("Inversionista");
    expect(getMaritalStatusLabel("married")).toBe("Casado/a");
    expect(getMaritalStatusLabel(null)).toBe("Sin registrar");
    expect(initials({ firstName: "Ana", lastName: "Pérez" })).toBe("AP");
    expect(initials({ email: "zoe@abc.com" })).toBe("Z");
    expect(isPendingRequest("pending")).toBe(true);
    expect(isPendingRequest("approved")).toBe(false);
    expect(formatDate("bad")).toBe("-");
  });

  // CP-U117
  it("owner puede gestionar admin no-owner pero admin no puede vincular auth a otro admin", () => {
    const owner = { id: "owner-1", role: "admin", isOwner: true };
    const adminTarget: ManagedUser = { id: "admin-2", role: "admin", isOwner: false, authUserId: null };
    expect(canManageUser(owner, adminTarget)).toBe(true);
    expect(canManageUser({ id: "admin-1", role: "admin" }, adminTarget)).toBe(false);
    expect(canLinkAuthAccount(owner, adminTarget)).toBe(false);
    expect(canLinkAuthAccount({ id: "admin-1", role: "admin" }, { ...target, authUserId: null })).toBe(true);
  });

  // CP-U118
  it("createUser, updateUser y linkAuthAccount envian los endpoints y cuerpos esperados", async () => {
    const fetchWithAuth = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, data: { id: "u-new" } }), { status: 201 }),
    );
    await createUser(fetchWithAuth, { ...form, role: "admin", createAuthAccount: false, password: "secret" });
    expect(fetchWithAuth).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/users",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"createAuthAccount":true'),
      }),
    );

    await updateUser(fetchWithAuth, "u-1", form, { canUpdateAdministrativeFields: false, canUpdateActive: false });
    expect(fetchWithAuth).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/users/u-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    await linkAuthAccount(fetchWithAuth, "u-1", { email: "  a@abc.com ", password: "password123" });
    expect(fetchWithAuth).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/users/u-1/auth-account",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@abc.com", password: "password123" }),
      }),
    );
  });
});

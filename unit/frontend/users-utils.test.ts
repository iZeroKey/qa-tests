import { describe, expect, it, vi } from "vitest";
import {
  buildUserPayload,
  canLinkAuthAccount,
  canManageUser,
  canUseAdministrativeUpdate,
  displayPersonName,
  formatPhoneNumber,
  getUserEditPermissions,
  normalizeRole,
  normalizeSearch,
  parsePhoneDisplay,
  reviewAccessRequest,
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
  // CP-U60
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

  // CP-U61
  it("formatea y normaliza teléfono, rol y búsqueda", () => {
    expect(formatPhoneNumber("+51 987-654-3210")).toBe("519 876 543");
    expect(parsePhoneDisplay("+51 987 654 321")).toBe("987654321");
    expect(normalizeRole("desconocido")).toBe("client");
    expect(normalizeSearch("  ÁNÁ Pérez ")).toBe("ana perez");
    expect(displayPersonName({ firstName: "Ana", lastName: "Pérez" })).toBe("Ana Pérez");
  });

  // CP-U62
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

  // CP-U63
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
});

// Pruebas unitarias de validación MIME y resolución de URLs para avatares de usuario.
import { describe, expect, it } from "vitest";
import {
  ACCEPTED_AVATAR_MIME_TYPES,
  MAX_AVATAR_UPLOAD_SIZE,
  isAcceptedAvatarMimeType,
  resolveAvatarUrl,
  validateAvatarFile,
} from "@/lib/avatar-image";

describe("avatar-image", () => {
  // CP-U76
  it("valida tipos MIME permitidos para avatares", () => {
    expect(ACCEPTED_AVATAR_MIME_TYPES).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(MAX_AVATAR_UPLOAD_SIZE).toBe(2 * 1024 * 1024);
    expect(isAcceptedAvatarMimeType("image/png")).toBe(true);
    expect(isAcceptedAvatarMimeType("image/jpeg")).toBe(true);
    expect(isAcceptedAvatarMimeType("image/webp")).toBe(true);
    expect(isAcceptedAvatarMimeType("image/gif")).toBe(false);
    expect(isAcceptedAvatarMimeType("application/pdf")).toBe(false);
  });

  // CP-U77
  it("validateAvatarFile devuelve null si es valido y mensaje en formato no permitido", () => {
    expect(validateAvatarFile({ type: "image/webp" } as File)).toBeNull();
    expect(validateAvatarFile({ type: "text/plain" } as File)).toContain("Formato no permitido");
  });

  // CP-U78
  it("resolveAvatarUrl filtra storage:// y resuelve rutas relativas y absolutas", () => {
    expect(resolveAvatarUrl(null)).toBeUndefined();
    expect(resolveAvatarUrl(undefined)).toBeUndefined();
    expect(resolveAvatarUrl("storage://avatars/u1/avatar.png")).toBeUndefined();
    expect(resolveAvatarUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(resolveAvatarUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(resolveAvatarUrl("blob:http://localhost:5173/123")).toBe("blob:http://localhost:5173/123");
    expect(resolveAvatarUrl("/uploads/avatar.png")).toBe("http://localhost:3000/uploads/avatar.png");
  });
});

// Pruebas unitarias de parseo seguro de referencias storage:// internas.
import { describe, it, expect } from "vitest";
import {
  STORAGE_REF_PREFIX,
  parseStorageReference,
} from "../../../abc_inversiones_api/src/utils/storage.util.js";

describe("storage.util parseStorageReference", () => {
  // CP-U57
  it("extrae bucket y path de referencias storage:// validas", () => {
    expect(STORAGE_REF_PREFIX).toBe("storage://");
    expect(parseStorageReference("storage://vouchers/receipts/loan-1/img.webp")).toEqual({
      bucket: "vouchers",
      path: "receipts/loan-1/img.webp",
    });
    expect(parseStorageReference("storage://avatars/u1/avatar.png")).toEqual({
      bucket: "avatars",
      path: "u1/avatar.png",
    });
  });

  // CP-U58
  it("devuelve null para URLs externas o referencias malformadas", () => {
    expect(parseStorageReference("https://cdn.example.com/a.png")).toBeNull();
    expect(parseStorageReference("storage://vouchers/")).toBeNull();
    expect(parseStorageReference("storage:///a.png")).toBeNull();
    expect(parseStorageReference("storage://vouchers")).toBeNull();
    expect(parseStorageReference("")).toBeNull();
  });
});

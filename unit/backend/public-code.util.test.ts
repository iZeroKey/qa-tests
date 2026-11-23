// Pruebas unitarias de formato, lectura y mapeo por rol de códigos públicos.
import { describe, it, expect } from "vitest";
import {
  formatPublicCode,
  parsePublicCodeNumber,
  publicCodeKindForRole,
} from "../../../abc_inversiones_api/src/utils/public-code.util.js";

describe("formatPublicCode", () => {
  // CP-U41
  it("formatea codigo con prefijo y padding", () => {
    expect(formatPublicCode("loan", 1)).toBe("PR-00001");
    expect(formatPublicCode("client", 42)).toBe("CL-00042");
    expect(formatPublicCode("investor", 7)).toBe("IN-00007");
    expect(formatPublicCode("admin", 99999)).toBe("AD-99999");
  });
  // CP-U42
  it("rechaza valores fuera de rango o no enteros", () => {
    expect(() => formatPublicCode("loan", 0)).toThrow();
    expect(() => formatPublicCode("loan", -1)).toThrow();
    expect(() => formatPublicCode("loan", 100000)).toThrow();
    expect(() => formatPublicCode("loan", 1.5)).toThrow();
  });
});

describe("parsePublicCodeNumber", () => {
  // CP-U43
  it("extrae numero del codigo", () => {
    expect(parsePublicCodeNumber("PR-00001")).toBe(1);
    expect(parsePublicCodeNumber("CL-00042", "client")).toBe(42);
    expect(parsePublicCodeNumber("IN-00100", "investor")).toBe(100);
  });
  // CP-U44
  it("devuelve 0 si no coincide", () => {
    expect(parsePublicCodeNumber(null)).toBe(0);
    expect(parsePublicCodeNumber(undefined)).toBe(0);
    expect(parsePublicCodeNumber("INVALID")).toBe(0);
    expect(parsePublicCodeNumber("pr-00001")).toBe(0);
    expect(parsePublicCodeNumber("PR-00001", "client")).toBe(0);
  });
});

describe("publicCodeKindForRole", () => {
  // CP-U45
  it("mapea rol a kind", () => {
    expect(publicCodeKindForRole("client")).toBe("client");
    expect(publicCodeKindForRole("investor")).toBe("investor");
    expect(publicCodeKindForRole("admin")).toBe("admin");
  });
});

import { describe, it, expect } from "vitest";
import {
  formatPublicCode,
  parsePublicCodeNumber,
  publicCodeKindForRole,
} from "../../../abc_inversiones_api/src/utils/public-code.util.js";

describe("formatPublicCode", () => {
  it("formatea codigo con prefijo y padding", () => {
    expect(formatPublicCode("loan", 1)).toBe("PR-00001");
    expect(formatPublicCode("client", 42)).toBe("CL-00042");
  });
  it("rechaza valores fuera de rango", () => {
    expect(() => formatPublicCode("loan", 0)).toThrow();
    expect(() => formatPublicCode("loan", 100000)).toThrow();
  });
});

describe("parsePublicCodeNumber", () => {
  it("extrae numero del codigo", () => {
    expect(parsePublicCodeNumber("PR-00001")).toBe(1);
    expect(parsePublicCodeNumber("CL-00042", "client")).toBe(42);
  });
  it("devuelve 0 si no coincide", () => {
    expect(parsePublicCodeNumber(null)).toBe(0);
    expect(parsePublicCodeNumber("INVALID")).toBe(0);
    expect(parsePublicCodeNumber("PR-00001", "client")).toBe(0);
  });
});

describe("publicCodeKindForRole", () => {
  it("mapea rol a kind", () => {
    expect(publicCodeKindForRole("client")).toBe("client");
    expect(publicCodeKindForRole("investor")).toBe("investor");
    expect(publicCodeKindForRole("admin")).toBe("admin");
  });
});

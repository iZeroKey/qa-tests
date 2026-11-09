import { describe, it, expect } from "vitest";
import {
  PaginationParams,
  UUIDParam,
  parsePositiveInt,
  DateRangeFromTo,
} from "../../../abc_inversiones_api/src/utils/validation.util.js";

describe("PaginationParams", () => {
  // CP-U27
  it("defaults page=1 limit=20", () => {
    const r = PaginationParams.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
  });
  // CP-U28
  it("rechaza page < 1", () => {
    expect(() => PaginationParams.parse({ page: 0 })).toThrow();
  });
});

describe("UUIDParam", () => {
  // CP-U29
  it("acepta UUID valido", () => {
    expect(() => UUIDParam.parse({ id: "123e4567-e89b-12d3-a456-426614174000" })).not.toThrow();
  });
  // CP-U30
  it("rechaza UUID invalido", () => {
    expect(() => UUIDParam.parse({ id: "no-uuid" })).toThrow();
  });
});

describe("parsePositiveInt", () => {
  // CP-U31
  it("parsea string numerico", () => {
    expect(parsePositiveInt("5", 1)).toBe(5);
  });
  // CP-U32
  it("usa fallback si invalido", () => {
    expect(parsePositiveInt("abc", 3)).toBe(3);
    expect(parsePositiveInt(undefined, 2)).toBe(2);
  });
  // CP-U33
  it("respeta max", () => {
    expect(parsePositiveInt("100", 1, 10)).toBe(10);
  });
  // CP-U34
  it("rechaza <= 0", () => {
    expect(parsePositiveInt("0", 5)).toBe(5);
    expect(parsePositiveInt("-3", 5)).toBe(5);
  });
});

describe("DateRangeFromTo", () => {
  // CP-U35
  it("acepta from/to opcionales", () => {
    const r = DateRangeFromTo.parse({});
    expect(r.from).toBeUndefined();
    expect(r.to).toBeUndefined();
  });
});

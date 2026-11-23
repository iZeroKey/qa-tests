// Pruebas unitarias de esquemas auxiliares de paginación, UUID, enteros y rangos de fecha.
import { describe, it, expect } from "vitest";
import {
  PaginationParams,
  PaginationParamsMax,
  UUIDParam,
  UUIDRouteParam,
  DateRangeParams,
  SearchParams,
  parsePositiveInt,
  DateRangeFromTo,
} from "../../../abc_inversiones_api/src/utils/validation.util.js";

describe("PaginationParams", () => {
  // CP-U59
  it("defaults page=1 limit=20", () => {
    const r = PaginationParams.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
  });
  // CP-U60
  it("rechaza page < 1", () => {
    expect(() => PaginationParams.parse({ page: 0 })).toThrow();
  });
  // CP-U61
  it("PaginationParamsMax limita el maximo permitido", () => {
    const schema = PaginationParamsMax(50);
    expect(schema.parse({ page: "2", limit: "50" })).toEqual({ page: 2, limit: 50 });
    expect(() => schema.parse({ limit: 51 })).toThrow();
  });
});

describe("UUIDParam", () => {
  // CP-U62
  it("acepta UUID valido", () => {
    expect(() => UUIDParam.parse({ id: "123e4567-e89b-12d3-a456-426614174000" })).not.toThrow();
  });
  // CP-U63
  it("rechaza UUID invalido", () => {
    expect(() => UUIDParam.parse({ id: "no-uuid" })).toThrow();
  });
  // CP-U64
  it("UUIDRouteParam valida campos parametrizados", () => {
    const schema = UUIDRouteParam("loanId");
    expect(() => schema.parse({ loanId: "123e4567-e89b-12d3-a456-426614174000" })).not.toThrow();
    expect(() => schema.parse({ loanId: "bad-id" })).toThrow();
  });
});

describe("parsePositiveInt", () => {
  // CP-U65
  it("parsea string numerico", () => {
    expect(parsePositiveInt("5", 1)).toBe(5);
  });
  // CP-U66
  it("usa fallback si invalido", () => {
    expect(parsePositiveInt("abc", 3)).toBe(3);
    expect(parsePositiveInt(undefined, 2)).toBe(2);
    expect(parsePositiveInt(["12", "99"], 1)).toBe(12);
    expect(parsePositiveInt(123, 7)).toBe(7);
  });
  // CP-U67
  it("respeta max", () => {
    expect(parsePositiveInt("100", 1, 10)).toBe(10);
  });
  // CP-U68
  it("rechaza <= 0", () => {
    expect(parsePositiveInt("0", 5)).toBe(5);
    expect(parsePositiveInt("-3", 5)).toBe(5);
  });
});

describe("DateRangeFromTo y SearchParams", () => {
  // CP-U69
  it("acepta from/to opcionales", () => {
    const r = DateRangeFromTo.parse({});
    expect(r.from).toBeUndefined();
    expect(r.to).toBeUndefined();
  });
  // CP-U70
  it("DateRangeParams valida ISO con offset y SearchParams respeta max 100", () => {
    expect(DateRangeParams.parse({ from: "2026-01-01T00:00:00-05:00" }).from).toBe("2026-01-01T00:00:00-05:00");
    expect(() => DateRangeParams.parse({ from: "fecha-mala" })).toThrow();
    expect(SearchParams.parse({ q: "PR-00001" }).q).toBe("PR-00001");
    expect(() => SearchParams.parse({ search: "x".repeat(101) })).toThrow();
  });
});

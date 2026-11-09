import { describe, expect, it } from "vitest";
import {
  getAppBackTarget,
  getBackTargetPath,
  getCameFromHome,
  getPopBackTargetPath,
  getRouteDepth,
  getRouteKey,
  getSectionNavigationState,
  homePath,
  shouldReplaceSectionNavigation,
} from "@/lib/navigation";

describe("navigation helpers", () => {
  // CP-U53
  it("calcula profundidad y clave de ruta", () => {
    expect(getRouteDepth("/users/requests")).toBe(2);
    expect(getRouteKey({ pathname: "/loans" })).toBe("/loans");
  });

  // CP-U54
  it("valida el estado de navegación sin confiar en datos inválidos", () => {
    expect(getAppBackTarget(null)).toBeNull();
    expect(getAppBackTarget({ appBackTarget: "/loans" })).toBe("/loans");
    expect(getAppBackTarget({ appBackTarget: 42 })).toBeNull();
    expect(getCameFromHome({ cameFromHome: true })).toBe(true);
    expect(getCameFromHome({ cameFromHome: "true" })).toBe(false);
  });

  // CP-U55
  it("resuelve destinos de regreso por ruta, estado y home", () => {
    expect(getBackTargetPath("/requests")).toBe("/users");
    expect(getBackTargetPath("/profile", { appBackTarget: "/loans" })).toBe("/loans");
    expect(getBackTargetPath("/profile")).toBe(homePath);
    expect(getPopBackTargetPath("/requests")).toBe("/users");
    expect(getPopBackTargetPath("/profile")).toBeNull();
  });

  // CP-U56
  it("decide cuándo reemplazar navegación móvil", () => {
    expect(shouldReplaceSectionNavigation("/home", "/home", true)).toBe(false);
    expect(shouldReplaceSectionNavigation("/home", "/loans", false)).toBe(false);
    expect(shouldReplaceSectionNavigation("/home", "/loans", true)).toBe(false);
    expect(shouldReplaceSectionNavigation("/loans", "/users", true)).toBe(true);
    expect(shouldReplaceSectionNavigation("/loans", "/home", true)).toBe(true);
  });

  // CP-U57
  it("construye el estado de navegación móvil", () => {
    expect(getSectionNavigationState("/home", "/loans", false)).toBeUndefined();
    expect(getSectionNavigationState("/home", "/home", true)).toBeUndefined();
    expect(getSectionNavigationState("/home", "/loans", true)).toEqual({
      appBackTarget: "/home",
      cameFromHome: true,
    });
  });
});

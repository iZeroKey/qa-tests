import { describe, it, expect } from "vitest";
import { z } from "zod";
import { formatZodError } from "../../../abc_inversiones_api/src/utils/response.util.js";

describe("formatZodError", () => {
  it("formatea issues con path y message", () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const formatted = formatZodError(result.error);
    expect(formatted).toHaveLength(1);
    expect(formatted[0].path).toBe("email");
    expect(formatted[0].message).toBeTruthy();
  });
});

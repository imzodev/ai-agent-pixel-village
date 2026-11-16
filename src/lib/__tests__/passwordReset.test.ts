import { describe, expect, it } from "vitest";
import { EMAIL_MAX, emailProblem, normalizeEmail, resetEmail } from "@/lib/passwordReset";
import { isResetToken, newResetToken, tokenHash } from "@/lib/resetToken";

describe("recovery emails", () => {
  it("are optional, trimmed and lower-cased", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("must look like an address", () => {
    expect(emailProblem("ada@example.com")).toBeNull();
    expect(emailProblem("ada.l+groove@mail.example.co.uk")).toBeNull();
    for (const bad of ["ada", "ada@", "@example.com", "ada@example", "a b@example.com", "<ada@example.com>", `${"a".repeat(EMAIL_MAX)}@x.com`]) {
      expect(emailProblem(bad), bad).not.toBeNull();
    }
  });
});

describe("reset links", () => {
  it("only a hash of the token is stored", () => {
    const t = "a".repeat(64);
    expect(tokenHash(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(t)).not.toBe(t);
    expect(tokenHash(t)).toBe(tokenHash(t));
    const fresh = newResetToken();
    expect(isResetToken(fresh)).toBe(true);
    expect(fresh).not.toBe(newResetToken());
    expect(isResetToken("../etc")).toBe(false);
  });

  it("the email lists every character with its own link, escaped", () => {
    const m = resetEmail("ada@example.com", [
      { username: "ada", url: "https://thegroove.fun/reset?token=1" },
      { username: "ada_<b>", url: "https://thegroove.fun/reset?token=2" },
    ]);
    expect(m.to).toBe("ada@example.com");
    expect(m.text).toContain("ada: https://thegroove.fun/reset?token=1");
    expect(m.text).toContain("these characters");
    expect(m.html).toContain("ada_&#60;b&#62;");
    expect(m.html).not.toContain("<b>ada_<b>");
    expect(resetEmail("x@y.zz", [{ username: "solo", url: "u" }]).text).toContain("your character");
  });
});

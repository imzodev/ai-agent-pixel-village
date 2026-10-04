// Admin endpoints: only a request carrying the configured token gets in;
// with no (or a weak) token configured, nobody does.
import { afterEach, describe, expect, it } from "vitest";
import { isAdmin } from "@/lib/adminAuth";

const req = (token?: string) => new Request("http://x/api/nav/trip", { headers: token ? { "x-admin-token": token } : {} });
const GOOD = "a".repeat(40);

describe("admin token", () => {
  const saved = process.env.ADMIN_TOKEN;
  afterEach(() => { process.env.ADMIN_TOKEN = saved; });
  it("is closed when no token is configured, even to a request with one", () => {
    delete process.env.ADMIN_TOKEN;
    expect(isAdmin(req(GOOD))).toBe(false);
    expect(isAdmin(req(""))).toBe(false);
  });
  it("refuses a short configured token", () => {
    process.env.ADMIN_TOKEN = "short";
    expect(isAdmin(req("short"))).toBe(false);
  });
  it("lets in only the exact token", () => {
    process.env.ADMIN_TOKEN = GOOD;
    expect(isAdmin(req(GOOD))).toBe(true);
    expect(isAdmin(req())).toBe(false);
    expect(isAdmin(req(GOOD + "x"))).toBe(false);
    expect(isAdmin(req("b".repeat(40)))).toBe(false);
  });
});

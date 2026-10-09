import { describe, expect, it } from "vitest";
import { isBlockedIp, webhookUrlProblem } from "@/lib/safeUrl";

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.5", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "240.0.0.1", "198.18.0.7",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "2001:db8::1",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe("webhookUrlProblem", () => {
  it("accepts a public https hostname", () => {
    expect(webhookUrlProblem("https://agent.example.com/grove")).toBeNull();
  });

  it.each([
    ["http://agent.example.com/x", "webhook must use https"],
    ["https://user:pw@agent.example.com/", "webhook URL must not contain credentials"],
    ["https://127.0.0.1/x", "webhook address is not public"],
    ["https://169.254.169.254/latest/meta-data", "webhook address is not public"],
    ["https://[::1]/x", "webhook address is not public"],
    ["https://localhost/x", "webhook host is not public"],
    ["https://intranet/x", "webhook host is not public"],
    ["https://db.internal/x", "webhook host is not public"],
    ["https://agent.example.com:8443/x", "webhook must use the default https port"],
    ["not a url", "not a URL"],
  ])("refuses %s", (url, reason) => {
    expect(webhookUrlProblem(url)).toBe(reason);
  });
});

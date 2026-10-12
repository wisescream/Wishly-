import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIpv4, isPrivateOrReservedIpv6, validateProductFetchUrl } from "./url-security.ts";

describe("product URL SSRF validation", () => {
  const publicResolver = async (_host: string, type: "A" | "AAAA") => type === "A" ? ["93.184.216.34"] : ["2606:2800:220:1:248:1893:25c8:1946"];

  it("rejects local, private, reserved, credentialed, and non-web URLs", async () => {
    for (const value of ["file:///etc/passwd", "http://user:pass@shop.example/item", "http://localhost/", "http://printer.localhost/", "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/", "http://10.0.0.2/", "http://169.254.169.254/latest/meta-data/", "http://192.168.1.5/", "http://224.0.0.1/", "http://[::1]/", "http://[fd00::1]/", "http://[ff02::1]/", "https://shop.example:8443/item"]) {
      const result = await validateProductFetchUrl(value, publicResolver);
      expect(result.safe, value).toBe(false);
    }
  });

  it("rejects hostnames with any private or reserved DNS answer", async () => {
    const resolver = async (_host: string, type: "A" | "AAAA") => type === "A" ? ["93.184.216.34"] : ["fe80::1"];
    expect((await validateProductFetchUrl("https://shop.example/item", resolver)).safe).toBe(false);
    expect((await validateProductFetchUrl("https://shop.example/item", async () => [])).error).toMatch(/resolved safely/i);
  });

  it("permits public destinations and classifies mapped and multicast IPv6", async () => {
    expect((await validateProductFetchUrl("https://shop.example/item", publicResolver)).safe).toBe(true);
    expect(isPrivateOrReservedIpv4("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv6("::ffff:192.168.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv6("ff02::1")).toBe(true);
    expect(isPrivateOrReservedIpv6("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
    expect(isPrivateOrReservedIpv6("2001:db8::1")).toBe(true);
    expect(isPrivateOrReservedIpv6("2001:0db8::1")).toBe(true);
    expect(isPrivateOrReservedIpv6("2001:2::1")).toBe(true);
  });
});

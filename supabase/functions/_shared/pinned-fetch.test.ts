import { describe, expect, it } from "vitest";
import { fetchPinnedProductPage, type PinnedFetchTransport, type PinnedSocket } from "./pinned-fetch.ts";

function socketFor(responseText: string, requests: string[], fragmentSize = 128): PinnedSocket {
  const response = new TextEncoder().encode(responseText);
  let offset = 0;
  return {
    async write(bytes) { requests.push(new TextDecoder().decode(bytes)); return bytes.length; },
    async read(buffer) {
      if (offset >= response.length) return null;
      const count = Math.min(buffer.length, fragmentSize, response.length - offset);
      buffer.set(response.subarray(offset, offset + count));
      offset += count;
      return count;
    },
    close() {},
  };
}

describe("DNS-pinned product page fetch", () => {
  it("connects to the validated address and retains the original hostname for Host and TLS", async () => {
    const connected: Array<[string, number]> = [];
    const tlsHosts: string[] = [];
    const requests: string[] = [];
    const response = "HTTP/1.1 103 Early Hints\r\nLink: </style.css>; rel=preload\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 4\r\nContent-Type: text/html\r\n\r\npage";
    const transport: PinnedFetchTransport = {
      async connect(address, port) { connected.push([address, port]); return socketFor(response, requests); },
      async startTls(socket, hostname) { tlsHosts.push(hostname); return socket; },
    };
    const result = await fetchPinnedProductPage(
      "https://shop.example/item?q=1",
      async (_host, type) => type === "A" ? ["93.184.216.34"] : [],
      transport,
    );
    expect(connected).toEqual([["93.184.216.34", 443]]);
    expect(tlsHosts).toEqual(["shop.example"]);
    expect(requests[0]).toContain("GET /item?q=1 HTTP/1.1");
    expect(requests[0]).toContain("Host: shop.example");
    expect(new TextDecoder().decode(result.body)).toBe("page");
  });

  it("revalidates redirects and refuses private destinations before opening a socket", async () => {
    let connectCount = 0;
    const transport: PinnedFetchTransport = {
      async connect() {
        connectCount++;
        return socketFor("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/admin\r\nContent-Length: 0\r\n\r\n", []);
      },
      async startTls(socket) { return socket; },
    };
    await expect(fetchPinnedProductPage("https://shop.example/item", async (_host, type) => type === "A" ? ["93.184.216.34"] : [], transport)).rejects.toThrow(/private or reserved/i);
    expect(connectCount).toBe(1);
  });

  it("re-resolves and pins each public redirect target", async () => {
    const connected: string[] = [];
    const requests: string[] = [];
    const transport: PinnedFetchTransport = {
      async connect(address) {
        connected.push(address);
        const body = address === "93.184.216.34"
          ? "HTTP/1.1 301 Moved Permanently\r\nLocation: https://cdn.example/item\r\nContent-Length: 0\r\n\r\n"
          : "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\npage\r\n0\r\n\r\n";
        return socketFor(body, requests, 13);
      },
      async startTls(socket) { return socket; },
    };
    const result = await fetchPinnedProductPage(
      "https://shop.example/item",
      async (host, type) => type === "A" ? [host === "shop.example" ? "93.184.216.34" : "93.184.216.35"] : [],
      transport,
    );
    expect(connected).toEqual(["93.184.216.34", "93.184.216.35"]);
    expect(result.status).toBe(200);
    expect(new TextDecoder().decode(result.body)).toBe("page");
  });

  it("checks redirect destinations before fetching pages disallowed by robots", async () => {
    let connectCount = 0;
    const transport: PinnedFetchTransport = {
      async connect() {
        connectCount++;
        return socketFor("HTTP/1.1 302 Found\r\nLocation: https://cdn.example/item\r\nContent-Length: 0\r\n\r\n", []);
      },
      async startTls(socket) { return socket; },
    };
    await expect(fetchPinnedProductPage(
      "https://shop.example/item",
      async (_host, type) => type === "A" ? ["93.184.216.34"] : [],
      transport,
      { onRedirect: async (target) => target.hostname !== "cdn.example" },
    )).rejects.toThrow(/robots\.txt/i);
    expect(connectCount).toBe(1);
  });

  it("limits the body and reports truncation instead of claiming complete extraction", async () => {
    const transport: PinnedFetchTransport = {
      async connect() { return socketFor("HTTP/1.1 200 OK\r\nContent-Length: 8\r\n\r\n12345678", []); },
      async startTls(socket) { return socket; },
    };
    const result = await fetchPinnedProductPage("http://93.184.216.34/item", async () => [], transport, { maxBodyBytes: 4 });
    expect(new TextDecoder().decode(result.body)).toBe("1234");
    expect(result.truncated).toBe(true);
  });

  it("applies the overall timeout while DNS resolution is pending", async () => {
    let connectCount = 0;
    const transport: PinnedFetchTransport = {
      async connect() {
        connectCount++;
        return socketFor("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n", []);
      },
      async startTls(socket) { return socket; },
    };
    const hangingResolver = () => new Promise<string[]>(() => {});

    await expect(fetchPinnedProductPage("https://shop.example/item", hangingResolver, transport, { timeoutMs: 20 }))
      .rejects.toThrow(/timed out/i);
    expect(connectCount).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createProductImportHandler, type ProductImportHandlerDependencies } from "./product-import-handler.ts";
import { UnsafeProductUrlError, type PinnedHttpResponse } from "./pinned-fetch.ts";

const validPage = (overrides: Partial<PinnedHttpResponse> = {}): PinnedHttpResponse => ({
  status: 200,
  headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
  body: new TextEncoder().encode(`
    <link rel="canonical" href="https://shop.example/product/sony">
    <script type="application/ld+json">{"@type":"Product","name":"Sony WH-1000XM5","brand":{"name":"Sony"},"model":"WH-1000XM5","offers":{"price":"299.00","priceCurrency":"EUR"}}</script>
  `),
  truncated: false,
  finalUrl: new URL("https://shop.example/product/sony?ref=campaign"),
  ...overrides,
});

function makeHandler(overrides: Partial<ProductImportHandlerDependencies> = {}) {
  const dependencies: ProductImportHandlerDependencies = {
    authenticate: vi.fn(async () => true),
    reserveImport: vi.fn(async () => true),
    resolveDns: vi.fn(async () => ["93.184.216.34"]),
    transport: {
      connect: vi.fn(async () => ({ read: vi.fn(), write: vi.fn(), close: vi.fn() })),
      startTls: vi.fn(async (socket) => socket),
    },
    fetchPage: vi.fn(async () => validPage()),
    ...overrides,
  };
  return { handler: createProductImportHandler(dependencies), dependencies };
}

const request = (url = "https://shop.example/product/sony", init: RequestInit = {}) => new Request("https://function.example/fetch-product", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer user-token", ...init.headers },
  body: JSON.stringify({ url }),
  ...init,
});

describe("product import request handler", () => {
  it("requires a valid signed-in user before reserving or fetching", async () => {
    const { handler, dependencies } = makeHandler({ authenticate: vi.fn(async () => false) });
    const response = await handler(request());
    expect(response.status).toBe(401);
    expect(dependencies.reserveImport).not.toHaveBeenCalled();
    expect(dependencies.fetchPage).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs before spending the user's import allowance", async () => {
    const { handler, dependencies } = makeHandler();
    const response = await handler(request("javascript:alert(1)"));
    expect(response.status).toBe(400);
    expect(dependencies.reserveImport).not.toHaveBeenCalled();
    expect(dependencies.fetchPage).not.toHaveBeenCalled();
  });

  it("maps a pinned-fetch SSRF rejection to a client error", async () => {
    const { handler, dependencies } = makeHandler({
      fetchPage: vi.fn(async () => { throw new UnsafeProductUrlError("Private or reserved IP blocks are forbidden."); }),
    });
    const response = await handler(request("http://127.0.0.1/admin"));
    expect(response.status).toBe(400);
    expect(dependencies.reserveImport).toHaveBeenCalledOnce();
    expect(dependencies.fetchPage).toHaveBeenCalledOnce();
  });

  it("returns a clear 429 and skips the retailer fetch when the quota is exhausted", async () => {
    const { handler, dependencies } = makeHandler({ reserveImport: vi.fn(async () => false) });
    const response = await handler(request());
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Wait one minute") });
    expect(dependencies.fetchPage).not.toHaveBeenCalled();
  });

  it("extracts product metadata and accepts a same-origin canonical URL", async () => {
    const { handler, dependencies } = makeHandler();
    const response = await handler(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      title: "Sony WH-1000XM5",
      brand: "Sony",
      price: 299,
      currency: "EUR",
      canonical_url: "https://shop.example/product/sony",
      extraction_status: "complete",
    });
    expect(dependencies.fetchPage).toHaveBeenCalledWith(
      "https://shop.example/product/sony",
      dependencies.resolveDns,
      dependencies.transport,
      { maxBodyBytes: 2.5 * 1024 * 1024, timeoutMs: 10_000, maxRedirects: 5 },
    );
  });

  it("keeps the validated page URL when metadata proposes a cross-origin canonical URL", async () => {
    const page = validPage({ body: new TextEncoder().encode(`
      <link rel="canonical" href="https://attacker.example/collect">
      <meta property="og:title" content="Sony headphones">
    `) });
    const { handler } = makeHandler({ fetchPage: vi.fn(async () => page) });
    const response = await handler(request());
    await expect(response.json()).resolves.toMatchObject({ canonical_url: page.finalUrl.href });
  });

  it("never reports a truncated page as complete", async () => {
    const { handler } = makeHandler({ fetchPage: vi.fn(async () => validPage({ truncated: true })) });
    const response = await handler(request());
    await expect(response.json()).resolves.toMatchObject({ extraction_status: "partial" });
  });

  it("rejects non-HTML responses", async () => {
    const { handler } = makeHandler({ fetchPage: vi.fn(async () => validPage({ headers: new Headers({ "content-type": "application/pdf" }) })) });
    expect((await handler(request())).status).toBe(415);
  });
});

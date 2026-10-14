import { describe, expect, it, vi } from "vitest";
import { classifyOpenRouterFailure, describeOpenRouterFailure, requestOpenRouter } from "./openrouter.ts";

describe("OpenRouter request reliability", () => {
  it("classifies billing and credit responses without returning raw provider text", () => {
    const body = JSON.stringify({ error: { code: "insufficient_credits", message: "billing account secret-detail" } });
    expect(classifyOpenRouterFailure(402, body)).toBe("insufficient_credits");
    expect(describeOpenRouterFailure("insufficient_credits")).toContain("will not retry");
    expect(describeOpenRouterFailure("insufficient_credits")).not.toContain("secret-detail");
  });

  it("does not retry a non-transient 402 response", async () => {
    const fetcher = vi.fn(async () => new Response("credits required", { status: 402 }));
    const response = await requestOpenRouter("server-key", { model: "test" }, fetcher as typeof fetch);
    expect(response.status).toBe(402);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer server-key");
  });

  it("applies an abort timeout to the request", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    await expect(requestOpenRouter("key", {}, fetcher as typeof fetch, 1)).rejects.toMatchObject({ name: "AbortError" });
  });
});

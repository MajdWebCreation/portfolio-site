import { describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, PROVIDER_REQUEST_TIMEOUT_MS } from "@/lib/analytics-admin/http";

/** A fetch that never answers, and gives up only when its signal aborts (as the real one does). */
const hanging = vi.fn(
  (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "TimeoutError")));
    }),
) as unknown as typeof fetch;

/** A fetch that ignores its signal entirely. */
const deaf = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

describe("fetchWithTimeout", () => {
  it("stays well under the cron's sixty seconds", () => {
    expect(PROVIDER_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });

  it("classes a request that does not answer in time as timeout", async () => {
    await expect(fetchWithTimeout(hanging, "https://provider.test/a?apikey=secret", { method: "GET" }, 20)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("times out even when the fetch ignores its signal", async () => {
    const error = await fetchWithTimeout(deaf, "https://provider.test/a?apikey=secret", { method: "GET" }, 20).catch((e: Error) => e);
    expect(error).toMatchObject({ kind: "timeout" });
    expect(String((error as Error).message)).not.toContain("secret");
  });

  it("times out a body that stalls after the headers", async () => {
    const stalledBody = (async () => ({ ok: true, status: 200, text: () => new Promise<string>(() => undefined) }) as unknown as Response) as unknown as typeof fetch;
    await expect(fetchWithTimeout(stalledBody, "https://provider.test/a", { method: "GET" }, 20)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("classes another failure as network, and returns status and text otherwise", async () => {
    const down = (async () => Promise.reject(new Error("ECONNRESET secret"))) as unknown as typeof fetch;
    await expect(fetchWithTimeout(down, "https://provider.test/a", { method: "GET" }, 1_000)).rejects.toMatchObject({ kind: "network" });
    const fine = (async () => new Response("{\"a\":1}", { status: 201 })) as unknown as typeof fetch;
    expect(await fetchWithTimeout(fine, "https://provider.test/a", { method: "GET" }, 1_000)).toEqual({ ok: true, status: 201, text: "{\"a\":1}" });
  });
});

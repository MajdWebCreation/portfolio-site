import { describe, expect, it } from "vitest";
import { createRequestGate, mapWithLimit } from "@/lib/analytics-admin/concurrency";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("mapWithLimit", () => {
  it("never runs more than the limit at once, and returns results in input order", async () => {
    let running = 0;
    let peak = 0;
    const delays = [5, 1, 4, 1, 3, 1, 2, 1];
    const results = await mapWithLimit(delays, 3, async (delay, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running -= 1;
      return index;
    });
    expect(peak).toBe(3);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("handles fewer items than the limit, and none", async () => {
    expect(await mapWithLimit([1], 4, async (value) => value * 2)).toEqual([2]);
    expect(await mapWithLimit([], 4, async (value) => value)).toEqual([]);
  });

  it("starts nothing new after a task throws, and rejects once the started ones are done", async () => {
    const started: number[] = [];
    await expect(
      mapWithLimit([0, 1, 2, 3, 4], 2, async (value) => {
        started.push(value);
        await tick();
        if (value === 0) throw new Error("boom");
        return value;
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([0, 1]);
  });

  it("refuses a limit that is not a positive integer", async () => {
    await expect(mapWithLimit([1], 0, async (value) => value)).rejects.toThrow();
  });
});

describe("createRequestGate", () => {
  it("keeps at most the limit in flight, also when freed slots are contested", async () => {
    const gate = createRequestGate({ concurrency: 3 });
    let running = 0;
    let peak = 0;
    const request = async (delay: number) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running -= 1;
      return delay;
    };
    /* Two nested fan-outs through one gate, as reports and days would do. */
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, outer) => Promise.all(Array.from({ length: 4 }, (_, inner) => gate(() => request(((outer + inner) % 3) + 1))))),
    );
    expect(peak).toBe(3);
    expect(results.flat()).toHaveLength(12);
  });

  it("starts no request once the deadline has passed, and says so as deadline", async () => {
    let late = false;
    const gate = createRequestGate({ concurrency: 2, pastDeadline: () => late });
    const sent: number[] = [];
    expect(await gate(async () => sent.push(1))).toBe(1);
    late = true;
    await expect(gate(async () => sent.push(2))).rejects.toMatchObject({ kind: "deadline" });
    expect(sent).toEqual([1]);
  });

  it("frees the slot when a request fails", async () => {
    const gate = createRequestGate({ concurrency: 1 });
    await expect(gate(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await gate(async () => "next")).toBe("next");
  });
});

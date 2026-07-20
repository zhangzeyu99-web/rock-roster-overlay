import { describe, expect, it } from "vitest";
import { createAsyncGate } from "../src/core/asyncGate";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("async gate", () => {
  it("runs rapid calls one at a time", async () => {
    const runExclusive = createAsyncGate();
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      [1, 2, 3].map((index) =>
        runExclusive(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          events.push(`start-${index}`);
          await wait(5);
          events.push(`end-${index}`);
          active -= 1;
        })
      )
    );

    expect(maxActive).toBe(1);
    expect(events).toEqual(["start-1", "end-1", "start-2", "end-2", "start-3", "end-3"]);
  });

  it("keeps the queue usable after a failure", async () => {
    const runExclusive = createAsyncGate();
    const events: string[] = [];

    await Promise.allSettled([
      runExclusive(async () => {
        events.push("first");
        throw new Error("failed");
      }),
      runExclusive(async () => {
        events.push("second");
      })
    ]);

    expect(events).toEqual(["first", "second"]);
  });
});

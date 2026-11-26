import { afterEach, describe, expect, it, vi } from "vitest";
import { startScenePolling } from "./scene-poller";

afterEach(() => vi.useRealTimers());
describe("TV recovery polling", () => {
  it("checks immediately, then within 750ms without overlapping a slow recovery", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const request = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const stop = startScenePolling(request);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(12000);
    expect(request).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(750);
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    release();
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("backs off on errors and resumes fast recovery after reconnecting", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const stop = startScenePolling(request);
    await vi.advanceTimersByTimeAsync(2999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(750);
    expect(request).toHaveBeenCalledTimes(3);
    stop();
  });
});

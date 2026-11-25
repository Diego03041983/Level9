import { describe, expect, it } from "vitest";
import { completeCurrentScene, createSceneQueue, enqueueScene, type SceneEvent } from "./scene-queue";

const scene = (id: string, priority: number, policy: SceneEvent["interruptionPolicy"]): SceneEvent => ({
  id,
  type: "announcement",
  payload: {},
  priority,
  interruptionPolicy: policy,
  status: "queued",
  createdAt: `2026-11-25T16:00:${String(priority).padStart(2, "0")}.000Z`,
});

describe("scene queue", () => {
  it("is idempotent for duplicate event IDs", () => {
    const once = enqueueScene(createSceneQueue(), scene("welcome", 1, "never"));
    expect(enqueueScene(once, scene("welcome", 1, "never"))).toBe(once);
  });

  it("interrupts only according to policy and priority", () => {
    const base = enqueueScene(createSceneQueue(), scene("final", 10, "never"));
    const welcome = enqueueScene(base, scene("welcome", 2, "lower_priority"));
    expect(welcome.current?.id).toBe("final");
    const urgent = enqueueScene(welcome, scene("urgent", 20, "lower_priority"));
    expect(urgent.current?.id).toBe("urgent");
    expect(urgent.pending.some(({ id }) => id === "final")).toBe(true);
  });

  it("does not replay completed scenes", () => {
    const playing = enqueueScene(createSceneQueue(), scene("once", 1, "never"));
    const completed = completeCurrentScene(playing);
    expect(enqueueScene(completed, scene("once", 1, "never"))).toBe(completed);
  });
});

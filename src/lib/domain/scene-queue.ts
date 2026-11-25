export type SceneStatus = "queued" | "playing" | "played" | "skipped" | "failed";
export type InterruptionPolicy = "never" | "lower_priority" | "always";

export interface SceneEvent<T = unknown> {
  id: string;
  type: string;
  payload: T;
  priority: number;
  createdAt: string;
  scheduledAt?: string;
  interruptionPolicy: InterruptionPolicy;
  status: SceneStatus;
}

export interface SceneQueue {
  current: SceneEvent | null;
  pending: SceneEvent[];
  processedIds: ReadonlySet<string>;
}

export function createSceneQueue(): SceneQueue {
  return { current: null, pending: [], processedIds: new Set() };
}

function orderScenes(left: SceneEvent, right: SceneEvent): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function canInterrupt(incoming: SceneEvent, current: SceneEvent): boolean {
  if (incoming.interruptionPolicy === "always") return true;
  if (incoming.interruptionPolicy === "never") return false;
  return incoming.priority > current.priority;
}

export function enqueueScene(queue: SceneQueue, scene: SceneEvent): SceneQueue {
  if (
    queue.processedIds.has(scene.id) ||
    queue.current?.id === scene.id ||
    queue.pending.some(({ id }) => id === scene.id)
  ) {
    return queue;
  }

  if (queue.current && canInterrupt(scene, queue.current)) {
    const interrupted: SceneEvent = { ...queue.current, status: "queued" };
    return {
      current: { ...scene, status: "playing" },
      pending: [interrupted, ...queue.pending].sort(orderScenes),
      processedIds: queue.processedIds,
    };
  }
  if (!queue.current) return { ...queue, current: { ...scene, status: "playing" } };
  const queued: SceneEvent = { ...scene, status: "queued" };
  return { ...queue, pending: [...queue.pending, queued].sort(orderScenes) };
}

export function completeCurrentScene(queue: SceneQueue): SceneQueue {
  if (!queue.current) return queue;
  const processedIds = new Set(queue.processedIds);
  processedIds.add(queue.current.id);
  const [next, ...pending] = queue.pending;
  return {
    current: next ? { ...next, status: "playing" } : null,
    pending,
    processedIds,
  };
}

// Never overlap recoveries: a slow response must not overtake a newer stage.
export function startScenePolling(request: () => Promise<boolean | void>, delayMs = 750) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    let ok: boolean | void = false;
    try { ok = await request(); } catch { /* retry after a short offline backoff */ }
    if (!stopped) timer = setTimeout(() => void tick(), ok === false ? 3000 : delayMs);
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabasePublicConfig } from "@/lib/supabase/config";
import type { SceneEventRow } from "@/types/database";
import { PAIRING_STORAGE_KEY, parsePairing, type DisplayPairing } from "./protocol";

export type ConnectionStatus = "unpaired" | "config_missing" | "connecting" | "realtime" | "polling" | "offline" | "revoked";

const pairingFromFragment = () => {
  const value = new URLSearchParams(location.hash.slice(1)).get("pairing");
  if (!value) return null;
  try { return parsePairing(atob(value.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
};

export function useDisplayConnection(onScene: (scene: SceneEventRow) => void) {
  const callback = useRef(onScene);
  const [pairing, setPairing] = useState<DisplayPairing | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastSeen, setLastSeen] = useState<Date>();
  const [pendingCount, setPendingCount] = useState(0);
  const publicConfigured = hasSupabasePublicConfig();

  useEffect(() => { callback.current = onScene; }, [onScene]);

  const headers = useCallback(() => pairing ? { "x-display-device": pairing.deviceId, "x-display-session": pairing.sessionToken } : undefined, [pairing]);
  const requestState = useCallback(async () => {
    if (!pairing) return;
    try {
      const response = await fetch(`/tv/connect?eventId=${encodeURIComponent(pairing.eventId)}`, { headers: headers(), cache: "no-store" });
      if (response.status === 401) { setStatus("revoked"); return; }
      if (!response.ok) throw new Error("state unavailable");
      const data = await response.json() as { scenes: SceneEventRow[] };
      setPendingCount(data.scenes.length); setLastSeen(new Date());
      for (const scene of data.scenes) callback.current(scene);
      setStatus((current) => current === "realtime" ? current : "polling");
    } catch { setStatus("offline"); }
  }, [headers, pairing]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!pairing) return false;
    try {
      const response = await fetch("/tv/connect", { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      if (response.status === 401) setStatus("revoked");
      return response.ok;
    } catch { setStatus("offline"); return false; }
  }, [headers, pairing]);

  const acknowledge = useCallback((sceneId: string, ackStatus: "received" | "started" | "completed" | "failed" | "skipped", error?: string) => post({ action: "ack", sceneId, status: ackStatus, error }), [post]);
  const heartbeat = useCallback((audioEnabled: boolean) => post({ action: "heartbeat", audioEnabled }), [post]);

  useEffect(() => {
    const fragment = pairingFromFragment();
    if (fragment) { localStorage.setItem(PAIRING_STORAGE_KEY, JSON.stringify(fragment)); history.replaceState(null, "", location.pathname + location.search); }
    const stored = fragment ?? parsePairing(localStorage.getItem(PAIRING_STORAGE_KEY));
    queueMicrotask(() => { setPairing(stored); setStatus(stored ? "connecting" : "unpaired"); });
  }, []);

  useEffect(() => {
    if (!pairing) return;
    if (!publicConfigured) return;
    const supabase = createClient();
    const initialRecovery = window.setTimeout(() => void requestState(), 0);
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    // Realtime rows contain private storage paths, not the short-lived signed media URLs.
    // Fetch the authenticated, hydrated scene before delivering it to the player.
    void supabase.auth.getUser().then(({data}) => {
      if (cancelled || !data.user) return;
      channel = supabase.channel(`display:${pairing.eventId}:${pairing.deviceId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "scene_events", filter: `event_id=eq.${pairing.eventId}` }, (payload) => {
          const scene = payload.new as SceneEventRow;
          if (scene?.id && (!scene.target_device_id || scene.target_device_id === pairing.deviceId)) void requestState();
        }).subscribe((channelStatus) => {
          if (channelStatus === "SUBSCRIBED") setStatus("realtime");
          else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") setStatus("polling");
        });
    });
    const poll = window.setInterval(() => void requestState(), 10_000);
    return () => { cancelled = true; clearTimeout(initialRecovery); clearInterval(poll); if (channel) void supabase.removeChannel(channel); };
  }, [pairing, publicConfigured, requestState]);

  const forgetPairing = useCallback(() => { localStorage.removeItem(PAIRING_STORAGE_KEY); setPairing(null); setStatus("unpaired"); }, []);
  return { pairing, status: pairing && !publicConfigured ? "config_missing" as const : status, lastSeen, pendingCount, acknowledge, heartbeat, forgetPairing, refresh: requestState };
}

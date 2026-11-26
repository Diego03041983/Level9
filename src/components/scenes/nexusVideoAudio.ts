import type { DisplayScene } from "../../lib/tv/protocol";

export const shouldMuteNexusVideo = (scene: DisplayScene, displayMuted: boolean) =>
  displayMuted || Boolean(scene.sound.url || scene.sound.name || scene.sound.sequence?.some(segment => segment.kind === "audio"));

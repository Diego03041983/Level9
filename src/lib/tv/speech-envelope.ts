export const SPEECH_FRAMES_PER_SECOND = 40;

// Retain only 40 amplitude values per second; release decoded PCM afterwards.
export function buildSpeechEnvelope(channels: Float32Array[], sampleRate: number): Float32Array {
  const length = channels[0]?.length ?? 0;
  const step = Math.max(1, Math.round(sampleRate / SPEECH_FRAMES_PER_SECOND));
  const envelope = new Float32Array(Math.ceil(length / step));
  let peak = 0;
  for (let frame = 0; frame < envelope.length; frame++) {
    const start = frame * step, end = Math.min(length, start + step);
    let energy = 0;
    for (const channel of channels) {
      let sum = 0;
      for (let index = start; index < end; index++) sum += channel[index] ** 2;
      energy = Math.max(energy, Math.sqrt(sum / (end - start)));
    }
    envelope[frame] = energy;
    peak = Math.max(peak, energy);
  }
  const gate = Math.max(.008, peak * .035);
  for (let frame = 0; frame < envelope.length; frame++) {
    envelope[frame] = envelope[frame] <= gate ? 0 : Math.min(1, Math.pow(envelope[frame] / Math.max(.08, peak), .65));
  }
  return envelope;
}

// Decode independently: never reroute the actual TV audio through Web Audio.
// A decoding/network failure leaves playback intact and the mouth at rest.
export class SpeechEnvelopeReader {
  private cache = new Map<string, Float32Array>();
  private pending = new Set<string>();
  private queue = Promise.resolve();
  private decoder: OfflineAudioContext | null = null;
  private controller = new AbortController();

  prepare(url: string, analysisUrl = url) {
    const key = new URL(url, location.href).href;
    if (this.cache.has(key) || this.pending.has(key) || this.controller.signal.aborted) return;
    this.pending.add(key);
    // One decode at a time limits memory use on the SmartTV.
    this.queue = this.queue.then(async () => {
      try {
        if (this.controller.signal.aborted) return;
        const response = await fetch(analysisUrl, { signal: this.controller.signal, cache: "force-cache" });
        if (!response.ok) return;
        this.decoder ??= new OfflineAudioContext(1, 1, 16000);
        const buffer = await this.decoder.decodeAudioData(await response.arrayBuffer());
        if (this.controller.signal.aborted) return;
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
        this.cache.set(key, buildSpeechEnvelope(channels, buffer.sampleRate));
        if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      } catch { /* Analysis is optional; HTML audio continues independently. */ }
      finally { this.pending.delete(key); }
    });
  }

  level(audio: HTMLAudioElement | null): number {
    if (!audio || audio.paused || audio.ended || audio.muted || audio.volume === 0 || audio.readyState < 3) return 0;
    const envelope = this.cache.get(audio.currentSrc || audio.src);
    return envelope?.[Math.floor(audio.currentTime * SPEECH_FRAMES_PER_SECOND)] ?? 0;
  }

  dispose() {
    this.controller.abort();
    this.cache.clear();
    this.decoder = null;
  }
}

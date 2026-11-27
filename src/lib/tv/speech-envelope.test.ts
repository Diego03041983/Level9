import { describe, expect, it } from "vitest";
import { buildSpeechEnvelope, SpeechEnvelopeReader } from "./speech-envelope";

describe("speech motion from actual audio", () => {
  it("preserves pauses and follows changing amplitude, including stereo with an empty first channel", () => {
    const samples = new Float32Array(16000);
    for (let index = 4000; index < 8000; index++) samples[index] = Math.sin(index * .1) * .1;
    for (let index = 12000; index < 16000; index++) samples[index] = Math.sin(index * .1) * .6;
    const envelope = buildSpeechEnvelope([new Float32Array(16000), samples], 16000);
    expect(envelope).toHaveLength(40);
    expect(envelope[5]).toBe(0);
    expect(envelope[25]).toBe(0);
    expect(envelope[15]).toBeGreaterThan(.1);
    expect(envelope[35]).toBeGreaterThan(envelope[15]);
  });
  it("keeps the mouth closed for silence and very low background noise", () => {
    expect([...buildSpeechEnvelope([new Float32Array(16000).fill(.001)], 16000)].every(value => value === 0)).toBe(true);
    expect([...buildSpeechEnvelope([], 16000)]).toEqual([]);
  });
  it("does not animate missing or stopped audio", () => {
    const reader = new SpeechEnvelopeReader();
    expect(reader.level(null)).toBe(0);
    expect(reader.level({ paused: true } as HTMLAudioElement)).toBe(0);
    expect(reader.level({ ended: true } as HTMLAudioElement)).toBe(0);
    expect(reader.level({ muted: true } as HTMLAudioElement)).toBe(0);
    reader.dispose();
  });
});

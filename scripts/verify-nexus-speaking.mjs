// All display requests are mocked. This never sends commands to the live event.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.TV_TEST_URL || "http://localhost:3100";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const pairing = { eventId: "20000000-0000-4000-8000-000000000001", deviceId: "30000000-0000-4000-8000-000000000001", sessionToken: "x".repeat(32) };
const errors = [], acks = [];
let scenes = [], counter = 0;
const makeScene = (type, payload, sound = {}) => ({
  id: `10000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`, event_id: pairing.eventId,
  scene_type: type, payload, sound, animation: {}, priority: 100, status: "queued", duration_ms: 15000,
  scheduled_at: new Date().toISOString(), created_at: new Date().toISOString(), interrupt_policy: "force", target_device_id: null,
});
const waitAck = async (scene, status) => {
  const deadline = Date.now() + 8000;
  while (!acks.some(ack => ack.sceneId === scene.id && ack.status === status) && Date.now() < deadline) await page.waitForTimeout(80);
  assert.ok(acks.some(ack => ack.sceneId === scene.id && ack.status === status), `${scene.scene_type} missing ${status}`);
};
const command = async action => { const scene = makeScene("DISPLAY_COMMAND", { action }); scenes = [scene]; await waitAck(scene, "completed"); };

// Known signal with actual silent regions, played by Chrome's real audio element.
const sampleRate = 16000, samples = sampleRate * 14, wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const t = i / sampleRate, voiced = (t >= .6 && t < 2) || (t >= 3 && t < 12);
  wav.writeInt16LE(voiced ? Math.round(Math.sin(t * Math.PI * 440) * 12000) : 0, 44 + i * 2);
}
try {
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(pairing => {
    localStorage.setItem("level9.display.pairing.v1", JSON.stringify(pairing));
    window.testAudios = []; window.nativeCalls = [];
    window.Audio = new Proxy(window.Audio, { construct(Target, args) { const audio = new Target(...args); window.testAudios.push(audio); return audio; } });
    window.Level9Native = {
      playVideo(id, url) { window.nativeCalls.push({ id, url }); setTimeout(() => window.dispatchEvent(new CustomEvent("level9-video", { detail: { id, type: "playing" } })), 20); },
      updateVideo() {}, stopVideo() {},
    };
  }, pairing);
  await page.route("**/tv/connect**", async route => {
    if (route.request().method() === "POST") { acks.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true } }); }
    else await route.fulfill({ json: { scenes } });
  });
  await page.route("**/speech-test.wav", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await page.goto(`${base}/tv`);
  await page.getByRole("button", { name: "Habilitar audio e iniciar", exact: true }).click();
  const match = makeScene("VERSUS_SCREEN", { eventKey: "MATCH_CALLED", title: "Próximo enfrentamiento", activity: "FIFA", videoUrl: "/old-character.mp4", players: [{ name: "Santiago", photoUrl: "/assets/branding/santiago-gamer.png" }, { name: "Dante" }] }, { sequence: [{ kind: "audio", url: "/speech-test.wav", durationMs: 14000, volume: 1, label: "Voice" }] });
  scenes = [match]; await waitAck(match, "started");
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.speechLevel) > .2);
  assert.equal(await page.getByAltText("Foto de Santiago").count(), 1);
  assert.equal(await page.getByText("Dante", { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.nativeCalls.length), 0, "A hidden character video was started");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: "/tmp/level9-nexus-speaking.png" });
  await page.waitForFunction(() => {
    const audio = window.testAudios.find(a => a.src.endsWith("speech-test.wav"));
    return audio?.currentTime > 2.3 && audio.currentTime < 2.95 && Number(document.querySelector("canvas")?.dataset.speechLevel) < .01;
  });
  await page.waitForFunction(() => {
    const audio = window.testAudios.find(a => a.src.endsWith("speech-test.wav"));
    return audio?.currentTime > 3.2 && Number(document.querySelector("canvas")?.dataset.speechLevel) > .2;
  });
  await command("pause");
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.speechLevel) === 0);
  await command("resume");
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.speechLevel) > .2);
  await page.getByRole("button", { name: "Silenciar", exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.speechLevel) === 0);
  await page.getByRole("button", { name: "Activar audio", exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.speechLevel) > .2);
  await command("skip"); await waitAck(match, "skipped");
  const restored = makeScene("NEXUS_RESTORED", { eventKey: "NEXUS_RESTORED", title: "Nexus restaurado", videoUrl: "/old-character.mp4" }, { sequence: [{ kind: "audio", url: "/assets/audio/sfx/notification.mp3", durationMs: 450, volume: 1, label: "Restored" }] });
  scenes = [restored]; await waitAck(restored, "started");
  assert.equal(await page.locator(".nexus-act canvas").count(), 1);
  await waitAck(restored, "completed");
  assert.equal(await page.locator(".nexus-act").count(), 0);
  for (const [type, payload] of [
    ["MISSION_ALERT", { eventKey: "MISSION_WARNING", videoUrl: "/mission.mp4" }],
    ["NEXUS_DETECTION", { sessionId: "registration", videoUrl: "/registration.mp4" }],
  ]) {
    const scene = makeScene(type, payload); scenes = [scene]; await waitAck(scene, "started");
    assert.equal(await page.locator(".nexus-act").count(), 0);
    assert.ok(await page.evaluate(url => window.nativeCalls.some(call => call.url.endsWith(url)), payload.videoUrl));
    await command("skip");
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(acks.filter(ack => ack.status === "failed"), []);
  console.log("PASS: audio-driven mouth, silence, pause/resume, mute, players, restored Nexus, completion, Mission and reception video preservation");
} finally { await browser.close(); }

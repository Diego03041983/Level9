// Uses real local media with mocked display requests. No live event is modified.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.TV_TEST_URL || "http://localhost:3100";
const media = process.env.BREACH_MEDIA_DIR;
if (!media) throw new Error("Set BREACH_MEDIA_DIR to the folder containing anomaly-detected.wav and nexus-breach-v2");
const fixtures = [
  ["voice.mp3", "audio/mpeg", await readFile(`${media}/nexus-breach-v3/nexus-anomaly-alarm.mp3`)],
  ["dry.wav", "audio/wav", await readFile(`${media}/anomaly-detected.wav`)],
  ["glitch.mp4", "video/mp4", await readFile(`${media}/nexus-breach-v2/glitch-intervention-tv.mp4`)],
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const pairing = { eventId: "20000000-0000-4000-8000-000000000001", deviceId: "30000000-0000-4000-8000-000000000001", sessionToken: "x".repeat(32) };
try {
  for (const native of process.env.NATIVE_ONLY ? [true] : [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const acks = [], errors = [];
    let scenes = [], counter = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ pairing, native }) => {
      localStorage.setItem("level9.display.pairing.v1", JSON.stringify(pairing));
      window.testAudios = []; window.nativeCalls = [];
      window.Audio = new Proxy(window.Audio, { construct(Target, args) { const audio = new Target(...args); window.testAudios.push(audio); return audio; } });
      if (native) window.Level9Native = {
        playVideo(id, url, loop, muted, volume) { window.nativeCalls.push({ id, url, loop, muted, volume }); setTimeout(() => window.dispatchEvent(new CustomEvent("level9-video", { detail: { id, type: "playing" } })), 20); },
        updateVideo() {}, stopVideo() {},
      };
    }, { pairing, native });
    await page.route("**/tv/connect**", async route => {
      if (route.request().method() === "POST") { acks.push({ ...route.request().postDataJSON(), at: Date.now() }); await route.fulfill({ json: { ok: true } }); }
      else await route.fulfill({ json: { scenes } });
    });
    for (const [file, contentType, body] of fixtures) await page.route(`**/breach-test/${file}`, route => route.fulfill({ contentType, body }));
    const make = (type, payload, sound = {}) => ({
      id: `10000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`, event_id: pairing.eventId,
      scene_type: type, payload, sound, animation: {}, priority: 100, status: "queued", duration_ms: 1000,
      scheduled_at: new Date().toISOString(), created_at: new Date().toISOString(), interrupt_policy: "force", target_device_id: null,
    });
    const waitAck = async (scene, status, timeout = 8000) => {
      const until = Date.now() + timeout;
      while (!acks.some(ack => ack.sceneId === scene.id && ack.status === status) && Date.now() < until) await page.waitForTimeout(80);
      assert.ok(acks.some(ack => ack.sceneId === scene.id && ack.status === status), `${native ? "native" : "HTML"} missing ${status}`);
    };
    const command = async action => { const scene = make("DISPLAY_COMMAND", { action }); scenes = [scene]; await waitAck(scene, "completed"); };
    await page.goto(`${base}/tv`);
    await page.getByRole("button", { name: "Habilitar audio e iniciar", exact: true }).click();
    const breach = make("NEXUS_SYSTEM_BREACH", { eventKey: "MISSION_BREACH", breachSequence: true, videoUrl: "/breach-test/glitch.mp4", videoLoop: false }, { url: "/breach-test/voice.mp3", analysisUrl: "/breach-test/dry.wav" });
    scenes = [breach]; await waitAck(breach, "started");
    await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.speechLevel) > .1);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("[data-breach-phase=nexus]").count(), 1, "duration metadata cut Nexus short");
    assert.equal(await page.locator("video").count(), 0, "Glitch started over Nexus");
    await command("pause");
    const stoppedAt = await page.evaluate(() => window.testAudios.find(a => a.src.includes("voice.mp3")).currentTime);
    await page.waitForTimeout(100);
    const frozenStrength = await page.locator("canvas").getAttribute("data-interference-strength");
    await page.waitForTimeout(700);
    assert.equal(await page.locator("canvas").getAttribute("data-interference-strength"), frozenStrength, "interference advanced during pause");
    assert.ok(Math.abs(await page.evaluate(() => window.testAudios.find(a => a.src.includes("voice.mp3")).currentTime) - stoppedAt) < .03, "voice did not pause");
    await command("resume");
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    if (!native) await page.screenshot({ path: "/tmp/level9-breach-nexus.png" });
    await page.evaluate(() => { window.testAudios.find(a => a.src.includes("voice.mp3")).playbackRate = 4; });
    const earlyStrength = Number(await page.locator("canvas").getAttribute("data-interference-strength"));
    await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.interferenceProgress) > .78);
    assert.ok(Number(await page.locator("canvas").getAttribute("data-interference-strength")) > earlyStrength + .4);
    if (!native) await page.screenshot({ path: "/tmp/level9-breach-escalated.png" });
    await page.locator("video").waitFor({ timeout: 25000 });
    assert.ok(await page.evaluate(() => window.testAudios.find(a => a.src.includes("voice.mp3")).ended), "video mounted before Nexus audio ended");
    assert.equal(await page.locator("canvas").count(), 0);
    if (native) {
      assert.ok(await page.evaluate(() => window.nativeCalls.at(-1).muted === false), "Glitch embedded voice was muted");
      await page.waitForTimeout(2500);
      assert.ok(!acks.some(ack => ack.sceneId === breach.id && ack.status === "completed"), "metadata timer cut Glitch short");
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("level9-video", { detail: { id: window.nativeCalls.at(-1).id, type: "error", message: "Prueba de interrupción de red" } })));
      await page.getByRole("button", { name: "Reintentar Glitch" }).waitFor();
      assert.ok(!acks.some(ack => ack.sceneId === breach.id && ack.status === "completed"));
      const callsBeforeRetry = await page.evaluate(() => window.nativeCalls.length);
      await page.getByRole("button", { name: "Reintentar Glitch" }).click();
      await page.waitForFunction(before => window.nativeCalls.length > before, callsBeforeRetry);
      // Late events from the failed player must not finish the new player.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("level9-video", { detail: { id: window.nativeCalls[0].id, type: "ended" } })));
      await page.waitForTimeout(500);
      assert.ok(!acks.some(ack => ack.sceneId === breach.id && ack.status === "completed"));
    } else {
      await page.waitForFunction(() => document.querySelector("video")?.currentTime > .1);
      assert.equal(await page.locator("video").evaluate(video => video.muted), false);
      await page.locator("video").evaluate(video => { video.playbackRate = 4; });
      await page.waitForFunction(() => document.querySelector("video")?.ended, null, { timeout: 50000 });
      assert.ok(await page.locator("video").evaluate(video => video.currentTime >= 130), "Glitch was truncated");
    }
    const endedAt = Date.now();
    if (native) await page.evaluate(() => window.dispatchEvent(new CustomEvent("level9-video", { detail: { id: window.nativeCalls.at(-1).id, type: "ended" } })));
    await page.waitForTimeout(3500);
    assert.equal(await page.locator("video").count(), 1, "final frame did not hold for 5 seconds");
    await waitAck(breach, "completed");
    assert.ok(acks.find(ack => ack.sceneId === breach.id && ack.status === "completed").at - endedAt >= 4800);
    assert.equal(await page.locator(".nexus-presence canvas").count(), 1);
    assert.deepEqual(errors, []);
    if (!native) assert.equal(acks.filter(ack => ack.status === "failed").length, 0);
    console.log(`PASS ${native ? "native bridge" : "full HTML media"}: sequential Nexus/Glitch, embedded voice, pause/resume, real end + 5 seconds${native ? ", error recovery" : ""}`);
    await page.close();
  }
} finally { await browser.close(); }

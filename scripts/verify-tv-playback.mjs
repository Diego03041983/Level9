// Local-only regression test: all display API requests are intercepted; no live scenes are sent.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.TV_TEST_URL || "http://localhost:3100";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const pairing = { eventId: "20000000-0000-4000-8000-000000000001", deviceId: "30000000-0000-4000-8000-000000000001", sessionToken: "x".repeat(32) };
try {
  for (const native of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(({ pairing, native }) => {
      localStorage.setItem("level9.display.pairing.v1", JSON.stringify(pairing));
      window.nativeCalls = [];
      if (native) window.Level9Native = {
        playVideo(id, url) {
          window.nativeCalls.push({ action: "play", id, url });
          setTimeout(() => window.dispatchEvent(new CustomEvent("level9-video", { detail: { id, type: "playing" } })), 50);
        },
        updateVideo() {},
        stopVideo(id) { window.nativeCalls.push({ action: "stop", id }); },
      };
    }, { pairing, native });
    let scenes = [];
    const acks = [];
    await page.route("**/tv/connect**", async route => {
      if (route.request().method() === "POST") {
        acks.push({ ...route.request().postDataJSON(), at: Date.now() });
        await route.fulfill({ json: { ok: true } });
      } else await route.fulfill({ json: { scenes } });
    });
    // This audio never finishes loading. It must not block video or a stage change.
    await page.route("**/slow.wav", async () => {});
    await page.goto(`${base}/tv`);
    await page.getByRole("button", { name: "Habilitar audio e iniciar", exact: true }).click();
    const makeScene = index => ({
      id: `10000000-0000-4000-8000-00000000000${index}`, event_id: pairing.eventId,
      scene_type: index === 1 ? "NEXUS_DETECTION" : "NEXUS_SCANNING",
      created_at: new Date().toISOString(), scheduled_at: new Date().toISOString(),
      priority: 88, status: "queued", duration_ms: 20000, interrupt_policy: "force",
      payload: { sessionId: "test-session", videoUrl: `/assets/video/desafio-robux-glitch-v2.mp4?stage=${index}` },
      sound: { url: `${base}/slow.wav` }, animation: {}, target_device_id: null,
    });
    for (let index = 1; index <= 2; index++) {
      const scene = makeScene(index);
      const sent = Date.now();
      scenes = [scene];
      const deadline = sent + 6000;
      while (!acks.some(ack => ack.sceneId === scene.id && ack.status === "started") && Date.now() < deadline) await page.waitForTimeout(100);
      const started = acks.find(ack => ack.sceneId === scene.id && ack.status === "started");
      assert.ok(started, `scene ${index} never started (${native ? "native" : "HTML"})`);
      assert.ok(started.at - sent < 5000, "stage exceeded start deadline");
      assert.equal(await page.locator("video").count(), 1);
      if (!native) await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.1);
      console.log(`${native ? "native bridge" : "HTML video"} stage ${index}: ${started.at - sent}ms`);
    }
    assert.equal(acks.filter(ack => ack.status === "failed").length, 0);
    if (native) {
      const calls = await page.evaluate(() => window.nativeCalls);
      assert.ok(calls.some(call => call.action === "stop"), "old native video was not released");
      assert.equal(await page.locator("video").getAttribute("src"), null, "HTML and native decoders loaded simultaneously");
    }
    await context.close();
  }
} finally { await browser.close(); }

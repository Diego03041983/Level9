package com.level9.santiago.tv;

import android.content.Intent;
import android.net.Uri;
import static org.junit.Assert.*;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.After;
import android.webkit.WebView;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs on an Android TV emulator/device against the actual release media URL. */
public class NativePlaybackTest {
    private MainActivity activity;
    private android.app.Instrumentation getInstrumentation() { return InstrumentationRegistry.getInstrumentation(); }
    @After public void close() { if(activity != null) getInstrumentation().runOnMainSync(() -> activity.finish()); }
    private WebView web;
    private NativeVideoPlayer nativePlayer;

    private String js(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue("JavaScript callback timed out", done.await(8, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitJs(String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 20000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(js(expression))) return;
            Thread.sleep(250);
        }
        fail("Expected " + expression + " events=" + js("JSON.stringify(window.testEvents)"));
    }

    @Test public void testNativePlaybackSwitchPauseAndSoftwareDecoder() throws Exception {
        Intent intent = new Intent(getInstrumentation().getTargetContext(), MainActivity.class)
                .setAction(Intent.ACTION_VIEW).setData(Uri.parse("https://level9-nu.vercel.app/tv"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (MainActivity)getInstrumentation().startActivitySync(intent);
        Field webField = MainActivity.class.getDeclaredField("webView"); webField.setAccessible(true);
        web = (WebView) webField.get(activity);
        Field playerField = MainActivity.class.getDeclaredField("nativeVideo"); playerField.setAccessible(true);
        nativePlayer = (NativeVideoPlayer) playerField.get(activity);
        awaitJs("document.readyState === 'complete' && !!window.Level9Native");
        js("window.testEvents=[];window.addEventListener('level9-video',e=>window.testEvents.push(e.detail));true");
        String url = "https://level9-nu.vercel.app/assets/video/desafio-robux-glitch-v2.mp4";
        js("Level9Native.playVideo('one','" + url + "',false,false,0.5,false)");
        awaitJs("window.testEvents.some(e=>e.id==='one'&&e.type==='playing')");
        awaitJs("window.testEvents.filter(e=>e.id==='one'&&e.type==='progress').length>=3");
        js("Level9Native.updateVideo('one',true,false,0.5)");
        Thread.sleep(700);
        String pausedCount = js("window.testEvents.length");
        Thread.sleep(1000);
        assertEquals("Paused video continued advancing", pausedCount, js("window.testEvents.length"));
        js("Level9Native.updateVideo('one',false,false,0.5)");
        awaitJs("window.testEvents.length>" + pausedCount);
        getInstrumentation().runOnMainSync(() -> nativePlayer.setSoftware(true));
        js("Level9Native.playVideo('two','" + url + "',false,false,0.5,false);Level9Native.stopVideo('one')");
        awaitJs("window.testEvents.some(e=>e.id==='two'&&e.type==='playing')");
        awaitJs("window.testEvents.filter(e=>e.id==='two'&&e.type==='progress').length>=3");
        Field engineField = NativeVideoPlayer.class.getDeclaredField("player"); engineField.setAccessible(true);
        androidx.media3.exoplayer.ExoPlayer engine = (androidx.media3.exoplayer.ExoPlayer)engineField.get(nativePlayer);
        getInstrumentation().runOnMainSync(() -> engine.seekTo(engine.getDuration() - 500));
        awaitJs("window.testEvents.some(e=>e.id==='two'&&e.type==='ended')");
        assertEquals("Native decoder failed", "false", js("window.testEvents.some(e=>e.type==='error')"));
        js("Level9Native.stopVideo('two')");
        getInstrumentation().runOnMainSync(() -> nativePlayer.setSoftware(false));
    }
}

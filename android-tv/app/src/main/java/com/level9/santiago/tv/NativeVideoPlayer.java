package com.level9.santiago.tv;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONObject;

/** One native SurfaceView, independent of Chromium's video compositor. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public final class NativeVideoPlayer {
    private final Activity activity;
    private final WebView web;
    private final PlayerView surface;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private String activeId = "";
    private long lastPosition = -1;
    private boolean foreground = true;
    private boolean wantedPaused;
    private boolean software;

    public NativeVideoPlayer(Activity activity, WebView web, FrameLayout root) {
        this.activity = activity;
        this.web = web;
        software = activity.getSharedPreferences("level9_tv", 0).getBoolean("software_video", false);
        surface = new PlayerView(activity);
        surface.setUseController(false);
        surface.setBackgroundColor(Color.BLACK);
        surface.setKeepContentOnPlayerReset(false);
        surface.setFocusable(false);
        surface.setVisibility(View.GONE);
        root.addView(surface, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private boolean trustedPage() {
        String url = web.getUrl();
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equals(uri.getScheme()) && "level9-nu.vercel.app".equals(uri.getHost());
    }

    private boolean allowedMedia(String url) {
        Uri uri = Uri.parse(url);
        return "https".equals(uri.getScheme()) && uri.getUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && ("level9-nu.vercel.app".equals(uri.getHost())
                    || "mxorrwwgnhyldiebdzlj.supabase.co".equals(uri.getHost()));
    }

    @JavascriptInterface
    public void playVideo(String id, String url, boolean loop, boolean muted, double volume, boolean paused) {
        activity.runOnUiThread(() -> {
            if (!trustedPage() || id == null || id.length() > 150 || !allowedMedia(url)) return;
            stop();
            activeId = id;
            wantedPaused = paused;
            DefaultRenderersFactory renderers = new DefaultRenderersFactory(activity)
                    .setEnableDecoderFallback(true).forceDisableMediaCodecAsynchronousQueueing();
            if (software) renderers.setMediaCodecSelector(MediaCodecSelector.PREFER_SOFTWARE);
            DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                    .setConnectTimeoutMs(8000).setReadTimeoutMs(8000).setUserAgent("Level9TV/1.1");
            player = new ExoPlayer.Builder(activity, renderers)
                    .setMediaSourceFactory(new DefaultMediaSourceFactory(activity).setDataSourceFactory(http))
                    .setLoadControl(new DefaultLoadControl.Builder().setBufferDurationsMs(3000, 12000, 300, 700).build())
                    .build();
            final ExoPlayer sessionPlayer = player;
            surface.setPlayer(player);
            surface.setVisibility(View.VISIBLE);
            player.setVolume(muted ? 0 : (float) Math.max(0, Math.min(1, volume)));
            player.setRepeatMode(loop ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
            player.addListener(new Player.Listener() {
                @Override public void onRenderedFirstFrame() {
                    if (player == sessionPlayer) emit(id, "playing", "");
                }
                @Override public void onPlaybackStateChanged(int state) {
                    if (player == sessionPlayer && state == Player.STATE_ENDED) emit(id, "ended", "");
                }
                @Override public void onPlayerError(PlaybackException error) {
                    if (player == sessionPlayer) {
                        emit(id, "error", "Reproductor Android: " + error.getErrorCodeName());
                        stop();
                    }
                }
            });
            player.setMediaItem(MediaItem.fromUri(url));
            player.prepare();
            player.setPlayWhenReady(foreground && !paused);
            lastPosition = -1;
            handler.post(progress);
        });
    }

    private final Runnable progress = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            long position = player.getCurrentPosition();
            if (player.isPlaying() && position != lastPosition) {
                lastPosition = position;
                emit(activeId, "progress", "");
            }
            handler.postDelayed(this, 500);
        }
    };

    @JavascriptInterface
    public void updateVideo(String id, boolean paused, boolean muted, double volume) {
        activity.runOnUiThread(() -> {
            if (!trustedPage() || player == null || !activeId.equals(id)) return;
            wantedPaused = paused;
            player.setVolume(muted ? 0 : (float) Math.max(0, Math.min(1, volume)));
            player.setPlayWhenReady(foreground && !paused);
        });
    }

    @JavascriptInterface
    public void stopVideo(String id) {
        activity.runOnUiThread(() -> { if (activeId.equals(id)) stop(); });
    }

    private void emit(String id, String type, String message) {
        if (!trustedPage()) return;
        try {
            JSONObject detail = new JSONObject().put("id", id).put("type", type).put("message", message);
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('level9-video',{detail:" + detail + "}))", null);
        } catch (Exception ignored) { /* no credentials or signed URLs in logs */ }
    }

    public void setForeground(boolean value) {
        foreground = value;
        if (player != null) player.setPlayWhenReady(value && !wantedPaused);
    }

    public void setSoftware(boolean enabled) {
        software = enabled;
        activity.getSharedPreferences("level9_tv", 0).edit().putBoolean("software_video", enabled).apply();
    }

    public boolean isSoftware() { return software; }

    public void stop() {
        handler.removeCallbacks(progress);
        surface.setPlayer(null);
        surface.setVisibility(View.GONE);
        if (player != null) { player.release(); player = null; }
        activeId = "";
    }
}

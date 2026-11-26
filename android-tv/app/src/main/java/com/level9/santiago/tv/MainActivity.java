package com.level9.santiago.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;
import android.text.InputFilter;
import android.text.InputType;

import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOME_URL = "https://level9-nu.vercel.app/tv";
    private static final String PAIR_URL = "https://level9-nu.vercel.app/tv/p/";
    private static final String ALLOWED_HOST = "level9-nu.vercel.app";
    private static final String PREFS = "level9_tv";
    private static final String PREF_PAIRED = "pairing_detected";
    private static final String WEB_PAIRING_KEY = "level9.display.pairing.v1";

    private FrameLayout root;
    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private AlertDialog pairingDialog;
    private NativeVideoPlayer nativeVideo;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        enterImmersiveMode();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 8, 22));
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
        configureWebView();
        nativeVideo = new NativeVideoPlayer(this, webView, root);
        webView.addJavascriptInterface(nativeVideo, "Level9Native");

        String launchUrl = getSafeLaunchUrl(getIntent());
        webView.loadUrl(launchUrl == null ? HOME_URL : launchUrl);
        if (launchUrl == null && !getPreferences().getBoolean(PREF_PAIRED, false)) {
            root.postDelayed(this::showPairingDialog, 600);
        }
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " Level9TV/1.1 AndroidTV");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setBackgroundColor(Color.rgb(5, 8, 22));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus(View.FOCUS_DOWN);
        webView.setWebViewClient(new Level9WebViewClient());
        webView.setWebChromeClient(new Level9ChromeClient());
    }

    private android.content.SharedPreferences getPreferences() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String getSafeLaunchUrl(Intent intent) {
        if (intent == null || intent.getData() == null) return null;
        Uri uri = intent.getData();
        String path = uri.getPath();
        if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
        if (!ALLOWED_HOST.equalsIgnoreCase(uri.getHost())) return null;
        if (path == null || !path.startsWith("/tv")) return null;
        return uri.toString();
    }

    private boolean isAllowed(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && ALLOWED_HOST.equalsIgnoreCase(uri.getHost());
    }

    private void showPairingDialog() {
        if (isFinishing() || (pairingDialog != null && pairingDialog.isShowing())) return;

        final EditText input = new EditText(this);
        input.setHint("XXXXXXXXXX");
        input.setSingleLine(true);
        input.setGravity(Gravity.CENTER);
        input.setTextSize(24);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.GRAY);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        input.setFilters(new InputFilter[]{new InputFilter.AllCaps(), new InputFilter.LengthFilter(10)});

        int spacing = Math.round(24 * getResources().getDisplayMetrics().density);
        LinearLayout container = new LinearLayout(this);
        container.setPadding(spacing, 0, spacing, 0);
        container.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        pairingDialog = new AlertDialog.Builder(this)
                .setTitle("Vincular Level 9 TV")
                .setMessage("En Administración tocá “Vincular Smart TV” e ingresá aquí el código de 10 caracteres.")
                .setView(container)
                .setPositiveButton("Vincular", null)
                .setNeutralButton("Abrir sin código", (dialog, which) -> webView.loadUrl(HOME_URL))
                .setNegativeButton("Cancelar", null)
                .create();

        pairingDialog.setOnShowListener(dialog -> {
            pairingDialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(view -> {
                String code = input.getText().toString()
                        .trim()
                        .toUpperCase(Locale.ROOT)
                        .replaceAll("[^A-Z2-9]", "");
                if (!code.matches("[A-Z2-9]{10}")) {
                    input.setError("Ingresá los 10 caracteres del código");
                    return;
                }
                pairingDialog.dismiss();
                webView.loadUrl(PAIR_URL + code);
            });
            input.requestFocus();
        });
        pairingDialog.show();
    }

    private void detectStoredPairing() {
        String script = "(function(){return !!localStorage.getItem('" + WEB_PAIRING_KEY + "');})()";
        webView.evaluateJavascript(script, value -> {
            if ("true".equals(value)) {
                getPreferences().edit().putBoolean(PREF_PAIRED, true).apply();
            }
        });
    }

    private void observeUrl(String url) {
        if (url != null && url.contains("#pairing=")) {
            getPreferences().edit().putBoolean(PREF_PAIRED, true).apply();
        }
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
        customViewCallback = null;
        enterImmersiveMode();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = getSafeLaunchUrl(intent);
        if (url != null) webView.loadUrl(url);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_UP && event.getKeyCode() == KeyEvent.KEYCODE_MENU) {
            showAppMenu();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void showAppMenu() {
        new AlertDialog.Builder(this).setTitle("Level 9 TV · 1.1.0")
                .setItems(new String[]{"Volver a vincular", "Recargar pantalla", nativeVideo.isSoftware() ? "Usar reproducción estándar" : "Activar modo compatible (pantalla verde)"}, (dialog, which) -> {
                    if (which == 0) showPairingDialog();
                    if (which == 1) { nativeVideo.stop(); webView.reload(); }
                    if (which == 2) {
                        nativeVideo.setSoftware(!nativeVideo.isSoftware());
                        nativeVideo.stop();
                        webView.reload();
                    }
                }).setNegativeButton("Cerrar", null).show();
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Cerrar Level 9 TV")
                .setMessage("¿Querés volver al inicio del televisor?")
                .setPositiveButton("Salir", (dialog, which) -> finish())
                .setNeutralButton("Opciones", (dialog, which) -> showAppMenu())
                .setNegativeButton("Cancelar", null)
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.resumeTimers();
        if (nativeVideo != null) nativeVideo.setForeground(true);
        enterImmersiveMode();
    }

    @Override
    protected void onPause() {
        if (nativeVideo != null) nativeVideo.setForeground(false);
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (nativeVideo != null) nativeVideo.stop();
        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.clearHistory();
            webView.removeAllViews();
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    private final class Level9WebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            if (nativeVideo != null) nativeVideo.stop();
            super.onPageStarted(view, url, favicon);
        }
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAllowed(uri)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                Toast.makeText(MainActivity.this, "No se pudo abrir el enlace", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            super.doUpdateVisitedHistory(view, url, isReload);
            observeUrl(url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            observeUrl(url);
            detectStoredPairing();
            view.requestFocus(View.FOCUS_DOWN);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) {
                Toast.makeText(MainActivity.this, "Sin conexión. Revisá el Wi-Fi y volvé a abrir la app.", Toast.LENGTH_LONG).show();
            }
        }
    }

    private final class Level9ChromeClient extends WebChromeClient {
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            webView.setVisibility(View.GONE);
            root.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
            enterImmersiveMode();
        }

        @Override
        public void onHideCustomView() {
            hideCustomView();
        }
    }
}

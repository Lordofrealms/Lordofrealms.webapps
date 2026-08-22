package com.lordofrealms.padgrade;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int LEGAL_ACCEPTANCE_REQUEST = 1000;
    private static final int LOCATION_PERMISSION_REQUEST = 1001;
    private static final int FILE_CHOOSER_REQUEST = 1002;
    private static final int SAVE_TEXT_REQUEST = 1003;
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final String APP_URL = APP_ORIGIN + "/assets/index.html";

    private WebView webView;
    private PadGradeNativeBridge nativeBridge;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String pendingSaveText;
    private Bundle pendingInitialState;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 15, 20));
        getWindow().setNavigationBarColor(Color.rgb(11, 15, 20));
        pendingInitialState = savedInstanceState;
        if (!LegalNoticeActivity.isAccepted(this)) {
            startActivityForResult(new Intent(this, LegalNoticeActivity.class), LEGAL_ACCEPTANCE_REQUEST);
            return;
        }
        initializeWebView(savedInstanceState);
    }

    private void initializeWebView(Bundle savedInstanceState) {
        if (webView != null) return;
        pendingInitialState = null;

        webView = new WebView(this);
        // Android 15/16 edge-to-edge enforcement can place a targetSdk 36 WebView
        // underneath the status bar/cutout. Apply the real system-bar insets to
        // the WebView itself instead of guessing at a CSS status-bar height.
        // Bottom remains unpadded here because the web UI already handles its
        // bottom safe area for the fixed action bar.
        webView.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, 0);
            return windowInsets;
        });
        setContentView(webView);
        webView.requestApplyInsets();

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);

        nativeBridge = new PadGradeNativeBridge(this, webView);
        webView.addJavascriptInterface(nativeBridge, "PadGradeNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader.shouldInterceptRequest(Uri.parse(url));
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority());
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return url == null || !url.startsWith(APP_ORIGIN + "/");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                if (origin == null || !origin.startsWith(APP_ORIGIN)) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},
                            LOCATION_PERMISSION_REQUEST);
                }
            }

            @Override public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (RuntimeException ex) {
                    fileChooserCallback = null;
                    return false;
                }
            }
        });

        if (savedInstanceState == null) webView.loadUrl(APP_URL);
        else webView.restoreState(savedInstanceState);
    }

    /** Called from the WebView JavaScript-interface thread. */
    public boolean requestSaveTextFile(String filename, String mimeType, String text) {
        if (isFinishing() || isDestroyed() || webView == null) return false;
        final String safeName = filename == null || filename.isBlank() ? "pad-grade.txt" : filename;
        final String safeMime = mimeType == null || mimeType.isBlank() ? "text/plain" : mimeType;
        final String safeText = text == null ? "" : text;
        runOnUiThread(() -> {
            pendingSaveText = safeText;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(safeMime)
                    .putExtra(Intent.EXTRA_TITLE, safeName);
            try {
                startActivityForResult(intent, SAVE_TEXT_REQUEST);
            } catch (RuntimeException ex) {
                pendingSaveText = null;
                Toast.makeText(this, "No file-save provider is available.", Toast.LENGTH_LONG).show();
            }
        });
        return true;
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeoCallback != null) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == LEGAL_ACCEPTANCE_REQUEST) {
            if (resultCode == RESULT_OK && LegalNoticeActivity.isAccepted(this)) {
                initializeWebView(pendingInitialState);
            } else {
                finish();
            }
            return;
        }
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
            return;
        }
        if (requestCode == SAVE_TEXT_REQUEST) {
            String text = pendingSaveText;
            pendingSaveText = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "w")) {
                if (out == null) throw new IOException("No output stream");
                out.write(text.getBytes(StandardCharsets.UTF_8));
                out.flush();
            } catch (IOException | RuntimeException ex) {
                Toast.makeText(this, "Could not save file: " + ex.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (nativeBridge != null) nativeBridge.destroy();
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
        pendingSaveText = null;
        if (webView != null) {
            webView.removeJavascriptInterface("PadGradeNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

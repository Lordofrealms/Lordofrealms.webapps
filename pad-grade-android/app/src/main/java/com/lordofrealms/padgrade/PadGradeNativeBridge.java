package com.lordofrealms.padgrade;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

/** Thin JavaScript bridge. Application logic remains in the canonical web code. */
public final class PadGradeNativeBridge implements PrecisionLocationClient.Listener {
    private final MainActivity activity;
    private final WebView webView;
    private final PrecisionLocationClient precisionClient;

    public PadGradeNativeBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.precisionClient = new PrecisionLocationClient(activity, this);
    }

    @JavascriptInterface
    public boolean isPrecisionLocationAvailable() {
        return precisionClient.isAvailable();
    }

    @JavascriptInterface
    public boolean startPrecisionLocation() {
        return precisionClient.startAndSubscribe();
    }

    @JavascriptInterface
    public void releasePrecisionLocation() {
        precisionClient.release();
    }

    @JavascriptInterface
    public boolean saveTextFile(String filename, String mimeType, String text) {
        return activity.requestSaveTextFile(filename, mimeType, text);
    }

    public void destroy() {
        precisionClient.release();
    }

    @Override public void onPrecisionLocation(String jsonPayload) {
        evaluate("window.__padGradeNativeLocation && window.__padGradeNativeLocation("
                + JSONObject.quote(jsonPayload) + ");");
    }

    @Override public void onPrecisionError(String message) {
        evaluate("window.__padGradeNativeLocationError && window.__padGradeNativeLocationError("
                + JSONObject.quote(message == null ? "Precision Location error" : message) + ");");
    }

    @Override public void onPrecisionStopped() {
        evaluate("window.__padGradeNativeProviderStopped && window.__padGradeNativeProviderStopped();");
    }

    private void evaluate(String javascript) {
        webView.post(() -> {
            if (webView.getHandler() != null) webView.evaluateJavascript(javascript, null);
        });
    }
}

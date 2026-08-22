package com.lordofrealms.padgrade;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

/** Thin JavaScript bridge. The canonical Pad Grade web code remains unchanged. */
public final class PadGradeNativeBridge implements PrecisionLocationClient.Listener {
    private final WebView webView;
    private final PrecisionLocationClient precisionClient;

    public PadGradeNativeBridge(WebView webView) {
        this.webView = webView;
        this.precisionClient = new PrecisionLocationClient(webView.getContext(), this);
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
            if (webView.getHandler() != null) {
                webView.evaluateJavascript(javascript, null);
            }
        });
    }
}

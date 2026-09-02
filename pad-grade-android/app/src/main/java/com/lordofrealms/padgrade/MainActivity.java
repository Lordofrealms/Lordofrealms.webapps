package com.lordofrealms.padgrade;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowInsets;
import android.window.OnBackInvokedDispatcher;
import android.webkit.GeolocationPermissions;
import android.webkit.RenderProcessGoneDetail;
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
    private static final int PROJECT_FOLDER_REQUEST = 1004;
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final String APP_URL = APP_ORIGIN + "/assets/index.html";
    private static final String LEGAL_PRELOAD_URL = APP_URL + "?legalPreload=1";

    private WebView webView;
    private PadGradeNativeBridge nativeBridge;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String pendingSaveText;
    private Bundle pendingInitialState;
    private boolean modernBackRegistered = false;
    private boolean legalReleasePending = false;
    private boolean webViewTimersPaused = false;
    private boolean pendingOneTimeLocationRecoveryNotice = false;
    private final String activityInstanceId = Long.toString(android.os.SystemClock.elapsedRealtime(), 36) + "-" + Integer.toHexString(System.identityHashCode(this));
    private PadGradeLifecycleBridge lifecycleBridge;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pendingOneTimeLocationRecoveryNotice = PadGradeLifecycleBridge.consumeOneTimePermissionRevokedExitNotice(this);
        PadGradeLifecycleBridge.recordHistoricalExitReasons(this, activityInstanceId);
        PadGradeLifecycleBridge.log(this, "activity.onCreate", activityInstanceId, savedInstanceState != null, null, null, null, "new-activity");
        getWindow().setStatusBarColor(Color.rgb(11, 15, 20));
        getWindow().setNavigationBarColor(Color.rgb(11, 15, 20));
        pendingInitialState = savedInstanceState;
        if (!LegalNoticeActivity.isAccepted(this)) {
            startActivityForResult(new Intent(this, LegalNoticeActivity.class), LEGAL_ACCEPTANCE_REQUEST);
            // Let the legal Activity paint first, then use the user's reading time to
            // preload local DOM/CSS/grid/layout work underneath it. The page carries
            // an explicit legalPreload flag so storage-choice and map/network startup
            // remain gated until acceptance is returned.
            getWindow().getDecorView().postDelayed(() -> {
                if (!isFinishing() && !isDestroyed() && !LegalNoticeActivity.isAccepted(this)) {
                    initializeWebView(null, true);
                }
            }, 250L);
            return;
        }
        initializeWebView(savedInstanceState, false);
        maybeShowOneTimeLocationRecoveryNotice();
    }

    private void initializeWebView(Bundle savedInstanceState, boolean legalPreload) {
        if (webView != null) return;
        pendingInitialState = null;

        webView = new WebView(this);
        // WebView.pauseTimers() is process-global. A prior Activity can pause the timer
        // pool and then be destroyed during hard reload, so every new foreground WebView
        // explicitly resumes the global pool instead of trusting an Activity-local flag.
        try { webView.resumeTimers(); } catch (RuntimeException ignored) {}
        PadGradeLifecycleBridge.log(this, "webview.created", activityInstanceId, savedInstanceState != null, null, null, null, legalPreload ? "legal-preload" : (savedInstanceState == null ? "fresh-load" : "restore-state"));
        webView.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.view.ViewGroup.LayoutParams raw = view.getLayoutParams();
            if (raw instanceof android.view.ViewGroup.MarginLayoutParams) {
                android.view.ViewGroup.MarginLayoutParams margins = (android.view.ViewGroup.MarginLayoutParams) raw;
                margins.setMargins(bars.left, bars.top, bars.right, bars.bottom);
                view.setLayoutParams(margins);
            }
            return windowInsets;
        });
        setContentView(webView);
        webView.requestApplyInsets();

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();

        WebSettings settings = webView.getSettings();
        settings.setMinimumFontSize(2);
        settings.setMinimumLogicalFontSize(2);
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
        lifecycleBridge = new PadGradeLifecycleBridge(this);
        webView.addJavascriptInterface(lifecycleBridge, "PadGradeLifecycle");

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return assetLoader.shouldInterceptRequest(request.getUrl()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) { return assetLoader.shouldInterceptRequest(Uri.parse(url)); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl(); return !APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return url == null || !url.startsWith(APP_ORIGIN + "/"); }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                PadGradeLifecycleBridge.log(MainActivity.this, "webview.rendererGone", activityInstanceId, false, null,
                        detail == null ? null : detail.didCrash(), detail == null ? null : detail.rendererPriorityAtExit(), "recovering-webview");
                if (view != webView) { try { view.destroy(); } catch (RuntimeException ignored) {} return true; }
                if (nativeBridge != null) { nativeBridge.destroy(); nativeBridge = null; }
                try { view.removeJavascriptInterface("PadGradeNative"); } catch (RuntimeException ignored) {}
                try { view.removeJavascriptInterface("PadGradeLifecycle"); } catch (RuntimeException ignored) {}
                try { view.stopLoading(); } catch (RuntimeException ignored) {}
                try { view.destroy(); } catch (RuntimeException ignored) {}
                webView = null; lifecycleBridge = null; webViewTimersPaused = false;
                initializeWebView(null, false);
                return true;
            }

            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                PadGradeLifecycleBridge.log(MainActivity.this, "webview.pageFinished", activityInstanceId, false, null, null, null, url != null && url.contains("legalPreload=1") ? "legal-preload" : "app-page");
                if (LegalNoticeActivity.isAccepted(MainActivity.this) && (legalReleasePending || (url != null && url.contains("legalPreload=1")))) {
                    releaseLegalPreload();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (origin == null || !origin.startsWith(APP_ORIGIN)) { callback.invoke(origin, false, false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }
                if (pendingGeoCallback != null) { callback.invoke(origin, false, false); return; }
                pendingGeoOrigin = origin; pendingGeoCallback = callback;
                showLocationPermissionEducationThenRequest();
            }

            @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = filePathCallback;
                try { startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST); return true; }
                catch (RuntimeException ex) { fileChooserCallback = null; return false; }
            }
        });

        registerModernBackCallback();
        if (legalPreload) webView.loadUrl(LEGAL_PRELOAD_URL);
        else if (savedInstanceState == null) webView.loadUrl(APP_URL);
        else webView.restoreState(savedInstanceState);
    }

    private void releaseLegalPreload() {
        if (webView == null || !LegalNoticeActivity.isAccepted(this)) return;
        legalReleasePending = false;
        webView.post(() -> webView.evaluateJavascript(
                "(function(){if(window.__padGradeLegalReleased===true)return;window.__padGradeLegalReleased=true;window.__padGradeLegalPreload=false;try{history.replaceState(null,'',location.pathname+location.hash);}catch(e){}try{window.dispatchEvent(new Event('padgrade-legal-accepted'));}catch(e){}})();",
                null));
    }

    private void registerModernBackCallback() {
        if (modernBackRegistered || Build.VERSION.SDK_INT < 33) return;
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::handleBackAction);
        modernBackRegistered = true;
    }

    private void notifyProjectFolderSelectionCancelled() {
        if (webView == null || isFinishing() || isDestroyed()) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.__padGradeProjectFolderSelectionCancelled && window.__padGradeProjectFolderSelectionCancelled();", null));
    }

    public void requestProjectFolder() {
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            try { startActivityForResult(intent, PROJECT_FOLDER_REQUEST); }
            catch (RuntimeException ex) {
                Toast.makeText(this, "No folder picker is available.", Toast.LENGTH_LONG).show();
                notifyProjectFolderSelectionCancelled();
            }
        });
    }

    public boolean requestSaveTextFile(String filename, String mimeType, String text) {
        if (isFinishing() || isDestroyed() || webView == null) return false;
        final String safeName = filename == null || filename.isBlank() ? "pad-grade.txt" : filename;
        final String safeMime = mimeType == null || mimeType.isBlank() ? "text/plain" : mimeType;
        final String safeText = text == null ? "" : text;
        runOnUiThread(() -> {
            pendingSaveText = safeText;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(safeMime).putExtra(Intent.EXTRA_TITLE, safeName);
            try { startActivityForResult(intent, SAVE_TEXT_REQUEST); }
            catch (RuntimeException ex) { pendingSaveText = null; Toast.makeText(this, "No file-save provider is available.", Toast.LENGTH_LONG).show(); }
        });
        return true;
    }

    private void pauseWebViewForBackground() {
        if (webView == null || webViewTimersPaused) return;
        try { webView.onPause(); } catch (RuntimeException ignored) {}
        try { webView.pauseTimers(); } catch (RuntimeException ignored) {}
        webViewTimersPaused = true;
        PadGradeLifecycleBridge.log(this, "webview.backgroundPaused", activityInstanceId, false, null, null, null, "onPause+pauseTimers");
    }

    private void resumeWebViewFromBackground() {
        if (webView == null) return;
        boolean wasPausedHere = webViewTimersPaused;
        // resumeTimers() is global to all WebViews in this process. Always call it on
        // foreground resume so a destroyed/recreated Activity cannot inherit a globally
        // paused timer pool while its own local flag starts false.
        try { webView.resumeTimers(); } catch (RuntimeException ignored) {}
        try { webView.onResume(); } catch (RuntimeException ignored) {}
        webViewTimersPaused = false;
        PadGradeLifecycleBridge.log(this, "webview.backgroundResumed", activityInstanceId, false, null, null, null,
                wasPausedHere ? "resumeTimers+onResume" : "global-resumeTimers+onResume");
    }

    @Override protected void onStart() {
        super.onStart();
        PadGradeLifecycleBridge.log(this, "activity.onStart", activityInstanceId, false, null, null, null, null);
    }

    @Override protected void onResume() {
        super.onResume();
        PadGradeLifecycleBridge.log(this, "activity.onResume", activityInstanceId, false, null, null, null, null);
        resumeWebViewFromBackground();
        if (nativeBridge != null) nativeBridge.onHostResume();
    }

    @Override protected void onPause() {
        PadGradeLifecycleBridge.log(this, "activity.onPause", activityInstanceId, false, null, null, null, null);
        super.onPause();
    }

    @Override protected void onStop() {
        PadGradeLifecycleBridge.log(this, "activity.onStop", activityInstanceId, false, null, null, null, null);
        pauseWebViewForBackground();
        super.onStop();
    }

    @Override public void onTrimMemory(int level) {
        PadGradeLifecycleBridge.log(this, "process.onTrimMemory", activityInstanceId, false, level, null, null, null);
        super.onTrimMemory(level);
    }

    @Override public void onLowMemory() {
        PadGradeLifecycleBridge.log(this, "process.onLowMemory", activityInstanceId, false, null, null, null, null);
        super.onLowMemory();
    }

    @Override protected void onSaveInstanceState(Bundle outState) { if (webView != null) webView.saveState(outState); super.onSaveInstanceState(outState); }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeoCallback != null) {
            boolean fineGranted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean coarseGranted = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, fineGranted, false);
            pendingGeoCallback = null; pendingGeoOrigin = null;
            if (!fineGranted) {
                switchToManualAfterLocationDenial();
                if (coarseGranted) showPreciseLocationRequired();
                else if (!shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)) showLocationPermissionSettingsRequired();
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == LEGAL_ACCEPTANCE_REQUEST) {
            if (resultCode == RESULT_OK && LegalNoticeActivity.isAccepted(this)) {
                if (webView == null) initializeWebView(pendingInitialState, false);
                else { legalReleasePending = true; releaseLegalPreload(); }
                maybeShowOneTimeLocationRecoveryNotice();
            } else finish();
            return;
        }
        if (requestCode == PROJECT_FOLDER_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && nativeBridge != null) {
                Uri uri = data.getData();
                int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try { getContentResolver().takePersistableUriPermission(uri, flags); }
                catch (SecurityException ignored) {}
                final PadGradeNativeBridge bridgeAtResult = nativeBridge;
                if (webView == null) {
                    bridgeAtResult.onProjectFolderSelected(uri);
                } else {
                    webView.evaluateJavascript(
                            "(function(){try{if(window.__padGradeBeginRecoveryVisualHold)window.__padGradeBeginRecoveryVisualHold();try{window.PadGradeDiag&&window.PadGradeDiag.mark&&window.PadGradeDiag.mark('recovery.v137-folder-picker-success-cover-handoff',{existingRecoveryCover:true,noNewCover:true,source:'android-folder-result'});}catch(e){}return !!document.documentElement.classList.contains('padGradeRecoveryHold');}catch(e){return false;}})();",
                            value -> {
                                if (!isFinishing() && !isDestroyed() && nativeBridge == bridgeAtResult) {
                                    bridgeAtResult.onProjectFolderSelected(uri);
                                }
                            });
                }
            } else {
                notifyProjectFolderSelectionCancelled();
            }
            return;
        }
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data); fileChooserCallback.onReceiveValue(result); fileChooserCallback = null; return;
        }
        if (requestCode == SAVE_TEXT_REQUEST) {
            String text = pendingSaveText; pendingSaveText = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "w")) {
                if (out == null) throw new IOException("No output stream");
                out.write(text.getBytes(StandardCharsets.UTF_8)); out.flush();
            } catch (IOException | RuntimeException ex) { Toast.makeText(this, "Could not save file: " + ex.getMessage(), Toast.LENGTH_LONG).show(); }
        }
    }

    private void clearPendingGeolocationRequest(boolean grant) {
        if (pendingGeoCallback == null) return;
        try { pendingGeoCallback.invoke(pendingGeoOrigin, grant, false); } catch (RuntimeException ignored) {}
        pendingGeoCallback = null; pendingGeoOrigin = null;
        if (!grant) switchToManualAfterLocationDenial();
    }

    private void switchToManualAfterLocationDenial() {
        if (webView == null || isFinishing() || isDestroyed()) return;
        webView.post(() -> webView.evaluateJavascript(
                "(function(){var b=document.getElementById('manualModeBtn');if(b&&!b.classList.contains('activeMode'))b.click();var i=document.getElementById('gpsInstruction');if(i)i.textContent='Location permission was not granted. Select GPS Guided to try again.';})();",
                null));
    }

    private void showLocationPermissionEducationThenRequest() {
        if (isFinishing() || isDestroyed()) { clearPendingGeolocationRequest(false); return; }
        new AlertDialog.Builder(this)
                .setTitle("Before Android asks for location")
                .setMessage("Pad Grade needs Precise location for GPS Guided surveying.\n\n" +
                        "On the Android permission screen, choose “While using the app” and keep Precise location enabled.\n\n" +
                        "Avoid “Only this time.” Android can revoke one-time location access after Pad Grade is minimized and terminate the app, making it look like Pad Grade closed.\n\n" +
                        "Pad Grade suspends GPS while minimized and does not request background location.")
                .setNegativeButton("Not now", (dialog, which) -> clearPendingGeolocationRequest(false))
                .setPositiveButton("Continue", (dialog, which) -> requestPermissions(
                        new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION},
                        LOCATION_PERMISSION_REQUEST))
                .setOnCancelListener(dialog -> clearPendingGeolocationRequest(false))
                .show();
    }

    private void showPreciseLocationRequired() {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
                .setTitle("Precise location required")
                .setMessage("Android granted approximate location only. GPS Guided surveying needs Precise location. Open Pad Grade app settings, choose Location, enable Precise location, and use “While using the app”.")
                .setNegativeButton("Not now", null)
                .setPositiveButton("Open App Settings", (dialog, which) -> openAppSettings())
                .show();
    }

    private void showLocationPermissionSettingsRequired() {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
                .setTitle("Location permission is disabled")
                .setMessage("GPS Guided requires Precise location. Android is no longer offering the normal permission prompt for Pad Grade. Enable Location and Precise location in App Settings, then return and select GPS Guided again.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Open App Settings", (dialog, which) -> openAppSettings())
                .show();
    }

    private void openAppSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (RuntimeException ex) {
            Toast.makeText(this, "Could not open app settings.", Toast.LENGTH_LONG).show();
        }
    }

    private void maybeShowOneTimeLocationRecoveryNotice() {
        if (!pendingOneTimeLocationRecoveryNotice || isFinishing() || isDestroyed()) return;
        pendingOneTimeLocationRecoveryNotice = false;
        getWindow().getDecorView().post(() -> {
            if (isFinishing() || isDestroyed()) return;
            new AlertDialog.Builder(this)
                    .setTitle("Temporary location access closed Pad Grade")
                    .setMessage("Android ended the previous Pad Grade process when its “Only this time” location permission was revoked.\n\n" +
                            "For reliable GPS Guided surveying, choose “While using the app” and Precise location. Pad Grade suspends GPS while minimized and does not need background location access.")
                    .setNegativeButton("OK", null)
                    .setPositiveButton("Open App Settings", (dialog, which) -> openAppSettings())
                    .show();
        });
    }

    private void confirmBackExit() {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
                .setTitle("Close Pad Grade?")
                .setMessage("Your project is autosaved. Close the app?")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Close", (dialog, which) -> finish())
                .show();
    }

    private void handleBackAction() {
        if (webView == null) { confirmBackExit(); return; }
        webView.evaluateJavascript("(function(){var ds=[...document.querySelectorAll('dialog[open]')];if(ds.length){var d=ds[ds.length-1];try{d.close();}catch(e){d.removeAttribute('open');}return true;}return false;})()", value -> {
            if ("true".equals(value)) return;
            confirmBackExit();
        });
    }

    @Override public void onBackPressed() { handleBackAction(); }

    @Override protected void onDestroy() {
        PadGradeLifecycleBridge.log(this, "activity.onDestroy", activityInstanceId, false, null, null, null, isChangingConfigurations() ? "configuration-change" : "destroy");
        if (nativeBridge != null) nativeBridge.destroy();
        if (fileChooserCallback != null) { fileChooserCallback.onReceiveValue(null); fileChooserCallback = null; }
        pendingSaveText = null;
        if (webView != null) { webView.removeJavascriptInterface("PadGradeNative"); webView.removeJavascriptInterface("PadGradeLifecycle"); webView.destroy(); webView = null; }
        webViewTimersPaused = false;
        super.onDestroy();
    }
}

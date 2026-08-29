package com.lordofrealms.padgrade;

import android.content.Context;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.view.Surface;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.documentfile.provider.DocumentFile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Thin JavaScript bridge. Application logic remains in the canonical web code. */
public final class PadGradeNativeBridge implements PrecisionLocationClient.Listener, SensorEventListener {
    private static final String PREFS = "pad_grade_native";
    private static final String PROJECT_FOLDER_URI = "project_folder_uri";
    private static final String SETTINGS_FILE = "Pad-Grade-Settings.pgsettings";

    private final MainActivity activity;
    private final WebView webView;
    private final PrecisionLocationClient precisionClient;
    private final SensorManager sensorManager;
    private final Sensor rotationSensor;
    private final Object folderCacheLock = new Object();
    private final Map<String, DocumentFile> projectFileCache = new LinkedHashMap<>();
    private final ExecutorService fileExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "PadGradeFileIO");
        thread.setDaemon(true);
        return thread;
    });

    private DocumentFile cachedProjectFolder;
    private String cachedProjectFolderUri;
    private volatile boolean projectFileCacheLoaded = false;
    private volatile boolean projectFileCacheLoading = false;
    private volatile boolean projectFolderRecoveryPending = false;

    private boolean headingActive;
    private double lastLatitude = Double.NaN;
    private double lastLongitude = Double.NaN;
    private double lastAltitude = 0.0;
    private long lastLocationTimeMs = 0L;
    private float smoothedHeading = Float.NaN;

    public PadGradeNativeBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.precisionClient = new PrecisionLocationClient(activity, this);
        this.sensorManager = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        this.rotationSensor = sensorManager == null ? null : sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        primeProjectFileCacheAsync();
    }

    @JavascriptInterface public boolean isPrecisionLocationAvailable() { return precisionClient.isAvailable(); }
    @JavascriptInterface public boolean startPrecisionLocation() { return precisionClient.startAndSubscribe(); }
    @JavascriptInterface public void releasePrecisionLocation() { precisionClient.release(); }
    @JavascriptInterface public boolean startHeadingUpdates() { if (sensorManager == null || rotationSensor == null) return false; if (!headingActive) headingActive = sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_UI); return headingActive; }
    @JavascriptInterface public void stopHeadingUpdates() { if (sensorManager != null) sensorManager.unregisterListener(this); headingActive = false; smoothedHeading = Float.NaN; }
    @JavascriptInterface public boolean saveTextFile(String filename, String mimeType, String text) { return activity.requestSaveTextFile(filename, mimeType, text); }
    @JavascriptInterface public void chooseProjectFolder() { activity.requestProjectFolder(); }
    @JavascriptInterface public boolean hasProjectFolder() { return getProjectFolder() != null; }
    /** Cheap v0.9.6 startup probe: reports a configured folder URI without querying the SAF provider. */
    @JavascriptInterface public boolean hasProjectFolderConfigured() {
        String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PROJECT_FOLDER_URI, null);
        return raw != null && !raw.isBlank();
    }
    @JavascriptInterface public boolean isProjectFolderIndexReady() { return projectFileCacheLoaded; }
    @JavascriptInterface public boolean isProjectFolderRecoveryPending() { return projectFolderRecoveryPending; }
    @JavascriptInterface public void completeProjectFolderRecovery() { projectFolderRecoveryPending = false; }

    @JavascriptInterface public String listProjectFiles() {
        JSONArray out = new JSONArray();
        if (getProjectFolder() == null) return out.toString();
        if (!projectFileCacheLoaded) {
            primeProjectFileCacheAsync();
            return out.toString();
        }
        synchronized (folderCacheLock) {
            for (Map.Entry<String, DocumentFile> entry : projectFileCache.entrySet()) {
                String name = entry.getKey();
                DocumentFile file = entry.getValue();
                // The directory walk already populated this cache on the background index thread.
                // Do not call DocumentFile.isFile() here: TreeDocumentFile may query the provider again,
                // turning a cached JS list request into one synchronous SAF query per entry.
                if (name == null || file == null) continue;
                String lower = name.toLowerCase();
                if (lower.endsWith(".padgrade") || lower.endsWith(".padgrade.json") || lower.endsWith(".json")) out.put(name);
            }
        }
        return out.toString();
    }

    @JavascriptInterface public String readProjectFile(String filename) {
        DocumentFile file = findProjectFile(filename);
        if (file == null) return null;
        try (InputStream in = activity.getContentResolver().openInputStream(file.getUri())) {
            if (in == null) return null;
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(); String line; while ((line = reader.readLine()) != null) sb.append(line).append('\n'); return sb.toString();
        } catch (IOException | SecurityException ex) { return null; }
    }

    @JavascriptInterface public boolean writeProjectFile(String filename, String text) {
        DocumentFile folder = getProjectFolder(); if (folder == null) return false;
        if (!projectFileCacheLoaded) { primeProjectFileCacheAsync(); return false; }
        // During a clean-install folder reconnect, the surviving settings file is
        // authoritative. Keep it read-only until JavaScript explicitly finishes
        // recovery; a time-based grace period was unsafe on slow SAF providers.
        if (SETTINGS_FILE.equals(filename) && projectFolderRecoveryPending) return false;
        try {
            DocumentFile file = findProjectFile(filename);
            if (file == null) {
                file = folder.createFile("application/octet-stream", filename);
                if (file == null) return false;
                synchronized (folderCacheLock) { projectFileCache.put(filename, file); }
            }
            try (OutputStream out = activity.getContentResolver().openOutputStream(file.getUri(), "wt")) {
                if (out == null) return false;
                out.write((text == null ? "" : text).getBytes(StandardCharsets.UTF_8)); out.flush(); return true;
            }
        } catch (IOException | SecurityException ex) { return false; }
    }

    @JavascriptInterface public boolean deleteProjectFile(String filename) {
        DocumentFile file = findProjectFile(filename);
        boolean deleted = file != null && file.delete();
        if (deleted) synchronized (folderCacheLock) { projectFileCache.remove(filename); }
        return deleted;
    }

    @JavascriptInterface public void readProjectFileAsync(String filename, String requestId) {
        fileExecutor.execute(() -> {
            long started = System.nanoTime();
            String text = null;
            String error = null;
            try { text = readProjectFile(filename); }
            catch (RuntimeException ex) { error = ex.getMessage(); }
            emitFileOperationResult(requestId, text != null, text, elapsedMs(started), error, text == null ? 0 : text.length());
        });
    }

    @JavascriptInterface public void writeProjectFileAsync(String filename, String text, String requestId) {
        final String safeText = text == null ? "" : text;
        fileExecutor.execute(() -> {
            long started = System.nanoTime();
            boolean ok = false;
            String error = null;
            try { ok = writeProjectFile(filename, safeText); }
            catch (RuntimeException ex) { error = ex.getMessage(); }
            emitFileOperationResult(requestId, ok, null, elapsedMs(started), error, safeText.length());
        });
    }

    @JavascriptInterface public void deleteProjectFileAsync(String filename, String requestId) {
        fileExecutor.execute(() -> {
            long started = System.nanoTime();
            boolean ok = false;
            String error = null;
            try { ok = deleteProjectFile(filename); }
            catch (RuntimeException ex) { error = ex.getMessage(); }
            emitFileOperationResult(requestId, ok, null, elapsedMs(started), error, 0);
        });
    }

    private static double elapsedMs(long startedNanos) {
        return Math.max(0.0, (System.nanoTime() - startedNanos) / 1_000_000.0);
    }

    private void emitFileOperationResult(String requestId, boolean ok, String text, double durationMs, String error, int size) {
        JSONObject result = new JSONObject();
        try {
            result.put("requestId", requestId == null ? "" : requestId);
            result.put("ok", ok);
            result.put("durationMs", durationMs);
            result.put("size", Math.max(0, size));
            if (text != null) result.put("text", text);
            if (error != null && !error.isBlank()) result.put("error", error);
        } catch (Exception ignored) {}
        evaluate("window.__padGradeNativeFileOpCompleted && window.__padGradeNativeFileOpCompleted(" + result.toString() + ");");
    }

    public void onProjectFolderSelected(Uri uri) {
        if (uri == null) return;
        projectFolderRecoveryPending = true;
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PROJECT_FOLDER_URI, uri.toString()).commit();
        synchronized (folderCacheLock) {
            cachedProjectFolderUri = uri.toString();
            cachedProjectFolder = DocumentFile.fromTreeUri(activity, uri);
            projectFileCache.clear();
            projectFileCacheLoaded = false;
            projectFileCacheLoading = false;
        }
        primeProjectFileCacheAsync();
        evaluate("window.__padGradeProjectFolderChanged && window.__padGradeProjectFolderChanged();try{window.dispatchEvent(new Event('padgrade-project-folder-selected'));}catch(e){}");
    }

    private DocumentFile getProjectFolder() {
        String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PROJECT_FOLDER_URI, null);
        if (raw == null || raw.isBlank()) return null;
        synchronized (folderCacheLock) {
            if (raw.equals(cachedProjectFolderUri) && cachedProjectFolder != null) return cachedProjectFolder;
            try {
                DocumentFile folder = DocumentFile.fromTreeUri(activity, Uri.parse(raw));
                if (folder == null || !folder.exists() || !folder.canRead() || !folder.canWrite()) {
                    clearFolderCacheLocked();
                    return null;
                }
                cachedProjectFolderUri = raw;
                cachedProjectFolder = folder;
                projectFileCache.clear();
                projectFileCacheLoaded = false;
                return folder;
            } catch (Exception ex) {
                clearFolderCacheLocked();
                return null;
            }
        }
    }

    private void clearFolderCacheLocked() {
        cachedProjectFolder = null;
        cachedProjectFolderUri = null;
        projectFileCache.clear();
        projectFileCacheLoaded = false;
        projectFileCacheLoading = false;
    }

    private void ensureProjectFileCache() {
        if (projectFileCacheLoaded) return;
        DocumentFile folder = getProjectFolder();
        if (folder == null) return;
        DocumentFile[] files;
        try { files = folder.listFiles(); }
        catch (RuntimeException ex) { files = new DocumentFile[0]; }
        synchronized (folderCacheLock) {
            projectFileCache.clear();
            for (DocumentFile file : files) {
                if (file == null) continue;
                String name = file.getName();
                if (name != null) projectFileCache.put(name, file);
            }
            projectFileCacheLoaded = true;
            projectFileCacheLoading = false;
        }
    }

    private void primeProjectFileCacheAsync() {
        synchronized (folderCacheLock) {
            if (projectFileCacheLoaded || projectFileCacheLoading) return;
            projectFileCacheLoading = true;
        }
        Thread worker = new Thread(() -> {
            long started = System.nanoTime();
            try { ensureProjectFileCache(); }
            finally {
                int count;
                synchronized (folderCacheLock) { projectFileCacheLoading = false; count = projectFileCache.size(); }
                double durationMs = elapsedMs(started);
                evaluate("window.__padGradeProjectFolderIndexed && window.__padGradeProjectFolderIndexed();try{window.dispatchEvent(new CustomEvent('padgrade-project-folder-indexed',{detail:{durationMs:" + durationMs + ",fileCount:" + count + "}}));}catch(e){}");
            }
        }, "PadGradeFolderIndex");
        worker.setDaemon(true);
        worker.start();
    }

    private DocumentFile findProjectFile(String filename) {
        if (filename == null) return null;
        if (!projectFileCacheLoaded) { primeProjectFileCacheAsync(); return null; }
        synchronized (folderCacheLock) { return projectFileCache.get(filename); }
    }

    public void destroy() { stopHeadingUpdates(); precisionClient.release(); fileExecutor.shutdownNow(); }

    @Override public void onPrecisionLocation(String jsonPayload) { try { JSONObject p = new JSONObject(jsonPayload); if (p.has("latitude") && p.has("longitude")) { lastLatitude = p.optDouble("latitude", Double.NaN); lastLongitude = p.optDouble("longitude", Double.NaN); lastAltitude = p.optDouble("altitude", 0.0); lastLocationTimeMs = p.optLong("timestamp", System.currentTimeMillis()); } } catch (Exception ignored) {} evaluate("window.__padGradeNativeLocation && window.__padGradeNativeLocation(" + JSONObject.quote(jsonPayload) + ");"); }
    @Override public void onPrecisionError(String message) { evaluate("window.__padGradeNativeLocationError && window.__padGradeNativeLocationError(" + JSONObject.quote(message == null ? "Precision Location error" : message) + ");"); }
    @Override public void onPrecisionStopped() { evaluate("window.__padGradeNativeProviderStopped && window.__padGradeNativeProviderStopped();"); }

    @Override public void onSensorChanged(SensorEvent event) {
        if (!headingActive || event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;
        float[] base = new float[9]; float[] adjusted = new float[9]; SensorManager.getRotationMatrixFromVector(base, event.values);
        int rotation = activity.getDisplay() == null ? Surface.ROTATION_0 : activity.getDisplay().getRotation(); int xAxis = SensorManager.AXIS_X, yAxis = SensorManager.AXIS_Y;
        if (rotation == Surface.ROTATION_90) { xAxis = SensorManager.AXIS_Y; yAxis = SensorManager.AXIS_MINUS_X; } else if (rotation == Surface.ROTATION_180) { xAxis = SensorManager.AXIS_MINUS_X; yAxis = SensorManager.AXIS_MINUS_Y; } else if (rotation == Surface.ROTATION_270) { xAxis = SensorManager.AXIS_MINUS_Y; yAxis = SensorManager.AXIS_X; }
        SensorManager.remapCoordinateSystem(base, xAxis, yAxis, adjusted); float[] orientation = new float[3]; SensorManager.getOrientation(adjusted, orientation); float magneticHeading = normalize((float) Math.toDegrees(orientation[0])); float declination = 0f;
        if (Double.isFinite(lastLatitude) && Double.isFinite(lastLongitude)) { long when = lastLocationTimeMs > 0L ? lastLocationTimeMs : System.currentTimeMillis(); declination = new GeomagneticField((float) lastLatitude, (float) lastLongitude, (float) lastAltitude, when).getDeclination(); }
        smoothedHeading = smoothAngle(smoothedHeading, normalize(magneticHeading + declination), 0.22f); JSONObject payload = new JSONObject(); try { payload.put("heading", smoothedHeading); payload.put("accuracy", JSONObject.NULL); payload.put("source", "Android rotation vector"); } catch (Exception ignored) {} evaluate("window.__padGradeNativeHeading && window.__padGradeNativeHeading(" + JSONObject.quote(payload.toString()) + ");");
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    private static float normalize(float value) { float out = value % 360f; if (out < 0f) out += 360f; return out; }
    private static float smoothAngle(float oldDeg, float newDeg, float alpha) { if (!Float.isFinite(oldDeg)) return newDeg; float delta = ((newDeg - oldDeg + 540f) % 360f) - 180f; return normalize(oldDeg + alpha * delta); }
    private void evaluate(String javascript) { webView.post(() -> { if (webView.getHandler() != null) webView.evaluateJavascript(javascript, null); }); }
}

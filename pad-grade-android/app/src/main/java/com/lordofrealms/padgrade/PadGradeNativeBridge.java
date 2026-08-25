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
    @JavascriptInterface public boolean isProjectFolderIndexReady() { return projectFileCacheLoaded; }
    @JavascriptInterface public boolean isProjectFolderRecoveryPending() { return projectFolderRecoveryPending; }
    @JavascriptInterface public void completeProjectFolderRecovery() { projectFolderRecoveryPending = false; }

    @JavascriptInterface public String listProjectFiles() {
        JSONArray out = new JSONArray();
        if (getProjectFolder() == null) return out.toString();
        ensureProjectFileCache();
        synchronized (folderCacheLock) {
            for (Map.Entry<String, DocumentFile> entry : projectFileCache.entrySet()) {
                String name = entry.getKey();
                DocumentFile file = entry.getValue();
                if (name == null || file == null || !file.isFile()) continue;
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
        // Index once in the background. Previous builds repeatedly called
        // DocumentFile.listFiles() for settings, the active project, and then the
        // project reconciler, which could turn one folder reconnect into 10–20 s.
        primeProjectFileCacheAsync();
        evaluate("window.__padGradeProjectFolderChanged && window.__padGradeProjectFolderChanged();");
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
            try { ensureProjectFileCache(); }
            finally {
                synchronized (folderCacheLock) { projectFileCacheLoading = false; }
                evaluate("window.__padGradeProjectFolderIndexed && window.__padGradeProjectFolderIndexed();");
            }
        }, "PadGradeFolderIndex");
        worker.setDaemon(true);
        worker.start();
    }

    private DocumentFile findProjectFile(String filename) {
        if (filename == null) return null;
        if (!projectFileCacheLoaded) ensureProjectFileCache();
        synchronized (folderCacheLock) { return projectFileCache.get(filename); }
    }

    public void destroy() { stopHeadingUpdates(); precisionClient.release(); }

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

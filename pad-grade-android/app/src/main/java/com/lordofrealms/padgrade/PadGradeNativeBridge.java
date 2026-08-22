package com.lordofrealms.padgrade;

import android.content.Context;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.Surface;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

/** Thin JavaScript bridge. Application logic remains in the canonical web code. */
public final class PadGradeNativeBridge implements PrecisionLocationClient.Listener, SensorEventListener {
    private final MainActivity activity;
    private final WebView webView;
    private final PrecisionLocationClient precisionClient;
    private final SensorManager sensorManager;
    private final Sensor rotationSensor;
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
        Sensor preferred = sensorManager == null ? null : sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        this.rotationSensor = preferred;
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
    public boolean startHeadingUpdates() {
        if (sensorManager == null || rotationSensor == null) return false;
        if (!headingActive) {
            headingActive = sensorManager.registerListener(
                    this, rotationSensor, SensorManager.SENSOR_DELAY_UI);
        }
        return headingActive;
    }

    @JavascriptInterface
    public void stopHeadingUpdates() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        headingActive = false;
        smoothedHeading = Float.NaN;
    }

    @JavascriptInterface
    public boolean saveTextFile(String filename, String mimeType, String text) {
        return activity.requestSaveTextFile(filename, mimeType, text);
    }

    public void destroy() {
        stopHeadingUpdates();
        precisionClient.release();
    }

    @Override public void onPrecisionLocation(String jsonPayload) {
        try {
            JSONObject p = new JSONObject(jsonPayload);
            if (p.has("latitude") && p.has("longitude")) {
                lastLatitude = p.optDouble("latitude", Double.NaN);
                lastLongitude = p.optDouble("longitude", Double.NaN);
                lastAltitude = p.optDouble("altitude", 0.0);
                lastLocationTimeMs = p.optLong("timestamp", System.currentTimeMillis());
            }
        } catch (Exception ignored) {}
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

    @Override public void onSensorChanged(SensorEvent event) {
        if (!headingActive || event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;

        float[] base = new float[9];
        float[] adjusted = new float[9];
        SensorManager.getRotationMatrixFromVector(base, event.values);

        int rotation = activity.getDisplay() == null ? Surface.ROTATION_0 : activity.getDisplay().getRotation();
        int xAxis = SensorManager.AXIS_X;
        int yAxis = SensorManager.AXIS_Y;
        if (rotation == Surface.ROTATION_90) {
            xAxis = SensorManager.AXIS_Y;
            yAxis = SensorManager.AXIS_MINUS_X;
        } else if (rotation == Surface.ROTATION_180) {
            xAxis = SensorManager.AXIS_MINUS_X;
            yAxis = SensorManager.AXIS_MINUS_Y;
        } else if (rotation == Surface.ROTATION_270) {
            xAxis = SensorManager.AXIS_MINUS_Y;
            yAxis = SensorManager.AXIS_X;
        }
        SensorManager.remapCoordinateSystem(base, xAxis, yAxis, adjusted);

        float[] orientation = new float[3];
        SensorManager.getOrientation(adjusted, orientation);
        float magneticHeading = (float) Math.toDegrees(orientation[0]);
        magneticHeading = normalize(magneticHeading);

        float declination = 0f;
        if (Double.isFinite(lastLatitude) && Double.isFinite(lastLongitude)) {
            long when = lastLocationTimeMs > 0L ? lastLocationTimeMs : System.currentTimeMillis();
            GeomagneticField field = new GeomagneticField(
                    (float) lastLatitude, (float) lastLongitude, (float) lastAltitude, when);
            declination = field.getDeclination();
        }
        float trueHeading = normalize(magneticHeading + declination);
        smoothedHeading = smoothAngle(smoothedHeading, trueHeading, 0.22f);

        JSONObject payload = new JSONObject();
        try {
            payload.put("heading", smoothedHeading);
            // Android rotation-vector sensors do not expose a standardized compass
            // accuracy in degrees. Null tells the UI not to invent one.
            payload.put("accuracy", JSONObject.NULL);
            payload.put("source", "Android rotation vector");
        } catch (Exception ignored) {}
        evaluate("window.__padGradeNativeHeading && window.__padGradeNativeHeading("
                + JSONObject.quote(payload.toString()) + ");");
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // SensorManager accuracy is categorical, not angular degrees, so the UI
        // intentionally does not present it as a +/- heading accuracy.
    }

    private static float normalize(float value) {
        float out = value % 360f;
        if (out < 0f) out += 360f;
        return out;
    }

    private static float smoothAngle(float oldDeg, float newDeg, float alpha) {
        if (!Float.isFinite(oldDeg)) return newDeg;
        float delta = ((newDeg - oldDeg + 540f) % 360f) - 180f;
        return normalize(oldDeg + alpha * delta);
    }

    private void evaluate(String javascript) {
        webView.post(() -> {
            if (webView.getHandler() != null) webView.evaluateJavascript(javascript, null);
        });
    }
}

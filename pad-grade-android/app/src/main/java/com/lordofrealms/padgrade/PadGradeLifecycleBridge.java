package com.lordofrealms.padgrade;

import android.app.ActivityManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Debug;
import android.os.Process;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

/** Persistent, privacy-safe Android lifecycle breadcrumbs for DEV diagnostics. */
public final class PadGradeLifecycleBridge {
    private static final String PREFS = "pad_grade_lifecycle_diag";
    private static final String EVENTS = "events";
    private static final String SEQ = "seq";
    private static final int MAX_EVENTS = 180;
    private final Context context;

    public PadGradeLifecycleBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    private static long memoryStatKb(Debug.MemoryInfo info, String key) {
        if (info == null || key == null) return -1L;
        try {
            String value = info.getMemoryStat(key);
            if (value == null || value.isBlank()) return -1L;
            return Long.parseLong(value);
        } catch (Exception ignored) {
            return -1L;
        }
    }

    /**
     * Snapshot both process-local and device-pressure memory without changing app
     * behavior. Values ending in Kb are KiB as reported by Android Debug APIs.
     */
    private static JSONObject memorySnapshot(Context context) {
        JSONObject out = new JSONObject();
        try {
            Debug.MemoryInfo process = new Debug.MemoryInfo();
            Debug.getMemoryInfo(process);
            Runtime runtime = Runtime.getRuntime();

            out.put("totalPssKb", process.getTotalPss());
            out.put("totalPrivateDirtyKb", process.getTotalPrivateDirty());
            out.put("totalSharedDirtyKb", process.getTotalSharedDirty());
            out.put("javaHeapPssKb", memoryStatKb(process, "summary.java-heap"));
            out.put("nativeHeapPssKb", memoryStatKb(process, "summary.native-heap"));
            out.put("codePssKb", memoryStatKb(process, "summary.code"));
            out.put("stackPssKb", memoryStatKb(process, "summary.stack"));
            out.put("graphicsPssKb", memoryStatKb(process, "summary.graphics"));
            out.put("privateOtherPssKb", memoryStatKb(process, "summary.private-other"));
            out.put("systemPssKb", memoryStatKb(process, "summary.system"));
            out.put("totalSwapPssKb", memoryStatKb(process, "summary.total-swap"));

            out.put("javaUsedKb", (runtime.totalMemory() - runtime.freeMemory()) / 1024L);
            out.put("javaCommittedKb", runtime.totalMemory() / 1024L);
            out.put("javaMaxKb", runtime.maxMemory() / 1024L);
            out.put("nativeAllocatedKb", Debug.getNativeHeapAllocatedSize() / 1024L);
            out.put("nativeHeapSizeKb", Debug.getNativeHeapSize() / 1024L);
            out.put("nativeHeapFreeKb", Debug.getNativeHeapFreeSize() / 1024L);

            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager != null) {
                ActivityManager.MemoryInfo device = new ActivityManager.MemoryInfo();
                manager.getMemoryInfo(device);
                out.put("deviceAvailKb", device.availMem / 1024L);
                out.put("deviceThresholdKb", device.threshold / 1024L);
                out.put("deviceLowMemory", device.lowMemory);
                out.put("memoryClassMb", manager.getMemoryClass());
                out.put("largeMemoryClassMb", manager.getLargeMemoryClass());
            }

            ActivityManager.RunningAppProcessInfo state = new ActivityManager.RunningAppProcessInfo();
            ActivityManager.getMyMemoryState(state);
            out.put("importance", state.importance);
            out.put("lastTrimLevel", state.lastTrimLevel);
            out.put("lru", state.lru);
        } catch (Exception ex) {
            try { out.put("error", String.valueOf(ex.getMessage())); } catch (Exception ignored) {}
        }
        return out;
    }

    public static synchronized void log(Context context, String event, String activityId, boolean savedState,
                                        Integer trimLevel, Boolean rendererCrash, Integer rendererPriority,
                                        String detail) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int seq = prefs.getInt(SEQ, 0) + 1;
        JSONArray prior;
        try { prior = new JSONArray(prefs.getString(EVENTS, "[]")); }
        catch (Exception ex) { prior = new JSONArray(); }
        JSONArray next = new JSONArray();
        int start = Math.max(0, prior.length() - (MAX_EVENTS - 1));
        for (int i = start; i < prior.length(); i++) {
            JSONObject old = prior.optJSONObject(i);
            if (old != null) next.put(old);
        }
        JSONObject row = new JSONObject();
        try {
            row.put("seq", seq);
            row.put("at", System.currentTimeMillis());
            row.put("event", event == null ? "lifecycle" : event);
            row.put("pid", Process.myPid());
            row.put("activity", activityId == null ? "" : activityId);
            row.put("savedState", savedState);
            if (trimLevel != null) row.put("trimLevel", trimLevel);
            if (rendererCrash != null) row.put("rendererCrash", rendererCrash);
            if (rendererPriority != null) row.put("rendererPriority", rendererPriority);
            if (detail != null && !detail.isBlank()) row.put("detail", detail.length() > 180 ? detail.substring(0, 180) : detail);
            row.put("memory", memorySnapshot(context));
        } catch (Exception ignored) {}
        next.put(row);
        // Lifecycle breadcrumbs are specifically intended to survive abrupt process
        // reclamation, so use commit() here rather than an async apply(). The record
        // is tiny and this code only runs at coarse Android lifecycle boundaries.
        prefs.edit().putInt(SEQ, seq).putString(EVENTS, next.toString()).commit();
    }

    @JavascriptInterface public String getEvents() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(EVENTS, "[]");
    }

    @JavascriptInterface public int getProcessId() { return Process.myPid(); }

    @JavascriptInterface public String getMemorySnapshot() {
        return memorySnapshot(context).toString();
    }
}

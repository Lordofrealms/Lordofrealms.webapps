package com.lordofrealms.padgrade;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Debug;
import android.os.Process;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Persistent, privacy-safe Android lifecycle breadcrumbs for DEV diagnostics. */
public final class PadGradeLifecycleBridge {
    private static final String PREFS = "pad_grade_lifecycle_diag";
    private static final String EVENTS = "events";
    private static final String SEQ = "seq";
    private static final String LAST_EXIT_FINGERPRINT = "last_exit_fingerprint";
    private static final String LAST_PERMISSION_NOTICE_FINGERPRINT = "last_permission_notice_fingerprint";
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

    private static synchronized int appendRow(Context context, JSONObject row) {
        if (context == null || row == null) return 0;
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
        try {
            row.put("seq", seq);
            if (!row.has("at")) row.put("at", System.currentTimeMillis());
        } catch (Exception ignored) {}
        next.put(row);
        // Lifecycle and exit breadcrumbs are specifically intended to survive abrupt
        // process reclamation, so use commit() rather than asynchronous apply().
        prefs.edit().putInt(SEQ, seq).putString(EVENTS, next.toString()).commit();
        return seq;
    }

    public static void log(Context context, String event, String activityId, boolean savedState,
                           Integer trimLevel, Boolean rendererCrash, Integer rendererPriority,
                           String detail) {
        if (context == null) return;
        JSONObject row = new JSONObject();
        try {
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
        appendRow(context, row);
    }

    private static String reasonName(int reason) {
        switch (reason) {
            case 0: return "UNKNOWN";
            case 1: return "EXIT_SELF";
            case 2: return "SIGNALED";
            case 3: return "LOW_MEMORY";
            case 4: return "CRASH";
            case 5: return "CRASH_NATIVE";
            case 6: return "ANR";
            case 7: return "INITIALIZATION_FAILURE";
            case 8: return "PERMISSION_CHANGE";
            case 9: return "EXCESSIVE_RESOURCE_USAGE";
            case 10: return "USER_REQUESTED";
            case 11: return "USER_STOPPED";
            case 12: return "DEPENDENCY_DIED";
            case 13: return "OTHER";
            case 14: return "FREEZER";
            case 15: return "PACKAGE_STATE_CHANGE";
            case 16: return "PACKAGE_UPDATED";
            default: return "REASON_" + reason;
        }
    }

    private static String exitFingerprint(ApplicationExitInfo info) {
        if (info == null) return "";
        return info.getTimestamp() + ":" + info.getPid() + ":" + info.getReason() + ":" + info.getStatus();
    }

    /**
     * Import Android's historical process-exit diagnosis into the same durable,
     * privacy-safe breadcrumb store. This runs at the next Activity creation and
     * therefore survives the exact class of abrupt host-process death being tested.
     */
    public static void recordHistoricalExitReasons(Context context, String activityId) {
        if (context == null) return;
        try {
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) return;
            List<ApplicationExitInfo> exits = manager.getHistoricalProcessExitReasons(context.getPackageName(), 0, 8);
            if (exits == null || exits.isEmpty()) return;

            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String previousFingerprint = prefs.getString(LAST_EXIT_FINGERPRINT, "");
            String newestFingerprint = exitFingerprint(exits.get(0));
            if (!newestFingerprint.isEmpty() && newestFingerprint.equals(previousFingerprint)) return;

            List<ApplicationExitInfo> unseen = new ArrayList<>();
            for (ApplicationExitInfo info : exits) {
                String fingerprint = exitFingerprint(info);
                if (!previousFingerprint.isEmpty() && previousFingerprint.equals(fingerprint)) break;
                unseen.add(info);
            }
            Collections.reverse(unseen);
            boolean lowMemoryReportSupported = ActivityManager.isLowMemoryKillReportSupported();

            for (ApplicationExitInfo info : unseen) {
                JSONObject row = new JSONObject();
                try {
                    row.put("event", "process.previous-exit");
                    row.put("pid", Process.myPid());
                    row.put("activity", activityId == null ? "" : activityId);
                    row.put("savedState", false);
                    row.put("previousPid", info.getPid());
                    row.put("processName", info.getProcessName() == null ? "" : info.getProcessName());
                    row.put("exitReason", info.getReason());
                    row.put("exitReasonName", reasonName(info.getReason()));
                    row.put("exitStatus", info.getStatus());
                    row.put("exitImportance", info.getImportance());
                    row.put("exitPssKb", info.getPss());
                    row.put("exitRssKb", info.getRss());
                    row.put("exitTimestamp", info.getTimestamp());
                    row.put("lowMemoryKillReportSupported", lowMemoryReportSupported);
                    String description = info.getDescription();
                    if (description != null && !description.isBlank()) {
                        row.put("detail", description.length() > 180 ? description.substring(0, 180) : description);
                    }
                } catch (Exception ignored) {}
                appendRow(context, row);
            }

            if (!newestFingerprint.isEmpty()) prefs.edit().putString(LAST_EXIT_FINGERPRINT, newestFingerprint).commit();
        } catch (Exception ex) {
            JSONObject row = new JSONObject();
            try {
                row.put("event", "process.previous-exit-query-failed");
                row.put("pid", Process.myPid());
                row.put("activity", activityId == null ? "" : activityId);
                row.put("savedState", false);
                row.put("detail", String.valueOf(ex.getMessage()));
            } catch (Exception ignored) {}
            appendRow(context, row);
        }
    }


    /**
     * Application behavior path, intentionally independent of web diagnostics. Android
     * owns ApplicationExitInfo outside the process that died, so this can explain a
     * one-time-location revocation even when Pad Grade diagnostic logging was disabled.
     * The fingerprint is consumed once so the same historical exit never nags again.
     */
    public static boolean consumeOneTimePermissionRevokedExitNotice(Context context) {
        if (context == null) return false;
        try {
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) return false;
            List<ApplicationExitInfo> exits = manager.getHistoricalProcessExitReasons(context.getPackageName(), 0, 8);
            if (exits == null || exits.isEmpty()) return false;
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String consumed = prefs.getString(LAST_PERMISSION_NOTICE_FINGERPRINT, "");
            for (ApplicationExitInfo info : exits) {
                if (info == null || info.getReason() != ApplicationExitInfo.REASON_PERMISSION_CHANGE) continue;
                String processName = info.getProcessName();
                if (processName != null && !processName.equals(context.getPackageName())) continue;
                String description = info.getDescription();
                String normalized = description == null ? "" : description.toLowerCase(Locale.ROOT);
                if (!normalized.contains("one-time permission revoked")) continue;
                String fingerprint = exitFingerprint(info);
                if (fingerprint.isEmpty() || fingerprint.equals(consumed)) return false;
                prefs.edit().putString(LAST_PERMISSION_NOTICE_FINGERPRINT, fingerprint).commit();
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    @JavascriptInterface public String getEvents() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(EVENTS, "[]");
    }

    @JavascriptInterface public int getProcessId() { return Process.myPid(); }

    @JavascriptInterface public String getMemorySnapshot() {
        return memorySnapshot(context).toString();
    }
}

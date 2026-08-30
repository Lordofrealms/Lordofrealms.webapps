package com.lordofrealms.padgrade;

import android.content.Context;
import android.content.SharedPreferences;
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
        } catch (Exception ignored) {}
        next.put(row);
        prefs.edit().putInt(SEQ, seq).putString(EVENTS, next.toString()).apply();
    }

    @JavascriptInterface public String getEvents() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(EVENTS, "[]");
    }

    @JavascriptInterface public int getProcessId() { return Process.myPid(); }
}

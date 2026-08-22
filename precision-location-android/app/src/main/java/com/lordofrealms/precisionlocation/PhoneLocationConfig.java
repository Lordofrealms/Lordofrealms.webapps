package com.lordofrealms.precisionlocation;

import android.app.AppOpsManager;
import android.content.Context;
import android.os.Process;

/** Per-install preference for publishing the corrected solution to Android's fused location stream. */
public final class PhoneLocationConfig {
    private static final String PREFS = "phone_location_output";
    private static final String KEY_ENABLED = "enabled";

    private PhoneLocationConfig() { }

    public static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    /** True when Android Developer Options currently designates this package as the mock location app. */
    public static boolean isAuthorized(Context context) {
        AppOpsManager appOps = (AppOpsManager)context.getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) return false;
        try {
            return appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_MOCK_LOCATION,
                    Process.myUid(),
                    context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
        } catch (RuntimeException ignored) {
            return false;
        }
    }
}

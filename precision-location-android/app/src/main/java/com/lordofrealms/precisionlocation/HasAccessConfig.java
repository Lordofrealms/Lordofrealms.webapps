package com.lordofrealms.precisionlocation;

import android.content.Context;
import android.content.SharedPreferences;

/** Private, per-install HAS IDD connection settings. Never committed to source. */
public final class HasAccessConfig {
    private static final String PREFS = "has_access";
    private static final String KEY_URL = "url";
    private static final String KEY_USER = "username";
    private static final String KEY_PASSWORD = "password";

    public final String url;
    public final String username;
    public final String password;

    public HasAccessConfig(String url, String username, String password) {
        this.url = clean(url);
        this.username = clean(username);
        this.password = password == null ? "" : password;
    }

    public boolean isConfigured() {
        return url.startsWith("https://") && !username.isEmpty() && !password.isEmpty();
    }

    public static HasAccessConfig load(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new HasAccessConfig(
                p.getString(KEY_URL, ""),
                p.getString(KEY_USER, ""),
                p.getString(KEY_PASSWORD, ""));
    }

    public void save(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_URL, url)
                .putString(KEY_USER, username)
                .putString(KEY_PASSWORD, password)
                .apply();
    }

    public static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}

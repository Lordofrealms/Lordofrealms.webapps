package com.lordofrealms.padgrade;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.RemoteException;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * Cross-app client for Precision Location. The IPC contract is intentionally a
 * small Messenger/Bundle protocol so Pad Grade does not depend on Precision
 * Location implementation classes and neither app needs mock location.
 */
public final class PrecisionLocationClient {
    public interface Listener {
        void onPrecisionLocation(String jsonPayload);
        void onPrecisionError(String message);
        void onPrecisionStopped();
    }

    static final String PRECISION_PACKAGE = "com.lordofrealms.precisionlocation";
    static final String PRECISION_SERVICE =
            "com.lordofrealms.precisionlocation.PrecisionLocationService";
    static final String ACTION_START =
            "com.lordofrealms.precisionlocation.START";
    static final String ACTION_EXTERNAL_BIND =
            "com.lordofrealms.precisionlocation.EXTERNAL_BIND";

    static final int MSG_REGISTER = 1;
    static final int MSG_UNREGISTER = 2;
    static final int MSG_SOLUTION = 100;
    static final int MSG_ERROR = 101;
    static final int MSG_STOPPED = 102;

    private final Context context;
    private final Listener listener;
    private final Messenger incomingMessenger;
    private Messenger serviceMessenger;
    private boolean bound;
    private boolean binding;

    public PrecisionLocationClient(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        this.incomingMessenger = new Messenger(
                new Handler(Looper.getMainLooper(), this::handleIncoming));
    }

    public boolean isAvailable() {
        Intent query = new Intent(ACTION_EXTERNAL_BIND).setPackage(PRECISION_PACKAGE);
        PackageManager pm = context.getPackageManager();
        List<ResolveInfo> services = pm.queryIntentServices(query, PackageManager.MATCH_DEFAULT_ONLY);
        return services != null && !services.isEmpty();
    }

    public boolean startAndSubscribe() {
        if (!isAvailable()) return false;

        try {
            // The request originates while Pad Grade is foreground/user-visible.
            // Precision Location owns the foreground location notification and GNSS lifecycle.
            Intent start = new Intent()
                    .setClassName(PRECISION_PACKAGE, PRECISION_SERVICE)
                    .setAction(ACTION_START);
            context.startForegroundService(start);
        } catch (RuntimeException ex) {
            listener.onPrecisionError("Could not start Precision Location: " + safeMessage(ex));
            return false;
        }

        if (bound || binding) return true;
        Intent bind = new Intent(ACTION_EXTERNAL_BIND).setPackage(PRECISION_PACKAGE);
        try {
            binding = context.bindService(bind, connection, Context.BIND_AUTO_CREATE);
            if (!binding) {
                listener.onPrecisionError("Precision Location service did not accept the connection.");
                return false;
            }
            return true;
        } catch (RuntimeException ex) {
            binding = false;
            listener.onPrecisionError("Could not connect to Precision Location: " + safeMessage(ex));
            return false;
        }
    }

    public void release() {
        if (serviceMessenger != null) {
            Message msg = Message.obtain(null, MSG_UNREGISTER);
            msg.replyTo = incomingMessenger;
            try { serviceMessenger.send(msg); } catch (RemoteException ignored) { }
        }
        serviceMessenger = null;
        if (bound || binding) {
            try { context.unbindService(connection); } catch (RuntimeException ignored) { }
        }
        bound = false;
        binding = false;
    }

    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder service) {
            binding = false;
            bound = true;
            serviceMessenger = new Messenger(service);
            Message msg = Message.obtain(null, MSG_REGISTER);
            msg.replyTo = incomingMessenger;
            try {
                serviceMessenger.send(msg);
            } catch (RemoteException ex) {
                listener.onPrecisionError("Precision Location connection closed before registration.");
            }
        }

        @Override public void onServiceDisconnected(ComponentName name) {
            serviceMessenger = null;
            bound = false;
            binding = false;
            listener.onPrecisionStopped();
        }

        @Override public void onBindingDied(ComponentName name) {
            serviceMessenger = null;
            bound = false;
            binding = false;
            listener.onPrecisionError("Precision Location connection ended. Restart GPS guidance to reconnect.");
        }

        @Override public void onNullBinding(ComponentName name) {
            serviceMessenger = null;
            bound = false;
            binding = false;
            listener.onPrecisionError("Installed Precision Location build does not expose the Pad Grade data interface.");
        }
    };

    private boolean handleIncoming(Message msg) {
        if (msg == null) return true;
        if (msg.what == MSG_SOLUTION) {
            listener.onPrecisionLocation(solutionJson(msg.getData()));
        } else if (msg.what == MSG_ERROR) {
            listener.onPrecisionError(msg.getData().getString("message", "Precision Location error"));
        } else if (msg.what == MSG_STOPPED) {
            listener.onPrecisionStopped();
        }
        return true;
    }

    private static String solutionJson(Bundle b) {
        JSONObject o = new JSONObject();
        try {
            putFinite(o, "latitude", b.getDouble("latitude", Double.NaN));
            putFinite(o, "longitude", b.getDouble("longitude", Double.NaN));
            putFinite(o, "altitude", b.getDouble("altitude", Double.NaN));
            putFinite(o, "horizontalAccuracy", b.getDouble("horizontalAccuracy", Double.NaN));
            putFinite(o, "verticalAccuracy", b.getDouble("verticalAccuracy", Double.NaN));
            putFinite(o, "speed", b.getDouble("speed", Double.NaN));
            putFinite(o, "bearing", b.getDouble("bearing", Double.NaN));
            o.put("solutionMode", b.getString("solutionMode", "Precision Location"));
            o.put("solutionState", b.getString("solutionState", "UNKNOWN"));
            o.put("timestamp", b.getLong("timestamp", System.currentTimeMillis()));
            o.put("fixAgeMs", b.getLong("fixAgeMs", 0L));
        } catch (JSONException ignored) { }
        return o.toString();
    }

    private static void putFinite(JSONObject o, String key, double value) throws JSONException {
        if (Double.isFinite(value)) o.put(key, value);
        else o.put(key, JSONObject.NULL);
    }

    private static String safeMessage(Throwable t) {
        String message = t == null ? null : t.getMessage();
        return message == null || message.isEmpty() ? "unknown error" : message;
    }
}

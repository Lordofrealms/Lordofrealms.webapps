package com.lordofrealms.precisionlocation;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.os.Binder;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * Owns GNSS collection independently of the Activity so screen-off/backgrounding
 * does not terminate an active precision session.
 */
public final class PrecisionLocationService extends Service
        implements PositionEngine.Listener, GnssCollector.Listener, MockLocationPublisher.Listener {

    public interface UiListener {
        void onServiceSolution(PppSolution solution);
        void onServiceError(String message);
    }

    public static final String ACTION_START = "com.lordofrealms.precisionlocation.START";
    public static final String ACTION_STOP = "com.lordofrealms.precisionlocation.STOP";

    private static final String CHANNEL_ID = "precision_location_active";
    private static final int NOTIFICATION_ID = 4107;
    private static final long NOTIFICATION_REFRESH_MS = 10_000L;

    private final LocalBinder binder = new LocalBinder();
    private AutoPppEngine engine;
    private GnssCollector collector;
    private MockLocationPublisher phoneLocationPublisher;
    private PowerManager.WakeLock wakeLock;
    private volatile boolean running;
    private volatile PppSolution lastSolution;
    private volatile String lastError;
    private volatile String phoneLocationStatus = "Phone location output off";
    private volatile UiListener uiListener;
    private PppSolution.State lastNotificationState;
    private long lastNotificationUpdateMs;

    public final class LocalBinder extends Binder {
        public PrecisionLocationService getService() {
            return PrecisionLocationService.this;
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        engine = new AutoPppEngine(this, this);
        collector = new GnssCollector(this, engine, this);
        phoneLocationPublisher = new MockLocationPublisher(this, this);
        PowerManager pm = (PowerManager)getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,
                "PrecisionLocation:ActiveGnss");
        wakeLock.setReferenceCounted(false);
    }

    @Override public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSession();
            return START_NOT_STICKY;
        }
        if (ACTION_START.equals(action)) startSession();
        return START_NOT_STICKY;
    }

    public boolean isRunning() { return running; }
    public PppSolution getLastSolution() { return lastSolution; }
    public String getLastError() { return lastError; }
    public String getPhoneLocationStatus() { return phoneLocationStatus; }

    public void setUiListener(UiListener listener) {
        uiListener = listener;
        if (listener == null) return;
        PppSolution solution = lastSolution;
        String error = lastError;
        if (solution != null) listener.onServiceSolution(solution);
        if (error != null && !error.isEmpty()) listener.onServiceError(error);
    }

    private void startSession() {
        if (running) return;
        running = true;
        lastError = null;
        lastNotificationState = null;
        lastNotificationUpdateMs = 0L;

        startForeground(
                NOTIFICATION_ID,
                buildNotification("Starting precision location…"),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);

        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
        phoneLocationPublisher.start();
        collector.start();
    }

    private void stopSession() {
        if (collector != null) collector.stop();
        if (phoneLocationPublisher != null) phoneLocationPublisher.stop();
        running = false;
        releaseWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        if (running && collector != null) collector.stop();
        if (phoneLocationPublisher != null) phoneLocationPublisher.stop();
        running = false;
        releaseWakeLock();
        super.onDestroy();
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        stopSession();
        super.onTaskRemoved(rootIntent);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    @Override public void onSolution(PppSolution solution) {
        lastSolution = solution;
        lastError = null;
        if (phoneLocationPublisher != null) phoneLocationPublisher.publish(solution);

        UiListener listener = uiListener;
        if (listener != null) listener.onServiceSolution(solution);

        if (running) {
            long now = SystemClock.elapsedRealtime();
            if (solution.state != lastNotificationState
                    || now - lastNotificationUpdateMs >= NOTIFICATION_REFRESH_MS) {
                lastNotificationState = solution.state;
                lastNotificationUpdateMs = now;
                NotificationManager manager = getSystemService(NotificationManager.class);
                manager.notify(NOTIFICATION_ID, buildNotification(notificationText(solution)));
            }
        }
    }

    @Override public void onInventory(SignalInventory inventory) { }

    @Override public void onError(String message) {
        lastError = message;
        UiListener listener = uiListener;
        if (listener != null) listener.onServiceError(message);
        if (running) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.notify(NOTIFICATION_ID, buildNotification("GNSS error — open app for details"));
        }
    }

    @Override public void onPhoneLocationStatus(String status) {
        phoneLocationStatus = status;
        if (running && PhoneLocationConfig.isEnabled(this)) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            PppSolution solution = lastSolution;
            String base = solution == null ? "Precision positioning active" : notificationText(solution);
            manager.notify(NOTIFICATION_ID, buildNotification(base));
        }
    }

    private String notificationText(PppSolution solution) {
        String base;
        if (solution == null) {
            base = "Precision positioning active";
        } else {
            switch (solution.state) {
                case PRECHECK: base = "Testing raw GNSS in background"; break;
                case STARTING: base = "Acquiring satellites and HAS corrections"; break;
                case CONVERGING: base = "Improving high-accuracy position"; break;
                case READY:
                    if (Double.isFinite(solution.horizontalAccuracyMeters)) {
                        base = solution.horizontalAccuracyMeters < 1.0
                                ? String.format(java.util.Locale.US, "Ready • %.0f cm estimated", solution.horizontalAccuracyMeters * 100.0)
                                : String.format(java.util.Locale.US, "Ready • %.1f m estimated", solution.horizontalAccuracyMeters);
                    } else {
                        base = "High-accuracy position ready";
                    }
                    break;
                case DEGRADED: base = "Positioning active • signal degraded"; break;
                case ERROR: base = "Positioning needs attention"; break;
                default: base = "Precision positioning active"; break;
            }
        }

        if (phoneLocationPublisher != null && phoneLocationPublisher.isActive()) {
            return base + " • phone location on";
        }
        if (PhoneLocationConfig.isEnabled(this) && !PhoneLocationConfig.isAuthorized(this)) {
            return base + " • phone output needs setup";
        }
        return base;
    }

    private Notification buildNotification(String text) {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent openPending = PendingIntent.getActivity(
                this, 1, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stopIntent = new Intent(this, PrecisionLocationService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
                this, 2, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Icon stopIcon = Icon.createWithResource(this, android.R.drawable.ic_media_pause);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Precision Location")
                .setContentText(text)
                .setContentIntent(openPending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .addAction(new Notification.Action.Builder(stopIcon, "Stop", stopPending).build())
                .build();
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Active precision location",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shown while high-accuracy GNSS is actively running");
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }
}

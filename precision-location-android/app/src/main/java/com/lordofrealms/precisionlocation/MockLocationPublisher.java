package com.lordofrealms.precisionlocation;

import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.SystemClock;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;

/**
 * Optional bridge from Precision Location's solution into Android's fused
 * location stream. Android requires the user to select this app once under
 * Developer options -> Select mock location app.
 */
public final class MockLocationPublisher {
    public interface Listener {
        void onPhoneLocationStatus(String status);
    }

    private final Context appContext;
    private final FusedLocationProviderClient fusedClient;
    private final Listener listener;
    private volatile boolean requested;
    private volatile boolean mockModeActive;
    private volatile PppSolution pendingSolution;

    public MockLocationPublisher(Context context, Listener listener) {
        appContext = context.getApplicationContext();
        fusedClient = LocationServices.getFusedLocationProviderClient(appContext);
        this.listener = listener;
    }

    public boolean isRequested() { return requested; }
    public boolean isActive() { return mockModeActive; }

    public void start() {
        requested = PhoneLocationConfig.isEnabled(appContext);
        mockModeActive = false;
        pendingSolution = null;
        if (!requested) {
            notifyStatus("Phone location output off");
            return;
        }
        if (!PhoneLocationConfig.isAuthorized(appContext)) {
            notifyStatus("Phone location output needs Android mock-location authorization");
            return;
        }

        fusedClient.setMockMode(true)
                .addOnSuccessListener(ignored -> {
                    if (!requested) return;
                    mockModeActive = true;
                    notifyStatus("Phone location output active");
                    PppSolution pending = pendingSolution;
                    if (pending != null) publish(pending);
                })
                .addOnFailureListener(error -> {
                    mockModeActive = false;
                    notifyStatus("Phone location output unavailable: " + safeMessage(error));
                });
    }

    public void publish(PppSolution solution) {
        if (!requested || solution == null) return;
        if (!isPublishable(solution)) return;
        pendingSolution = solution;
        if (!mockModeActive) return;

        Location location = new Location(LocationManager.FUSED_PROVIDER);
        location.setLatitude(solution.latitudeDeg);
        location.setLongitude(solution.longitudeDeg);
        if (Double.isFinite(solution.altitudeMeters)) location.setAltitude(solution.altitudeMeters);
        location.setAccuracy((float)Math.max(0.01, solution.horizontalAccuracyMeters));
        location.setTime(System.currentTimeMillis());
        location.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());

        fusedClient.setMockLocation(location)
                .addOnFailureListener(error -> {
                    mockModeActive = false;
                    notifyStatus("Phone location output stopped: " + safeMessage(error));
                });
    }

    public void stop() {
        requested = false;
        pendingSolution = null;
        if (!mockModeActive) return;
        mockModeActive = false;
        fusedClient.setMockMode(false)
                .addOnFailureListener(error ->
                        notifyStatus("Could not restore normal phone location: " + safeMessage(error)));
    }

    private static boolean isPublishable(PppSolution solution) {
        return Double.isFinite(solution.latitudeDeg)
                && Double.isFinite(solution.longitudeDeg)
                && Double.isFinite(solution.horizontalAccuracyMeters)
                && solution.horizontalAccuracyMeters > 0.0
                && solution.state != PppSolution.State.OFF
                && solution.state != PppSolution.State.ERROR;
    }

    private void notifyStatus(String status) {
        if (listener != null) listener.onPhoneLocationStatus(status);
    }

    private static String safeMessage(Throwable error) {
        String message = error == null ? null : error.getMessage();
        return message == null || message.trim().isEmpty()
                ? "check Developer options" : message.trim();
    }
}

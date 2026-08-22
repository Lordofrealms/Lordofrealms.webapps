package com.lordofrealms.precisionlocation;

import android.annotation.SuppressLint;
import android.content.Context;
import android.location.GnssMeasurementRequest;
import android.location.GnssMeasurementsEvent;
import android.location.GnssNavigationMessage;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Looper;

import java.util.concurrent.Executor;

public final class GnssCollector {
    public interface Listener {
        void onInventory(SignalInventory inventory);
        void onError(String message);
    }

    private final LocationManager locationManager;
    private final Executor executor;
    private final PositionEngine engine;
    private final Listener listener;
    private final SignalInventory inventory = new SignalInventory();
    private boolean started;

    public GnssCollector(Context context, PositionEngine engine, Listener listener) {
        this.locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        this.executor = context.getMainExecutor();
        this.engine = engine;
        this.listener = listener;
    }

    private final GnssMeasurementsEvent.Callback measurementCallback = new GnssMeasurementsEvent.Callback() {
        @Override public void onGnssMeasurementsReceived(GnssMeasurementsEvent eventArgs) {
            inventory.update(eventArgs);
            listener.onInventory(inventory);
            engine.onMeasurements(eventArgs, inventory);
        }
    };

    private final GnssNavigationMessage.Callback navigationCallback = new GnssNavigationMessage.Callback() {
        @Override public void onGnssNavigationMessageReceived(GnssNavigationMessage event) {
            engine.onNavigationMessage(event);
        }
    };

    private final LocationListener locationListener = new LocationListener() {
        @Override public void onLocationChanged(Location location) { engine.onSystemLocation(location); }
        @Override public void onProviderDisabled(String provider) { listener.onError("Phone location is turned off"); }
        @Override public void onProviderEnabled(String provider) { }
        @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    };

    @SuppressLint("MissingPermission")
    public void start() {
        if (started) return;
        started = true;
        engine.start();
        try {
            GnssMeasurementRequest request = new GnssMeasurementRequest.Builder()
                    .setFullTracking(true)
                    .build();
            locationManager.registerGnssMeasurementsCallback(request, executor, measurementCallback);
            locationManager.registerGnssNavigationMessageCallback(executor, navigationCallback);
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 500L, 0f,
                    locationListener, Looper.getMainLooper());
        } catch (SecurityException ex) {
            started = false;
            listener.onError("Precise location permission is required");
        } catch (RuntimeException ex) {
            started = false;
            listener.onError("GNSS could not start: " + ex.getMessage());
        }
    }

    public void stop() {
        if (!started) return;
        started = false;
        locationManager.unregisterGnssMeasurementsCallback(measurementCallback);
        locationManager.unregisterGnssNavigationMessageCallback(navigationCallback);
        locationManager.removeUpdates(locationListener);
        engine.stop();
    }
}

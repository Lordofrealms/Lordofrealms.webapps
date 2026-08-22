package com.lordofrealms.precisionlocation;

import android.location.GnssMeasurementsEvent;
import android.location.GnssNavigationMessage;
import android.location.Location;

public interface PositionEngine {
    interface Listener {
        void onSolution(PppSolution solution);
    }

    void start();
    void stop();
    void onMeasurements(GnssMeasurementsEvent event, SignalInventory inventory);
    void onNavigationMessage(GnssNavigationMessage message);
    void onSystemLocation(Location location);
    void onHasCorrections(byte[] data, int length);
}

package com.lordofrealms.precisionlocation;

import android.location.GnssMeasurementsEvent;
import android.location.GnssNavigationMessage;
import android.location.Location;

/** User-facing auto selector. PPP tuning is intentionally not exposed in normal UI. */
public final class AutoPppEngine implements PositionEngine {
    static { System.loadLibrary("precision_location"); }

    private final Listener listener;
    private volatile boolean running;
    private volatile Location fallbackLocation;
    private volatile boolean hasCorrections;

    public AutoPppEngine(Listener listener) { this.listener = listener; }

    @Override public void start() {
        running = true;
        nativeReset();
        emit(PppSolution.State.STARTING, "AUTO", "Acquiring raw GNSS");
    }

    @Override public void stop() {
        running = false;
        emit(PppSolution.State.OFF, "AUTO", "Stopped");
    }

    @Override public void onMeasurements(GnssMeasurementsEvent event, SignalInventory inventory) {
        if (!running) return;
        nativeObserveCapability(inventory.validAdrTotal(), inventory.hasSecondaryCarrierPhase());
        String mode = inventory.automaticMode();
        String correction = hasCorrections ? "HAS corrections connected" : "HAS corrections not connected";
        Location f = fallbackLocation;
        if (f != null) {
            listener.onSolution(new PppSolution(
                    hasCorrections ? PppSolution.State.CONVERGING : PppSolution.State.STARTING,
                    f.getLatitude(), f.getLongitude(), f.getAltitude(), f.getAccuracy(),
                    mode, inventory.summary() + "\n" + correction));
        } else {
            emit(PppSolution.State.STARTING, mode, inventory.summary() + "\n" + correction);
        }
    }

    @Override public void onNavigationMessage(GnssNavigationMessage message) {
        if (!running) return;
        nativeNavigationMessage(message.getType(), message.getSvid(), message.getMessageId(),
                message.getSubmessageId(), message.getData());
    }

    @Override public void onSystemLocation(Location location) { fallbackLocation = location; }

    @Override public void onHasCorrections(byte[] data, int length) {
        if (!running || length <= 0) return;
        hasCorrections = true;
        nativeHasBytes(data, length);
    }

    private void emit(PppSolution.State state, String mode, String detail) {
        Location f = fallbackLocation;
        listener.onSolution(new PppSolution(state,
                f == null ? Double.NaN : f.getLatitude(),
                f == null ? Double.NaN : f.getLongitude(),
                f == null ? Double.NaN : f.getAltitude(),
                f == null ? Double.NaN : f.getAccuracy(), mode, detail));
    }

    public static native String nativeEngineInfo();
    private static native void nativeReset();
    private static native void nativeObserveCapability(int validAdr, boolean multiFrequency);
    private static native void nativeNavigationMessage(int type, int svid, int messageId, int submessageId, byte[] data);
    private static native void nativeHasBytes(byte[] data, int length);
}

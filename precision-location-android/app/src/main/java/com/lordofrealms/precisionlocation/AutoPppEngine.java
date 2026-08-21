package com.lordofrealms.precisionlocation;

import android.location.GnssMeasurementsEvent;
import android.location.GnssNavigationMessage;
import android.location.Location;

/** User-facing auto selector. PPP tuning is intentionally not exposed in normal UI. */
public final class AutoPppEngine implements PositionEngine {
    static { System.loadLibrary("precision_location"); }

    private final Listener listener;
    private final AndroidGnssObservationConverter observationConverter = new AndroidGnssObservationConverter();
    private volatile boolean running;
    private volatile Location fallbackLocation;
    private volatile boolean hasCorrections;

    public AutoPppEngine(Listener listener) { this.listener = listener; }

    @Override public void start() {
        running = true;
        hasCorrections = false;
        nativeReset();
        emit(PppSolution.State.STARTING, "AUTO", "Acquiring raw GNSS");
    }

    @Override public void stop() {
        running = false;
        emit(PppSolution.State.OFF, "AUTO", "Stopped");
    }

    @Override public void onMeasurements(GnssMeasurementsEvent event, SignalInventory inventory) {
        if (!running) return;

        RawObservationEpoch epoch = observationConverter.convert(event);
        nativeObserveCapability(inventory.validAdrTotal(), inventory.hasSecondaryCarrierPhase());
        int accepted = nativeObservationEpoch(
                epoch.gpsWeek,
                epoch.gpsTowSeconds,
                epoch.hardwareClockDiscontinuityCount,
                epoch.constellation,
                epoch.svid,
                epoch.carrierFrequencyHz,
                epoch.codeType,
                epoch.pseudorangeMeters,
                epoch.pseudorangeSigmaMeters,
                epoch.adrMeters,
                epoch.adrSigmaMeters,
                epoch.pseudorangeRateMetersPerSecond,
                epoch.pseudorangeRateSigmaMetersPerSecond,
                epoch.cn0DbHz,
                epoch.adrState,
                epoch.syncState);

        String mode = inventory.automaticMode();
        String correction = hasCorrections ? "HAS corrections connected" : "Connecting to HAS corrections";
        String detail = inventory.summary() + "\n"
                + correction + "\n"
                + accepted + " GPS/Galileo satellite records accepted • " + nativeObservationInfo();

        Location f = fallbackLocation;
        PppSolution.State state = hasCorrections && accepted >= 4
                ? PppSolution.State.CONVERGING : PppSolution.State.STARTING;
        if (f != null) {
            listener.onSolution(new PppSolution(
                    state,
                    f.getLatitude(), f.getLongitude(), f.getAltitude(), f.getAccuracy(),
                    mode, detail));
        } else {
            emit(state, mode, detail);
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
        nativeHasBytes(data, length);
        hasCorrections = true;
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
    private static native int nativeObservationEpoch(
            int gpsWeek,
            double gpsTowSeconds,
            int hardwareClockDiscontinuityCount,
            int[] constellation,
            int[] svid,
            double[] carrierFrequencyHz,
            String[] codeType,
            double[] pseudorangeMeters,
            double[] pseudorangeSigmaMeters,
            double[] adrMeters,
            double[] adrSigmaMeters,
            double[] pseudorangeRateMetersPerSecond,
            double[] pseudorangeRateSigmaMetersPerSecond,
            double[] cn0DbHz,
            int[] adrState,
            int[] syncState);
    private static native String nativeObservationInfo();
    private static native void nativeNavigationMessage(int type, int svid, int messageId, int submessageId, byte[] data);
    private static native void nativeHasBytes(byte[] data, int length);
}

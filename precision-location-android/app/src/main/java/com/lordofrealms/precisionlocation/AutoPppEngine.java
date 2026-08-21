package com.lordofrealms.precisionlocation;

import android.content.Context;
import android.location.GnssMeasurementsEvent;
import android.location.GnssNavigationMessage;
import android.location.Location;

/** User-facing auto selector. PPP tuning is intentionally not exposed in normal UI. */
public final class AutoPppEngine implements PositionEngine, HasNtripClient.Listener {
    static { System.loadLibrary("precision_location"); }

    private final Context appContext;
    private final Listener listener;
    private final AndroidGnssObservationConverter observationConverter = new AndroidGnssObservationConverter();
    private volatile boolean running;
    private volatile Location fallbackLocation;
    private volatile boolean hasCorrections;
    private volatile String correctionStatus = "HAS not started";
    private HasNtripClient hasClient;

    public AutoPppEngine(Context context, Listener listener) {
        this.appContext = context.getApplicationContext();
        this.listener = listener;
    }

    @Override public void start() {
        running = true;
        hasCorrections = false;
        correctionStatus = "Connecting to HAS corrections";
        nativeReset();
        HasAccessConfig config = HasAccessConfig.load(appContext);
        if (config.isConfigured()) {
            hasClient = new HasNtripClient(config, this);
            hasClient.start();
        } else {
            correctionStatus = "HAS access setup required";
        }
        emit(PppSolution.State.STARTING, "AUTO", "Acquiring raw GNSS\n" + correctionStatus);
    }

    @Override public void stop() {
        running = false;
        HasNtripClient c = hasClient;
        hasClient = null;
        if (c != null) c.stop();
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
        String detail = inventory.summary() + "\n"
                + correctionStatus + "\n"
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
        int decodedSsr = nativeHasBytes(data, length);
        if (decodedSsr > 0) {
            hasCorrections = true;
            correctionStatus = "HAS corrections active";
        }
    }

    @Override public void onCorrectionBytes(byte[] data, int length) {
        onHasCorrections(data, length);
    }

    @Override public void onStatus(String status) {
        correctionStatus = status;
    }

    @Override public void onFatalError(String message) {
        correctionStatus = message;
        hasCorrections = false;
        if (running) emit(PppSolution.State.DEGRADED, "AUTO", message);
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
    private static native int nativeHasBytes(byte[] data, int length);
}

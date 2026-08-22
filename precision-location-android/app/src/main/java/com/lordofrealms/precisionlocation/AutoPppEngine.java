package com.lordofrealms.precisionlocation;

import android.content.Context;
import android.location.GnssMeasurementsEvent;
import android.location.GnssNavigationMessage;
import android.location.Location;
import android.os.SystemClock;

/** User-facing auto selector. PPP tuning is intentionally not exposed in normal UI. */
public final class AutoPppEngine implements PositionEngine, HasNtripClient.Listener {
    static { System.loadLibrary("precision_location"); }

    private static final int SOLQ_PPP = 6;
    private static final double READY_HORIZONTAL_METERS = 1.0;
    private static final int READY_STREAK_EPOCHS = 5;

    private final Context appContext;
    private final Listener listener;
    private final Object nativeLock = new Object();
    private final AndroidGnssObservationConverter observationConverter = new AndroidGnssObservationConverter();
    private volatile boolean running;
    private volatile Location fallbackLocation;
    private volatile boolean hasCorrections;
    private volatile boolean hasAccessConfigured;
    private volatile String correctionStatus = "HAS not started";
    private HasNtripClient hasClient;
    private GnssPreflightLogger preflightLogger;
    private int readyStreak;

    public AutoPppEngine(Context context, Listener listener) {
        this.appContext = context.getApplicationContext();
        this.listener = listener;
    }

    @Override public void start() {
        running = true;
        hasCorrections = false;
        readyStreak = 0;
        closePreflightLogger();
        synchronized (nativeLock) {
            nativeReset();
            Location f = fallbackLocation;
            if (f != null) nativeSetApproximatePosition(f.getLatitude(), f.getLongitude(), f.getAltitude());
        }

        HasAccessConfig config = HasAccessConfig.load(appContext);
        hasAccessConfigured = config.isConfigured();
        if (hasAccessConfigured) {
            correctionStatus = "Connecting to HAS corrections";
            hasClient = new HasNtripClient(config, this);
            hasClient.start();
            emit(PppSolution.State.STARTING, "AUTO", "Acquiring raw GNSS\n" + correctionStatus);
        } else {
            preflightLogger = GnssPreflightLogger.create(appContext);
            correctionStatus = "HAS not configured • broadcast/raw GNSS preflight only";
            if (preflightLogger != null) {
                correctionStatus += " • log=" + preflightLogger.displayName();
            } else {
                correctionStatus += " • diagnostic log unavailable";
            }
            emit(PppSolution.State.PRECHECK, "AUTO", "Testing phone GNSS\n" + correctionStatus);
        }
    }

    @Override public void stop() {
        running = false;
        readyStreak = 0;
        HasNtripClient c = hasClient;
        hasClient = null;
        if (c != null) c.stop();
        closePreflightLogger();
        emit(PppSolution.State.OFF, "AUTO", "Stopped");
    }

    @Override public void onMeasurements(GnssMeasurementsEvent event, SignalInventory inventory) {
        if (!running) return;

        GnssPreflightLogger logger = preflightLogger;
        if (logger != null) logger.logMeasurements(event);

        RawObservationEpoch epoch = observationConverter.convert(event);
        final int accepted;
        final String nativeInfo;
        final double[] ppp;
        synchronized (nativeLock) {
            nativeObserveCapability(inventory.validAdrTotal(), inventory.hasSecondaryCarrierPhase());
            accepted = nativeObservationEpoch(
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
            nativeInfo = nativeObservationInfo();
            ppp = nativePppSolution();
        }

        String mode = inventory.automaticMode();
        String detail = inventory.summary() + "\n"
                + correctionStatus + "\n"
                + accepted + " GPS/Galileo satellite records accepted • " + nativeInfo;

        if (ppp != null && ppp.length >= 9
                && (int)Math.round(ppp[0]) == SOLQ_PPP
                && Double.isFinite(ppp[1]) && Double.isFinite(ppp[2])
                && Double.isFinite(ppp[4])) {
            int ns = (int)Math.round(ppp[6]);
            if (ppp[4] <= READY_HORIZONTAL_METERS && ns >= 5) readyStreak++;
            else readyStreak = 0;
            PppSolution.State state = readyStreak >= READY_STREAK_EPOCHS
                    ? PppSolution.State.READY : PppSolution.State.CONVERGING;
            String pppDetail = detail + "\nPPP solution: " + ns + " satellites"
                    + (state == PppSolution.State.READY ? " • precision ready" : " • stabilizing");
            listener.onSolution(new PppSolution(
                    state, ppp[1], ppp[2], ppp[3], ppp[4], mode, pppDetail));
            return;
        }

        readyStreak = 0;
        Location f = fallbackLocation;
        PppSolution.State state;
        if (!hasAccessConfigured) {
            state = PppSolution.State.PRECHECK;
        } else {
            state = hasCorrections && accepted >= 4
                    ? PppSolution.State.CONVERGING : PppSolution.State.STARTING;
        }
        if (f != null) {
            listener.onSolution(new PppSolution(
                    state,
                    f.getLatitude(), f.getLongitude(), f.getAltitude(), Double.NaN,
                    mode, detail + "\nAndroid location is used only as an internal initialization/reference point."));
        } else {
            emit(state, mode, detail);
        }
    }

    @Override public void onNavigationMessage(GnssNavigationMessage message) {
        if (!running) return;
        GnssPreflightLogger logger = preflightLogger;
        if (logger != null) logger.logNavigationMessage(SystemClock.elapsedRealtimeNanos(), message);
        synchronized (nativeLock) {
            nativeNavigationMessage(message.getType(), message.getSvid(), message.getMessageId(),
                    message.getSubmessageId(), message.getStatus(), message.getData());
        }
    }

    @Override public void onSystemLocation(Location location) {
        fallbackLocation = location;
        GnssPreflightLogger logger = preflightLogger;
        if (logger != null) logger.logLocation(SystemClock.elapsedRealtimeNanos(), location);
        synchronized (nativeLock) {
            nativeSetApproximatePosition(location.getLatitude(), location.getLongitude(), location.getAltitude());
        }
    }

    @Override public void onHasCorrections(byte[] data, int length) {
        if (!running || length <= 0) return;
        final int decodedSsr;
        synchronized (nativeLock) {
            decodedSsr = nativeHasBytes(data, length);
        }
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
        readyStreak = 0;
        if (running) emit(PppSolution.State.DEGRADED, "AUTO", message);
    }

    private void closePreflightLogger() {
        GnssPreflightLogger logger = preflightLogger;
        preflightLogger = null;
        if (logger != null) logger.close();
    }

    private void emit(PppSolution.State state, String mode, String detail) {
        Location f = fallbackLocation;
        listener.onSolution(new PppSolution(state,
                f == null ? Double.NaN : f.getLatitude(),
                f == null ? Double.NaN : f.getLongitude(),
                f == null ? Double.NaN : f.getAltitude(),
                Double.NaN, mode, detail));
    }

    public static native String nativeEngineInfo();
    private static native void nativeReset();
    private static native void nativeSetApproximatePosition(double latitudeDeg, double longitudeDeg, double heightMeters);
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
    private static native double[] nativePppSolution();
    private static native void nativeNavigationMessage(int type, int svid, int messageId, int submessageId,
                                                        int status, byte[] data);
    private static native int nativeHasBytes(byte[] data, int length);
}

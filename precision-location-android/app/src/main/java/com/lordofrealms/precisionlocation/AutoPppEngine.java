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
    private final CarrierPhasePreprocessor carrierPreprocessor = new CarrierPhasePreprocessor();
    private final EnhancedGnssFilter enhancedFilter = new EnhancedGnssFilter();
    private volatile boolean running;
    private volatile Location fallbackLocation;
    private volatile boolean hasCorrections;
    private volatile boolean hasAccessConfigured;
    private volatile boolean hasConnectionFailed;
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
        hasConnectionFailed = false;
        readyStreak = 0;
        carrierPreprocessor.reset();
        enhancedFilter.reset();
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
        } else {
            correctionStatus = "No-signup Enhanced GNSS active • HAS optional";
            preflightLogger = GnssPreflightLogger.create(appContext);
            if (preflightLogger != null) {
                correctionStatus += " • log=" + preflightLogger.displayName();
            }
        }
        emitEnhancedOrFallback(PppSolution.State.STARTING, "AUTO",
                hasAccessConfigured ? "Acquiring raw GNSS and HAS corrections" : "Starting Enhanced GNSS");
    }

    @Override public void stop() {
        running = false;
        readyStreak = 0;
        HasNtripClient c = hasClient;
        hasClient = null;
        if (c != null) c.stop();
        closePreflightLogger();
        carrierPreprocessor.reset();
        enhancedFilter.reset();
        emit(PppSolution.State.OFF, "AUTO", "Stopped");
    }

    @Override public void onMeasurements(GnssMeasurementsEvent event, SignalInventory inventory) {
        if (!running) return;

        GnssPreflightLogger logger = preflightLogger;
        if (logger != null) logger.logMeasurements(event);

        RawObservationEpoch rawEpoch = observationConverter.convert(event);
        RawObservationEpoch epoch = carrierPreprocessor.process(rawEpoch);
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

        if (logger != null) {
            long elapsed = event.getClock().hasElapsedRealtimeNanos()
                    ? event.getClock().getElapsedRealtimeNanos() : SystemClock.elapsedRealtimeNanos();
            logger.logEngineStatus(elapsed, accepted, nativeInfo, ppp);
        }

        double sppDelta = Double.NaN;
        if (ppp != null && ppp.length >= 12 && ppp[9] > 0.5 && Double.isFinite(ppp[11])) {
            sppDelta = ppp[11];
        }
        enhancedFilter.setGnssQuality(inventory.validAdrTotal(), sppDelta);

        String signalMode = inventory.automaticMode();
        String detail = inventory.summary() + "\n"
                + correctionStatus + "\n"
                + accepted + " GPS/Galileo satellite records accepted • " + nativeInfo;

        if (isPppSolution(ppp)) {
            int ns = (int)Math.round(ppp[6]);
            if (ppp[4] <= READY_HORIZONTAL_METERS && ns >= 5) readyStreak++;
            else readyStreak = 0;
            PppSolution.State state = readyStreak >= READY_STREAK_EPOCHS
                    ? PppSolution.State.READY : PppSolution.State.CONVERGING;
            String pppDetail = detail + "\nHAS PPP solution: " + ns + " satellites"
                    + (state == PppSolution.State.READY ? " • precision ready" : " • stabilizing");
            listener.onSolution(new PppSolution(
                    state, ppp[1], ppp[2], ppp[3], ppp[4],
                    "HAS PPP • " + signalMode, pppDetail));
            return;
        }

        readyStreak = 0;
        EnhancedGnssFilter.Result enhanced = enhancedFilter.result(SystemClock.elapsedRealtimeNanos());
        if (enhanced != null) {
            boolean qualityReady = enhanced.validCarrierPhaseSignals >= 5 && enhanced.ageMillis <= 2_000L;
            PppSolution.State state;
            String mode;
            String extra;
            if (hasAccessConfigured && !hasConnectionFailed) {
                state = PppSolution.State.CONVERGING;
                mode = "ENHANCED GNSS → HAS PPP";
                extra = "\nEnhanced GNSS is supplying the current position while HAS PPP converges.";
            } else {
                state = qualityReady ? PppSolution.State.READY : PppSolution.State.PRECHECK;
                mode = "ENHANCED GNSS";
                extra = "\nNo-signup Enhanced GNSS: carrier-smoothed code + TDCP-aided range rate + robust measurement weighting + broadcast/system absolute anchor."
                        + " Absolute uncertainty remains meter-class without external corrections.";
            }
            listener.onSolution(new PppSolution(
                    state,
                    enhanced.latitudeDeg,
                    enhanced.longitudeDeg,
                    enhanced.altitudeMeters,
                    enhanced.horizontalAccuracyMeters,
                    mode,
                    detail + extra));
            return;
        }

        PppSolution.State state = hasAccessConfigured && !hasConnectionFailed
                ? PppSolution.State.STARTING : PppSolution.State.PRECHECK;
        emit(state, "ENHANCED GNSS", detail + "\nWaiting for a fresh hardware GPS anchor.");
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
        enhancedFilter.update(location);
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
            hasConnectionFailed = false;
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
        correctionStatus = "HAS unavailable • using no-signup mode: " + message;
        hasCorrections = false;
        hasConnectionFailed = true;
        readyStreak = 0;
        if (running) {
            emitEnhancedOrFallback(PppSolution.State.PRECHECK, "ENHANCED GNSS", correctionStatus);
        }
    }

    private boolean isPppSolution(double[] ppp) {
        return ppp != null && ppp.length >= 9
                && (int)Math.round(ppp[0]) == SOLQ_PPP
                && Double.isFinite(ppp[1]) && Double.isFinite(ppp[2])
                && Double.isFinite(ppp[4]);
    }

    private void closePreflightLogger() {
        GnssPreflightLogger logger = preflightLogger;
        preflightLogger = null;
        if (logger != null) logger.close();
    }

    private void emitEnhancedOrFallback(PppSolution.State state, String mode, String detail) {
        EnhancedGnssFilter.Result enhanced = enhancedFilter.result(SystemClock.elapsedRealtimeNanos());
        if (enhanced != null) {
            listener.onSolution(new PppSolution(state,
                    enhanced.latitudeDeg, enhanced.longitudeDeg, enhanced.altitudeMeters,
                    enhanced.horizontalAccuracyMeters, mode, detail));
            return;
        }
        emit(state, mode, detail);
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

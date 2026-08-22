package com.lordofrealms.precisionlocation;

import android.location.GnssClock;
import android.location.GnssMeasurement;
import android.location.GnssMeasurementsEvent;
import android.location.GnssStatus;

import java.util.ArrayList;
import java.util.List;

/**
 * Converts Android raw measurements into code/carrier/range-rate observables.
 *
 * HAS presently corrects GPS and Galileo, so those are the constellations sent
 * to the PPP engine. Other constellations remain visible in SignalInventory and
 * can be added as additional precise-product sources later without changing the UI.
 */
public final class AndroidGnssObservationConverter {
    private static final double C = 299_792_458.0;
    private static final double NS_TO_S = 1e-9;
    private static final long WEEK_NANOS_LONG = 604_800_000_000_000L;
    private static final double WEEK_NANOS = (double) WEEK_NANOS_LONG;
    private static final double MIN_PSEUDORANGE_M = 1.0e6;
    private static final double MAX_PSEUDORANGE_M = 1.0e8;

    public RawObservationEpoch convert(GnssMeasurementsEvent event) {
        GnssClock clock = event.getClock();
        if (!clock.hasFullBiasNanos()) {
            return RawObservationEpoch.empty(-1, Double.NaN,
                    clock.getHardwareClockDiscontinuityCount());
        }

        // Keep the ~1e18 ns absolute receiver time in integer arithmetic. Converting
        // that value to double first would lose tens of nanoseconds of precision.
        long wholeGpsNanos = clock.getTimeNanos() - clock.getFullBiasNanos();
        long gpsWeekLong = Math.floorDiv(wholeGpsNanos, WEEK_NANOS_LONG);
        double biasNanos = clock.hasBiasNanos() ? clock.getBiasNanos() : 0.0;
        double gpsTowNanos = Math.floorMod(wholeGpsNanos, WEEK_NANOS_LONG) - biasNanos;
        if (gpsTowNanos < 0.0) {
            gpsTowNanos += WEEK_NANOS;
            gpsWeekLong--;
        } else if (gpsTowNanos >= WEEK_NANOS) {
            gpsTowNanos -= WEEK_NANOS;
            gpsWeekLong++;
        }
        int gpsWeek = (int) gpsWeekLong;
        double gpsTowSeconds = gpsTowNanos * NS_TO_S;

        List<Sample> samples = new ArrayList<>();
        for (GnssMeasurement m : event.getMeasurements()) {
            int constellation = m.getConstellationType();
            if (constellation != GnssStatus.CONSTELLATION_GPS
                    && constellation != GnssStatus.CONSTELLATION_GALILEO) {
                continue;
            }
            if (!m.hasCarrierFrequencyHz() || !hasUsableTow(m)) continue;

            double pseudorange = pseudorangeMeters(gpsTowNanos, m);
            if (!Double.isFinite(pseudorange)
                    || pseudorange < MIN_PSEUDORANGE_M
                    || pseudorange > MAX_PSEUDORANGE_M) {
                continue;
            }

            int adrState = m.getAccumulatedDeltaRangeState();
            boolean adrValid = (adrState & GnssMeasurement.ADR_STATE_VALID) != 0;
            double adrMeters = adrValid ? m.getAccumulatedDeltaRangeMeters() : Double.NaN;
            double adrSigma = adrValid ? m.getAccumulatedDeltaRangeUncertaintyMeters() : Double.NaN;

            double codeSigma = pseudorangeSigmaMeters(clock, m);
            String codeType = m.getCodeType();
            if (codeType == null || codeType.isEmpty()) codeType = "UNKNOWN";

            samples.add(new Sample(
                    constellation,
                    m.getSvid(),
                    m.getCarrierFrequencyHz(),
                    codeType,
                    pseudorange,
                    codeSigma,
                    adrMeters,
                    adrSigma,
                    m.getPseudorangeRateMetersPerSecond(),
                    m.getPseudorangeRateUncertaintyMetersPerSecond(),
                    m.getCn0DbHz(),
                    adrState,
                    m.getState()));
        }

        int n = samples.size();
        int[] constellation = new int[n];
        int[] svid = new int[n];
        double[] freq = new double[n];
        String[] code = new String[n];
        double[] pr = new double[n];
        double[] prSigma = new double[n];
        double[] adr = new double[n];
        double[] adrSigma = new double[n];
        double[] rate = new double[n];
        double[] rateSigma = new double[n];
        double[] cn0 = new double[n];
        int[] adrState = new int[n];
        int[] syncState = new int[n];

        for (int i = 0; i < n; i++) {
            Sample s = samples.get(i);
            constellation[i] = s.constellation;
            svid[i] = s.svid;
            freq[i] = s.carrierFrequencyHz;
            code[i] = s.codeType;
            pr[i] = s.pseudorangeMeters;
            prSigma[i] = s.pseudorangeSigmaMeters;
            adr[i] = s.adrMeters;
            adrSigma[i] = s.adrSigmaMeters;
            rate[i] = s.pseudorangeRateMetersPerSecond;
            rateSigma[i] = s.pseudorangeRateSigmaMetersPerSecond;
            cn0[i] = s.cn0DbHz;
            adrState[i] = s.adrState;
            syncState[i] = s.syncState;
        }

        return new RawObservationEpoch(
                gpsWeek, gpsTowSeconds,
                clock.getHardwareClockDiscontinuityCount(),
                constellation, svid, freq, code, pr, prSigma, adr, adrSigma,
                rate, rateSigma, cn0, adrState, syncState);
    }

    private static boolean hasUsableTow(GnssMeasurement m) {
        int state = m.getState();
        return (state & GnssMeasurement.STATE_TOW_DECODED) != 0
                || (state & GnssMeasurement.STATE_TOW_KNOWN) != 0;
    }

    private static double pseudorangeMeters(double gpsTowNanos, GnssMeasurement m) {
        double receiverTowNanos = positiveModulo(
                gpsTowNanos + m.getTimeOffsetNanos(), WEEK_NANOS);
        double transmitTowNanos = m.getReceivedSvTimeNanos();
        double deltaNanos = receiverTowNanos - transmitTowNanos;

        // Allow a week-boundary crossing between transmit and receive time.
        if (deltaNanos < -WEEK_NANOS / 2.0) deltaNanos += WEEK_NANOS;
        if (deltaNanos > WEEK_NANOS / 2.0) deltaNanos -= WEEK_NANOS;
        return deltaNanos * NS_TO_S * C;
    }

    private static double pseudorangeSigmaMeters(GnssClock clock, GnssMeasurement m) {
        double sigmaNanos2 = square(m.getReceivedSvTimeUncertaintyNanos());
        if (clock.hasBiasUncertaintyNanos()) {
            sigmaNanos2 += square(clock.getBiasUncertaintyNanos());
        }
        if (clock.hasTimeUncertaintyNanos()) {
            sigmaNanos2 += square(clock.getTimeUncertaintyNanos());
        }
        return Math.sqrt(sigmaNanos2) * NS_TO_S * C;
    }

    private static double positiveModulo(double x, double m) {
        double r = x % m;
        return r < 0.0 ? r + m : r;
    }

    private static double square(double x) { return x * x; }

    private static final class Sample {
        final int constellation;
        final int svid;
        final double carrierFrequencyHz;
        final String codeType;
        final double pseudorangeMeters;
        final double pseudorangeSigmaMeters;
        final double adrMeters;
        final double adrSigmaMeters;
        final double pseudorangeRateMetersPerSecond;
        final double pseudorangeRateSigmaMetersPerSecond;
        final double cn0DbHz;
        final int adrState;
        final int syncState;

        Sample(int constellation, int svid, double carrierFrequencyHz, String codeType,
               double pseudorangeMeters, double pseudorangeSigmaMeters,
               double adrMeters, double adrSigmaMeters,
               double pseudorangeRateMetersPerSecond, double pseudorangeRateSigmaMetersPerSecond,
               double cn0DbHz, int adrState, int syncState) {
            this.constellation = constellation;
            this.svid = svid;
            this.carrierFrequencyHz = carrierFrequencyHz;
            this.codeType = codeType;
            this.pseudorangeMeters = pseudorangeMeters;
            this.pseudorangeSigmaMeters = pseudorangeSigmaMeters;
            this.adrMeters = adrMeters;
            this.adrSigmaMeters = adrSigmaMeters;
            this.pseudorangeRateMetersPerSecond = pseudorangeRateMetersPerSecond;
            this.pseudorangeRateSigmaMetersPerSecond = pseudorangeRateSigmaMetersPerSecond;
            this.cn0DbHz = cn0DbHz;
            this.adrState = adrState;
            this.syncState = syncState;
        }
    }
}

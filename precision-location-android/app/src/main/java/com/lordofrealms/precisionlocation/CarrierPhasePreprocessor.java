package com.lordofrealms.precisionlocation;

import android.location.GnssMeasurement;

import java.util.HashMap;
import java.util.Map;

/**
 * Smartphone GNSS observation conditioner used by both Enhanced GNSS and HAS PPP.
 *
 * <p>For each continuous satellite/signal arc this class applies a finite-window
 * carrier-smoothed-code (Hatch) filter and derives a TDCP range rate from successive
 * accumulated-delta-range observations. Android receiver-clock discontinuities,
 * ADR reset/cycle-slip flags and unresolved half cycles terminate an arc immediately.
 * The original raw carrier phase is retained for PPP.</p>
 *
 * <p>Measurement uncertainty and C/N0 are combined into an effective C/N0 so the
 * native solver can down-weight noisy smartphone observations without exposing any
 * tuning to the user. Gross code/carrier innovations restart smoothing instead of
 * allowing a bad arc to contaminate later epochs.</p>
 */
public final class CarrierPhasePreprocessor {
    private static final int MAX_HATCH_EPOCHS = 30;
    private static final double MAX_ARC_GAP_SECONDS = 2.5;
    private static final double MIN_DT_SECONDS = 0.05;
    private static final double MAX_TDCP_RATE_MPS = 2_000.0;
    private static final double MIN_CODE_SIGMA_M = 0.45;
    private static final double MIN_SMOOTHED_SIGMA_M = 0.30;
    private static final double MIN_PHASE_SIGMA_M = 0.003;

    private final Map<Key, Arc> arcs = new HashMap<>();
    private int lastClockDiscontinuity = Integer.MIN_VALUE;

    public void reset() {
        arcs.clear();
        lastClockDiscontinuity = Integer.MIN_VALUE;
    }

    public RawObservationEpoch process(RawObservationEpoch raw) {
        if (raw == null || raw.size() == 0) return raw;

        if (lastClockDiscontinuity != Integer.MIN_VALUE
                && raw.hardwareClockDiscontinuityCount != lastClockDiscontinuity) {
            arcs.clear();
        }
        lastClockDiscontinuity = raw.hardwareClockDiscontinuityCount;

        int n = raw.size();
        double[] smoothedCode = raw.pseudorangeMeters.clone();
        double[] codeSigma = raw.pseudorangeSigmaMeters.clone();
        double[] rate = raw.pseudorangeRateMetersPerSecond.clone();
        double[] rateSigma = raw.pseudorangeRateSigmaMetersPerSecond.clone();
        double[] effectiveCn0 = raw.cn0DbHz.clone();

        for (int i = 0; i < n; i++) {
            Key key = Key.from(raw, i);
            Arc arc = arcs.get(key);

            int state = raw.adrState[i];
            boolean phaseValid = (state & GnssMeasurement.ADR_STATE_VALID) != 0
                    && Double.isFinite(raw.adrMeters[i]);
            boolean reset = (state & (GnssMeasurement.ADR_STATE_RESET
                    | GnssMeasurement.ADR_STATE_CYCLE_SLIP)) != 0;
            boolean halfReported = (state & GnssMeasurement.ADR_STATE_HALF_CYCLE_REPORTED) != 0;
            boolean halfResolved = (state & GnssMeasurement.ADR_STATE_HALF_CYCLE_RESOLVED) != 0;
            if (halfReported && !halfResolved) reset = true;

            double rawCode = raw.pseudorangeMeters[i];
            double rawSigma = finitePositive(raw.pseudorangeSigmaMeters[i], 4.0);
            rawSigma = Math.max(MIN_CODE_SIGMA_M, rawSigma);

            if (!phaseValid || reset || !Double.isFinite(rawCode)) {
                arcs.remove(key);
                codeSigma[i] = rawSigma;
                effectiveCn0[i] = effectiveCn0(raw.cn0DbHz[i], rawSigma, false);
                continue;
            }

            double phaseSigma = finitePositive(raw.adrSigmaMeters[i], 0.02);
            phaseSigma = Math.max(MIN_PHASE_SIGMA_M, phaseSigma);

            if (arc == null) {
                arc = new Arc(raw.gpsWeek, raw.gpsTowSeconds, rawCode,
                        raw.adrMeters[i], rawSigma, phaseSigma);
                arcs.put(key, arc);
                codeSigma[i] = rawSigma;
                effectiveCn0[i] = effectiveCn0(raw.cn0DbHz[i], rawSigma, false);
                continue;
            }

            double dt = elapsedSeconds(arc.gpsWeek, arc.towSeconds,
                    raw.gpsWeek, raw.gpsTowSeconds);
            if (!(dt >= MIN_DT_SECONDS && dt <= MAX_ARC_GAP_SECONDS)) {
                arc.restart(raw.gpsWeek, raw.gpsTowSeconds, rawCode,
                        raw.adrMeters[i], rawSigma, phaseSigma);
                codeSigma[i] = rawSigma;
                effectiveCn0[i] = effectiveCn0(raw.cn0DbHz[i], rawSigma, false);
                continue;
            }

            double adrDelta = raw.adrMeters[i] - arc.lastAdrMeters;
            double predictedCode = arc.smoothedCodeMeters + adrDelta;
            double innovation = rawCode - predictedCode;
            double innovationLimit = Math.max(6.0,
                    4.0 * Math.hypot(rawSigma, arc.codeSigmaMeters));

            if (!Double.isFinite(adrDelta) || !Double.isFinite(innovation)
                    || Math.abs(innovation) > innovationLimit) {
                arc.restart(raw.gpsWeek, raw.gpsTowSeconds, rawCode,
                        raw.adrMeters[i], rawSigma, phaseSigma);
                codeSigma[i] = rawSigma;
                effectiveCn0[i] = effectiveCn0(raw.cn0DbHz[i], rawSigma, false);
                continue;
            }

            int window = Math.min(MAX_HATCH_EPOCHS, arc.epochs + 1);
            double a = 1.0 / window;
            double smooth = a * rawCode + (1.0 - a) * predictedCode;

            // Code noise averages down while carrier uncertainty accumulates slowly.
            double smoothSigma = Math.sqrt((rawSigma * rawSigma) / window
                    + phaseSigma * phaseSigma * Math.max(1, window - 1));
            smoothSigma = Math.max(MIN_SMOOTHED_SIGMA_M, smoothSigma);

            double tdcpRate = adrDelta / dt;
            if (Double.isFinite(tdcpRate) && Math.abs(tdcpRate) <= MAX_TDCP_RATE_MPS) {
                double tdcpSigma = Math.max(0.02,
                        Math.hypot(phaseSigma, arc.phaseSigmaMeters) / dt);
                double dopplerSigma = finitePositive(raw.pseudorangeRateSigmaMetersPerSecond[i], 2.0);
                if (!Double.isFinite(rate[i])) {
                    rate[i] = tdcpRate;
                    rateSigma[i] = tdcpSigma;
                } else {
                    // Inverse-variance fusion retains Doppler robustness while letting
                    // carrier phase dominate clean, continuous arcs.
                    double wt = 1.0 / (tdcpSigma * tdcpSigma);
                    double wd = 1.0 / (dopplerSigma * dopplerSigma);
                    rate[i] = (wt * tdcpRate + wd * rate[i]) / (wt + wd);
                    rateSigma[i] = Math.sqrt(1.0 / (wt + wd));
                }
            }

            smoothedCode[i] = smooth;
            codeSigma[i] = smoothSigma;
            effectiveCn0[i] = effectiveCn0(raw.cn0DbHz[i], smoothSigma, true);
            arc.update(raw.gpsWeek, raw.gpsTowSeconds, smooth,
                    raw.adrMeters[i], smoothSigma, phaseSigma, window);
        }

        return new RawObservationEpoch(raw.gpsWeek, raw.gpsTowSeconds,
                raw.hardwareClockDiscontinuityCount, raw.constellation, raw.svid,
                raw.carrierFrequencyHz, raw.codeType, smoothedCode, codeSigma,
                raw.adrMeters, raw.adrSigmaMeters, rate, rateSigma, effectiveCn0,
                raw.adrState, raw.syncState);
    }

    private static double effectiveCn0(double cn0, double codeSigma, boolean smoothed) {
        double base = Double.isFinite(cn0) ? cn0 : 25.0;
        // Treat uncertainty as a soft quality penalty rather than a binary cutoff.
        double penalty = 4.0 * Math.log10(Math.max(1.0, codeSigma / MIN_CODE_SIGMA_M));
        if (smoothed) penalty *= 0.65;
        return clamp(base - penalty, 12.0, 55.0);
    }

    private static double elapsedSeconds(int week0, double tow0, int week1, double tow1) {
        return (week1 - week0) * 604800.0 + (tow1 - tow0);
    }

    private static double finitePositive(double value, double fallback) {
        return Double.isFinite(value) && value > 0.0 ? value : fallback;
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static final class Key {
        final int constellation;
        final int svid;
        final long frequencyBucketHz;
        final String code;

        Key(int constellation, int svid, long frequencyBucketHz, String code) {
            this.constellation = constellation;
            this.svid = svid;
            this.frequencyBucketHz = frequencyBucketHz;
            this.code = code == null ? "" : code;
        }

        static Key from(RawObservationEpoch e, int i) {
            long bucket = Math.round(e.carrierFrequencyHz[i] / 100_000.0);
            return new Key(e.constellation[i], e.svid[i], bucket, e.codeType[i]);
        }

        @Override public boolean equals(Object o) {
            if (!(o instanceof Key)) return false;
            Key k = (Key)o;
            return constellation == k.constellation && svid == k.svid
                    && frequencyBucketHz == k.frequencyBucketHz && code.equals(k.code);
        }

        @Override public int hashCode() {
            int h = 17;
            h = 31 * h + constellation;
            h = 31 * h + svid;
            h = 31 * h + Long.hashCode(frequencyBucketHz);
            h = 31 * h + code.hashCode();
            return h;
        }
    }

    private static final class Arc {
        int gpsWeek;
        double towSeconds;
        double smoothedCodeMeters;
        double lastAdrMeters;
        double codeSigmaMeters;
        double phaseSigmaMeters;
        int epochs;

        Arc(int gpsWeek, double towSeconds, double code, double adr,
            double codeSigma, double phaseSigma) {
            restart(gpsWeek, towSeconds, code, adr, codeSigma, phaseSigma);
        }

        void restart(int week, double tow, double code, double adr,
                     double codeSigma, double phaseSigma) {
            gpsWeek = week;
            towSeconds = tow;
            smoothedCodeMeters = code;
            lastAdrMeters = adr;
            codeSigmaMeters = codeSigma;
            phaseSigmaMeters = phaseSigma;
            epochs = 1;
        }

        void update(int week, double tow, double code, double adr,
                    double codeSigma, double phaseSigma, int epochs) {
            gpsWeek = week;
            towSeconds = tow;
            smoothedCodeMeters = code;
            lastAdrMeters = adr;
            codeSigmaMeters = codeSigma;
            phaseSigmaMeters = phaseSigma;
            this.epochs = epochs;
        }
    }
}

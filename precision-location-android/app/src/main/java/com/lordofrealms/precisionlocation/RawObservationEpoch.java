package com.lordofrealms.precisionlocation;

/** One Android raw-GNSS epoch in solver-friendly primitive arrays. */
public final class RawObservationEpoch {
    public final int gpsWeek;
    public final double gpsTowSeconds;
    public final int hardwareClockDiscontinuityCount;
    public final int[] constellation;
    public final int[] svid;
    public final double[] carrierFrequencyHz;
    public final String[] codeType;
    public final double[] pseudorangeMeters;
    public final double[] pseudorangeSigmaMeters;
    public final double[] adrMeters;
    public final double[] adrSigmaMeters;
    public final double[] pseudorangeRateMetersPerSecond;
    public final double[] pseudorangeRateSigmaMetersPerSecond;
    public final double[] cn0DbHz;
    public final int[] adrState;
    public final int[] syncState;

    public RawObservationEpoch(
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
            int[] syncState) {
        this.gpsWeek = gpsWeek;
        this.gpsTowSeconds = gpsTowSeconds;
        this.hardwareClockDiscontinuityCount = hardwareClockDiscontinuityCount;
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

    public int size() { return svid.length; }

    public static RawObservationEpoch empty(int gpsWeek, double gpsTowSeconds, int discontinuityCount) {
        return new RawObservationEpoch(gpsWeek, gpsTowSeconds, discontinuityCount,
                new int[0], new int[0], new double[0], new String[0],
                new double[0], new double[0], new double[0], new double[0],
                new double[0], new double[0], new double[0], new int[0], new int[0]);
    }
}

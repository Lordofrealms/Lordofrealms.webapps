package com.lordofrealms.precisionlocation;

public final class PppSolution {
    public enum State { OFF, STARTING, CONVERGING, READY, DEGRADED, ERROR }

    public final State state;
    public final double latitudeDeg;
    public final double longitudeDeg;
    public final double altitudeMeters;
    public final double horizontalAccuracyMeters;
    public final String mode;
    public final String detail;

    public PppSolution(State state, double latitudeDeg, double longitudeDeg,
                       double altitudeMeters, double horizontalAccuracyMeters,
                       String mode, String detail) {
        this.state = state;
        this.latitudeDeg = latitudeDeg;
        this.longitudeDeg = longitudeDeg;
        this.altitudeMeters = altitudeMeters;
        this.horizontalAccuracyMeters = horizontalAccuracyMeters;
        this.mode = mode;
        this.detail = detail;
    }

    public static PppSolution off() {
        return new PppSolution(State.OFF, Double.NaN, Double.NaN, Double.NaN,
                Double.NaN, "AUTO", "Tap Start");
    }
}

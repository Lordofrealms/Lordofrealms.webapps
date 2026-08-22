package com.lordofrealms.precisionlocation;

import android.location.Location;

/**
 * No-signup, no-correction fallback. It smooths the hardware GPS position with
 * a constant-velocity local-plane filter while keeping a deliberately
 * conservative absolute-accuracy floor because broadcast orbit/clock and
 * single-frequency ionosphere errors do not disappear through averaging.
 */
public final class EnhancedGnssFilter {
    public static final class Result {
        public final double latitudeDeg;
        public final double longitudeDeg;
        public final double altitudeMeters;
        public final double horizontalAccuracyMeters;
        public final int validCarrierPhaseSignals;
        public final long ageMillis;

        Result(double latitudeDeg, double longitudeDeg, double altitudeMeters,
               double horizontalAccuracyMeters, int validCarrierPhaseSignals,
               long ageMillis) {
            this.latitudeDeg = latitudeDeg;
            this.longitudeDeg = longitudeDeg;
            this.altitudeMeters = altitudeMeters;
            this.horizontalAccuracyMeters = horizontalAccuracyMeters;
            this.validCarrierPhaseSignals = validCarrierPhaseSignals;
            this.ageMillis = ageMillis;
        }
    }

    private static final double EARTH_RADIUS_M = 6378137.0;
    private static final double MIN_ABSOLUTE_ACCURACY_M = 2.5;
    private static final double MAX_DT_S = 10.0;

    private boolean initialized;
    private double originLatRad;
    private double originLonRad;
    private double xEast;
    private double yNorth;
    private double vxEast;
    private double vyNorth;
    private double altitude;
    private double horizontalAccuracy = Double.NaN;
    private long lastElapsedNanos;
    private long lastFixElapsedNanos;
    private int validAdr;
    private double independentSppDeltaM = Double.NaN;

    public void reset() {
        initialized = false;
        horizontalAccuracy = Double.NaN;
        validAdr = 0;
        independentSppDeltaM = Double.NaN;
        lastElapsedNanos = 0L;
        lastFixElapsedNanos = 0L;
    }

    public void setGnssQuality(int validAdr, double independentSppDeltaM) {
        this.validAdr = Math.max(0, validAdr);
        this.independentSppDeltaM = independentSppDeltaM;
    }

    public void update(Location location) {
        if (location == null) return;
        long now = location.getElapsedRealtimeNanos();
        if (now <= 0L) return;

        double latRad = Math.toRadians(location.getLatitude());
        double lonRad = Math.toRadians(location.getLongitude());
        double rawAccuracy = location.hasAccuracy() && Float.isFinite(location.getAccuracy())
                ? Math.max(1.0, location.getAccuracy()) : 10.0;

        if (!initialized) {
            initialized = true;
            originLatRad = latRad;
            originLonRad = lonRad;
            xEast = 0.0;
            yNorth = 0.0;
            altitude = location.hasAltitude() ? location.getAltitude() : Double.NaN;
            setVelocityFromLocation(location, 1.0);
            horizontalAccuracy = Math.max(MIN_ABSOLUTE_ACCURACY_M, rawAccuracy);
            lastElapsedNanos = now;
            lastFixElapsedNanos = now;
            return;
        }

        double dt = (now - lastElapsedNanos) * 1e-9;
        if (!(dt > 0.0) || dt > MAX_DT_S) dt = 1.0;
        lastElapsedNanos = now;

        // Predict with the last velocity. This prevents the smoothing from
        // simply lagging behind a walking user.
        xEast += vxEast * dt;
        yNorth += vyNorth * dt;

        double cosLat = Math.cos(originLatRad);
        double measuredX = (lonRad - originLonRad) * EARTH_RADIUS_M * Math.max(0.2, cosLat);
        double measuredY = (latRad - originLatRad) * EARTH_RADIUS_M;
        double residualX = measuredX - xEast;
        double residualY = measuredY - yNorth;

        boolean moving = location.hasSpeed() && location.getSpeed() > 0.6f;
        double phaseQuality = validAdr >= 8 ? 1.0 : validAdr >= 5 ? 0.6 : 0.0;
        double alpha;
        if (moving) {
            alpha = 0.55 + 0.10 * phaseQuality;
        } else {
            alpha = 0.20 + 0.10 * phaseQuality;
        }
        if (rawAccuracy > 8.0) alpha *= 0.75;
        alpha = clamp(alpha, 0.12, 0.70);

        xEast += alpha * residualX;
        yNorth += alpha * residualY;

        // Use measured speed/bearing when Android has it; otherwise infer a
        // small velocity correction from successive position residuals.
        if (location.hasSpeed() && location.hasBearing()) {
            setVelocityFromLocation(location, moving ? 0.55 : 0.30);
        } else if (dt > 0.2) {
            double beta = moving ? 0.12 : 0.05;
            vxEast += beta * residualX / dt;
            vyNorth += beta * residualY / dt;
        }

        if (location.hasAltitude()) {
            if (!Double.isFinite(altitude)) altitude = location.getAltitude();
            else altitude = 0.25 * location.getAltitude() + 0.75 * altitude;
        }

        // Absolute GNSS biases are correlated and do not average away, so never
        // report a sub-meter/survey-like uncertainty in this no-correction mode.
        double estimate = Math.max(MIN_ABSOLUTE_ACCURACY_M, rawAccuracy * (moving ? 0.95 : 0.85));
        if (validAdr < 5) estimate = Math.max(estimate, rawAccuracy);
        if (Double.isFinite(independentSppDeltaM)) {
            // If our independently decoded broadcast solution disagrees with
            // Android, widen the uncertainty rather than hiding the discrepancy.
            estimate = Math.max(estimate, Math.min(15.0, independentSppDeltaM));
        }
        horizontalAccuracy = 0.25 * estimate + 0.75 * horizontalAccuracy;
        lastFixElapsedNanos = now;
    }

    public Result result(long nowElapsedNanos) {
        if (!initialized) return null;
        long ageNs = Math.max(0L, nowElapsedNanos - lastFixElapsedNanos);
        long ageMs = ageNs / 1_000_000L;
        if (ageMs > 5_000L) return null;

        double lat = Math.toDegrees(originLatRad + yNorth / EARTH_RADIUS_M);
        double lon = Math.toDegrees(originLonRad
                + xEast / (EARTH_RADIUS_M * Math.max(0.2, Math.cos(originLatRad))));
        double agePenalty = ageMs <= 1_000L ? 0.0 : (ageMs - 1_000L) * 0.002;
        return new Result(lat, lon, altitude,
                Math.max(MIN_ABSOLUTE_ACCURACY_M, horizontalAccuracy + agePenalty),
                validAdr, ageMs);
    }

    private void setVelocityFromLocation(Location location, double blend) {
        if (!location.hasSpeed() || !location.hasBearing()) return;
        double speed = Math.max(0.0, location.getSpeed());
        double bearingRad = Math.toRadians(location.getBearing());
        double measuredEast = speed * Math.sin(bearingRad);
        double measuredNorth = speed * Math.cos(bearingRad);
        blend = clamp(blend, 0.0, 1.0);
        vxEast = (1.0 - blend) * vxEast + blend * measuredEast;
        vyNorth = (1.0 - blend) * vyNorth + blend * measuredNorth;
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}

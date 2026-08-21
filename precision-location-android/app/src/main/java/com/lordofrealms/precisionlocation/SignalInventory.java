package com.lordofrealms.precisionlocation;

import android.location.GnssMeasurement;
import android.location.GnssMeasurementsEvent;
import android.location.GnssStatus;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

public final class SignalInventory {
    public static final class BandCount {
        public int measurements;
        public int validAdr;
    }

    private final LinkedHashMap<String, BandCount> bands = new LinkedHashMap<>();

    public void update(GnssMeasurementsEvent event) {
        bands.clear();
        for (GnssMeasurement m : event.getMeasurements()) {
            String band = classify(m);
            BandCount count = bands.computeIfAbsent(band, k -> new BandCount());
            count.measurements++;
            if ((m.getAccumulatedDeltaRangeState() & GnssMeasurement.ADR_STATE_VALID) != 0
                    && Double.isFinite(m.getAccumulatedDeltaRangeMeters())) {
                count.validAdr++;
            }
        }
    }

    public boolean hasSecondaryCarrierPhase() {
        for (Map.Entry<String, BandCount> e : bands.entrySet()) {
            String k = e.getKey();
            if ((k.contains("L5") || k.contains("E5") || k.contains("B2")) && e.getValue().validAdr > 0) {
                return true;
            }
        }
        return false;
    }

    public int validAdrTotal() {
        int total = 0;
        for (BandCount c : bands.values()) total += c.validAdr;
        return total;
    }

    public String automaticMode() {
        if (hasSecondaryCarrierPhase()) return "DF/MF PPP (automatic)";
        if (validAdrTotal() >= 4) return "SF PPP (automatic)";
        return "GNSS fallback";
    }

    public String summary() {
        if (bands.isEmpty()) return "Waiting for raw GNSS measurements";
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, BandCount> e : bands.entrySet()) {
            if (sb.length() > 0) sb.append("  •  ");
            sb.append(e.getKey()).append(' ')
              .append(e.getValue().validAdr).append('/')
              .append(e.getValue().measurements).append(" ADR");
        }
        return sb.toString();
    }

    private static String classify(GnssMeasurement m) {
        double mhz = m.hasCarrierFrequencyHz() ? m.getCarrierFrequencyHz() / 1e6 : Double.NaN;
        int c = m.getConstellationType();
        if (c == GnssStatus.CONSTELLATION_GPS) {
            if (near(mhz, 1176.45, 3)) return "GPS L5";
            return "GPS L1";
        }
        if (c == GnssStatus.CONSTELLATION_GALILEO) {
            if (near(mhz, 1176.45, 3)) return "GAL E5a";
            if (near(mhz, 1207.14, 3)) return "GAL E5b";
            if (near(mhz, 1278.75, 3)) return "GAL E6";
            return "GAL E1";
        }
        if (c == GnssStatus.CONSTELLATION_GLONASS) return "GLO G1";
        if (c == GnssStatus.CONSTELLATION_BEIDOU) {
            if (near(mhz, 1176.45, 3)) return "BDS B2a";
            if (near(mhz, 1207.14, 3)) return "BDS B2b";
            if (near(mhz, 1561.098, 4)) return "BDS B1I";
            return "BDS B1C";
        }
        return String.format(Locale.US, "SYS%d %.1fMHz", c, mhz);
    }

    private static boolean near(double x, double y, double tolerance) {
        return Double.isFinite(x) && Math.abs(x - y) <= tolerance;
    }
}

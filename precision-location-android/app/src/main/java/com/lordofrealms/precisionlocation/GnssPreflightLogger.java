package com.lordofrealms.precisionlocation;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.location.GnssClock;
import android.location.GnssMeasurement;
import android.location.GnssMeasurementsEvent;
import android.location.GnssNavigationMessage;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Raw diagnostic recorder used only by no-HAS GNSS preflight sessions. */
public final class GnssPreflightLogger implements AutoCloseable {
    private final ContentResolver resolver;
    private final Uri uri;
    private final String displayName;
    private BufferedWriter writer;
    private boolean closed;

    private GnssPreflightLogger(ContentResolver resolver, Uri uri,
                                String displayName, BufferedWriter writer) {
        this.resolver = resolver;
        this.uri = uri;
        this.displayName = displayName;
        this.writer = writer;
    }

    public static GnssPreflightLogger create(Context context) {
        ContentResolver resolver = context.getContentResolver();
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        String name = "precision-location-" + stamp + ".csv";

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "text/csv");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/PrecisionLocation");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) return null;

        try {
            OutputStream stream = resolver.openOutputStream(uri, "w");
            if (stream == null) {
                resolver.delete(uri, null, null);
                return null;
            }
            BufferedWriter writer = new BufferedWriter(
                    new OutputStreamWriter(stream, StandardCharsets.UTF_8), 32 * 1024);
            GnssPreflightLogger logger = new GnssPreflightLogger(resolver, uri, name, writer);
            logger.writeHeader();
            return logger;
        } catch (IOException | RuntimeException ex) {
            resolver.delete(uri, null, null);
            return null;
        }
    }

    public String displayName() { return displayName; }

    private void writeHeader() throws IOException {
        writer.write("# Precision Location raw GNSS preflight log\n");
        writer.write("# format=2\n");
        writer.write("# device=" + csv(Build.MANUFACTURER + " " + Build.MODEL) + "\n");
        writer.write("# sdk=" + Build.VERSION.SDK_INT + "\n");
        writer.write("# Raw columns: elapsedRealtimeNanos,timeNanos,fullBiasNanos,biasNanos,driftNanosPerSecond,hwDiscontinuity,svid,constellation,timeOffsetNanos,state,receivedSvTimeNanos,receivedSvTimeUncertaintyNanos,cn0DbHz,pseudorangeRateMps,pseudorangeRateUncertaintyMps,adrState,adrMeters,adrUncertaintyMeters,carrierFrequencyHz,codeType,multipathIndicator,agcDb\n");
        writer.write("# Nav columns: elapsedRealtimeNanos,type,svid,messageId,submessageId,status,dataHex\n");
        writer.write("# Fix columns: elapsedRealtimeNanos,timeMillis,latitudeDeg,longitudeDeg,altitudeMeters,accuracyMeters,verticalAccuracyMeters\n");
        writer.write("# Engine columns: elapsedRealtimeNanos,acceptedSatellites,solutionStatus,pppLatDeg,pppLonDeg,pppHeightMeters,pppHorizontalAccuracyMeters,pppSatellites,solverNf,ssrSatellites,nativeInfo\n");
        writer.flush();
    }

    public synchronized void logMeasurements(GnssMeasurementsEvent event) {
        if (closed || writer == null || event == null) return;
        try {
            GnssClock c = event.getClock();
            long elapsed = c.hasElapsedRealtimeNanos() ? c.getElapsedRealtimeNanos() : -1L;
            long fullBias = c.hasFullBiasNanos() ? c.getFullBiasNanos() : Long.MIN_VALUE;
            double bias = c.hasBiasNanos() ? c.getBiasNanos() : Double.NaN;
            double drift = c.hasDriftNanosPerSecond() ? c.getDriftNanosPerSecond() : Double.NaN;
            int disc = c.getHardwareClockDiscontinuityCount();

            for (GnssMeasurement m : event.getMeasurements()) {
                double carrier = m.hasCarrierFrequencyHz() ? m.getCarrierFrequencyHz() : Double.NaN;
                double agc = m.hasAutomaticGainControlLevelDb()
                        ? m.getAutomaticGainControlLevelDb() : Double.NaN;
                writer.write("Raw,");
                writer.write(Long.toString(elapsed)); writer.write(',');
                writer.write(Long.toString(c.getTimeNanos())); writer.write(',');
                writer.write(Long.toString(fullBias)); writer.write(',');
                writer.write(Double.toString(bias)); writer.write(',');
                writer.write(Double.toString(drift)); writer.write(',');
                writer.write(Integer.toString(disc)); writer.write(',');
                writer.write(Integer.toString(m.getSvid())); writer.write(',');
                writer.write(Integer.toString(m.getConstellationType())); writer.write(',');
                writer.write(Double.toString(m.getTimeOffsetNanos())); writer.write(',');
                writer.write(Integer.toString(m.getState())); writer.write(',');
                writer.write(Long.toString(m.getReceivedSvTimeNanos())); writer.write(',');
                writer.write(Long.toString(m.getReceivedSvTimeUncertaintyNanos())); writer.write(',');
                writer.write(Double.toString(m.getCn0DbHz())); writer.write(',');
                writer.write(Double.toString(m.getPseudorangeRateMetersPerSecond())); writer.write(',');
                writer.write(Double.toString(m.getPseudorangeRateUncertaintyMetersPerSecond())); writer.write(',');
                writer.write(Integer.toString(m.getAccumulatedDeltaRangeState())); writer.write(',');
                writer.write(Double.toString(m.getAccumulatedDeltaRangeMeters())); writer.write(',');
                writer.write(Double.toString(m.getAccumulatedDeltaRangeUncertaintyMeters())); writer.write(',');
                writer.write(Double.toString(carrier)); writer.write(',');
                writer.write(csv(m.getCodeType())); writer.write(',');
                writer.write(Integer.toString(m.getMultipathIndicator())); writer.write(',');
                writer.write(Double.toString(agc));
                writer.write('\n');
            }
            writer.flush();
        } catch (IOException | RuntimeException ignored) {
        }
    }

    public synchronized void logNavigationMessage(long elapsedRealtimeNanos,
                                                   GnssNavigationMessage message) {
        if (closed || writer == null || message == null) return;
        try {
            writer.write("Nav,");
            writer.write(Long.toString(elapsedRealtimeNanos)); writer.write(',');
            writer.write(Integer.toString(message.getType())); writer.write(',');
            writer.write(Integer.toString(message.getSvid())); writer.write(',');
            writer.write(Integer.toString(message.getMessageId())); writer.write(',');
            writer.write(Integer.toString(message.getSubmessageId())); writer.write(',');
            writer.write(Integer.toString(message.getStatus())); writer.write(',');
            writer.write(hex(message.getData()));
            writer.write('\n');
            writer.flush();
        } catch (IOException | RuntimeException ignored) {
        }
    }

    public synchronized void logLocation(long elapsedRealtimeNanos, Location location) {
        if (closed || writer == null || location == null) return;
        try {
            writer.write("Fix,");
            writer.write(Long.toString(elapsedRealtimeNanos)); writer.write(',');
            writer.write(Long.toString(location.getTime())); writer.write(',');
            writer.write(Double.toString(location.getLatitude())); writer.write(',');
            writer.write(Double.toString(location.getLongitude())); writer.write(',');
            writer.write(Double.toString(location.hasAltitude() ? location.getAltitude() : Double.NaN)); writer.write(',');
            writer.write(Float.toString(location.hasAccuracy() ? location.getAccuracy() : Float.NaN)); writer.write(',');
            writer.write(Float.toString(location.hasVerticalAccuracy()
                    ? location.getVerticalAccuracyMeters() : Float.NaN));
            writer.write('\n');
            writer.flush();
        } catch (IOException | RuntimeException ignored) {
        }
    }

    public synchronized void logEngineStatus(long elapsedRealtimeNanos, int accepted,
                                             String nativeInfo, double[] ppp) {
        if (closed || writer == null) return;
        try {
            writer.write("Engine,");
            writer.write(Long.toString(elapsedRealtimeNanos)); writer.write(',');
            writer.write(Integer.toString(accepted)); writer.write(',');
            writer.write(Double.toString(value(ppp, 0))); writer.write(',');
            writer.write(Double.toString(value(ppp, 1))); writer.write(',');
            writer.write(Double.toString(value(ppp, 2))); writer.write(',');
            writer.write(Double.toString(value(ppp, 3))); writer.write(',');
            writer.write(Double.toString(value(ppp, 4))); writer.write(',');
            writer.write(Double.toString(value(ppp, 6))); writer.write(',');
            writer.write(Double.toString(value(ppp, 7))); writer.write(',');
            writer.write(Double.toString(value(ppp, 8))); writer.write(',');
            writer.write(csv(nativeInfo));
            writer.write('\n');
            writer.flush();
        } catch (IOException | RuntimeException ignored) {
        }
    }

    @Override public synchronized void close() {
        if (closed) return;
        closed = true;
        try {
            if (writer != null) writer.close();
        } catch (IOException ignored) {
        } finally {
            writer = null;
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            try {
                resolver.update(uri, values, null, null);
            } catch (RuntimeException ignored) {
            }
        }
    }

    private static double value(double[] values, int index) {
        return values != null && index >= 0 && index < values.length ? values[index] : Double.NaN;
    }

    private static String csv(String value) {
        if (value == null) return "";
        return '"' + value.replace("\"", "\"\"") + '"';
    }

    private static String hex(byte[] data) {
        if (data == null || data.length == 0) return "";
        final char[] digits = "0123456789ABCDEF".toCharArray();
        char[] out = new char[data.length * 2];
        for (int i = 0; i < data.length; i++) {
            int v = data[i] & 0xFF;
            out[i * 2] = digits[v >>> 4];
            out[i * 2 + 1] = digits[v & 0x0F];
        }
        return new String(out);
    }
}

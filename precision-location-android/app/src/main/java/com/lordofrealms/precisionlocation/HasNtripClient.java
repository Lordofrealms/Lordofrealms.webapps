package com.lordofrealms.precisionlocation;

import android.util.Base64;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HttpsURLConnection;

/** Minimal NTRIP v2/TLS streaming client with automatic reconnect. */
public final class HasNtripClient {
    public interface Listener {
        void onCorrectionBytes(byte[] data, int length);
        void onStatus(String status);
        void onFatalError(String message);
    }

    private final HasAccessConfig config;
    private final Listener listener;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile Thread worker;
    private volatile HttpURLConnection connection;

    public HasNtripClient(HasAccessConfig config, Listener listener) {
        this.config = config;
        this.listener = listener;
    }

    public boolean isConfigured() { return config != null && config.isConfigured(); }

    public void start() {
        if (!isConfigured() || !running.compareAndSet(false, true)) return;
        worker = new Thread(this::runLoop, "has-ntrip");
        worker.setDaemon(true);
        worker.start();
    }

    public void stop() {
        running.set(false);
        HttpURLConnection c = connection;
        if (c != null) c.disconnect();
        Thread w = worker;
        if (w != null) w.interrupt();
        worker = null;
    }

    private void runLoop() {
        long retryMs = 1_000L;
        while (running.get()) {
            try {
                streamOnce();
                retryMs = 1_000L;
            } catch (AuthenticationException ex) {
                running.set(false);
                listener.onFatalError("HAS access was rejected. Check the one-time HAS login settings.");
                return;
            } catch (IOException ex) {
                if (!running.get()) return;
                listener.onStatus("HAS connection interrupted — reconnecting");
                sleep(retryMs);
                retryMs = Math.min(30_000L, retryMs * 2L);
            } catch (RuntimeException ex) {
                if (!running.get()) return;
                listener.onStatus("HAS connection error — reconnecting");
                sleep(retryMs);
                retryMs = Math.min(30_000L, retryMs * 2L);
            }
        }
    }

    private void streamOnce() throws IOException, AuthenticationException {
        URL url = new URL(config.url);
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new IOException("HAS IDD must use HTTPS/TLS");
        }
        HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
        connection = c;
        c.setRequestMethod("GET");
        c.setConnectTimeout(15_000);
        c.setReadTimeout(45_000);
        c.setUseCaches(false);
        c.setDoInput(true);
        c.setRequestProperty("Ntrip-Version", "Ntrip/2.0");
        c.setRequestProperty("User-Agent", "NTRIP PrecisionLocation/0.1");
        c.setRequestProperty("Accept", "*/*");
        String credentials = config.username + ":" + config.password;
        String auth = Base64.encodeToString(credentials.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        c.setRequestProperty("Authorization", "Basic " + auth);
        c.connect();

        int status = c.getResponseCode();
        if (status == HttpURLConnection.HTTP_UNAUTHORIZED || status == HttpURLConnection.HTTP_FORBIDDEN) {
            c.disconnect();
            connection = null;
            throw new AuthenticationException();
        }
        if (status < 200 || status >= 300) {
            String message = "HAS caster HTTP " + status;
            c.disconnect();
            connection = null;
            throw new IOException(message);
        }

        listener.onStatus("HAS corrections connected");
        try (InputStream in = new BufferedInputStream(c.getInputStream(), 8192)) {
            byte[] buffer = new byte[4096];
            while (running.get()) {
                int n = in.read(buffer);
                if (n < 0) throw new IOException("HAS stream ended");
                if (n == 0) continue;
                byte[] chunk = new byte[n];
                System.arraycopy(buffer, 0, chunk, 0, n);
                listener.onCorrectionBytes(chunk, n);
            }
        } finally {
            c.disconnect();
            connection = null;
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private static final class AuthenticationException extends Exception { }
}

package com.lordofrealms.batterymonitorsetup;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class LanManagementClient {
    static final class Session {
        final String token;
        final String csrf;
        final byte[] managementKey;
        Session(String token, String csrf, byte[] managementKey) {
            this.token = token;
            this.csrf = csrf;
            this.managementKey = managementKey;
        }
    }

    JSONObject getConfig(String baseUrl) throws Exception {
        return new JSONObject(request("GET", normalizeBase(baseUrl) + "api/config", null, null));
    }

    Session authenticate(String baseUrl, String expectedDeviceId, String password) throws Exception {
        String error = DeviceSecurity.validatePassword(password);
        if (error != null) throw new IllegalArgumentException(error);
        String base = normalizeBase(baseUrl);
        JSONObject challenge = new JSONObject(request("GET", base + "api/auth/challenge", null, null));
        String deviceId = challenge.getString("deviceId");
        if (!deviceId.equalsIgnoreCase(expectedDeviceId))
            throw new IllegalStateException("Authentication challenge came from a different Battery Monitor.");
        String challengeId = challenge.getString("challengeId");
        String nonce = challenge.getString("nonce");
        byte[] managementKey = DeviceSecurity.deriveManagementKey(deviceId, password);
        byte[] proof = DeviceSecurity.hmacSha256(managementKey,
                "BATMON-AUTH-V1|" + deviceId + "|" + challengeId + "|" + nonce);
        Map<String, String> values = new LinkedHashMap<>();
        values.put("challengeId", challengeId);
        values.put("proof", DeviceSecurity.hexLower(proof));
        JSONObject reply = new JSONObject(request("POST", base + "api/auth/session", form(values), null));
        if (!reply.optBoolean("ok", false)) throw new IllegalStateException("Device did not create an authenticated management session.");
        return new Session(reply.getString("session"), reply.getString("csrf"), managementKey);
    }

    JSONObject saveConfig(String baseUrl, String deviceId, String password, Map<String, String> values) throws Exception {
        Session session = authenticate(baseUrl, deviceId, password);
        try {
            return new JSONObject(request("POST", normalizeBase(baseUrl) + "api/config", form(values), session));
        } finally {
            java.util.Arrays.fill(session.managementKey, (byte) 0);
        }
    }

    void enterProvisioning(String baseUrl, String deviceId, String password) throws Exception {
        Session session = authenticate(baseUrl, deviceId, password);
        try {
            request("POST", normalizeBase(baseUrl) + "api/wifi/provisioning", new byte[0], session);
        } finally {
            java.util.Arrays.fill(session.managementKey, (byte) 0);
        }
    }

    void rotatePassword(String baseUrl, String deviceId, String currentPassword, String newPassword) throws Exception {
        String error = DeviceSecurity.validatePassword(newPassword);
        if (error != null) throw new IllegalArgumentException(error);
        Session session = authenticate(baseUrl, deviceId, currentPassword);
        try {
            byte[] wrapKey = DeviceSecurity.hmacSha256(session.managementKey,
                    "BATMON-PASSWORD-WRAP-V1|" + session.token + "|" + session.csrf);
            byte[] iv = new byte[12];
            new SecureRandom().nextBytes(iv);
            byte[] clear = newPassword.getBytes(StandardCharsets.UTF_8);
            byte[] combined;
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(wrapKey, "AES"), new GCMParameterSpec(128, iv));
                cipher.updateAAD(("BATMON-PASSWORD-ROTATE-V1|" + deviceId + "|" + session.token).getBytes(StandardCharsets.UTF_8));
                combined = cipher.doFinal(clear);
            } finally {
                java.util.Arrays.fill(clear, (byte) 0);
                java.util.Arrays.fill(wrapKey, (byte) 0);
            }
            if (combined.length < 16) throw new IllegalStateException("Password encryption failed.");
            byte[] ciphertext = java.util.Arrays.copyOf(combined, combined.length - 16);
            byte[] tag = java.util.Arrays.copyOfRange(combined, combined.length - 16, combined.length);
            Map<String, String> values = new LinkedHashMap<>();
            values.put("iv", DeviceSecurity.hexLower(iv));
            values.put("ciphertext", DeviceSecurity.hexLower(ciphertext));
            values.put("tag", DeviceSecurity.hexLower(tag));
            request("POST", normalizeBase(baseUrl) + "api/password", form(values), session);
        } finally {
            java.util.Arrays.fill(session.managementKey, (byte) 0);
        }
    }

    private static byte[] form(Map<String, String> values) throws Exception {
        StringBuilder body = new StringBuilder();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8.name()));
            body.append('=');
            body.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8.name()));
        }
        return body.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String normalizeBase(String value) {
        String base = value == null ? "" : value.trim();
        if (base.isEmpty()) throw new IllegalArgumentException("Enter the Battery Monitor LAN address.");
        if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
        if (!base.endsWith("/")) base += "/";
        return base;
    }

    private static String request(String method, String url, byte[] body, Session session) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(7000);
        connection.setRequestMethod(method);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json");
        if (session != null) {
            connection.setRequestProperty("X-Batmon-Session", session.token);
            connection.setRequestProperty("X-Batmon-CSRF", session.csrf);
        }
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            try (OutputStream out = connection.getOutputStream()) { out.write(body); }
        }
        int code = connection.getResponseCode();
        InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
        String text = readAll(stream);
        connection.disconnect();
        if (code < 200 || code >= 300)
            throw new IllegalStateException("HTTP " + code + (text.isEmpty() ? "" : ": " + text));
        return text.isEmpty() ? "{}" : text;
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line);
        }
        return out.toString();
    }
}

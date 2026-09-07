package com.lordofrealms.batterymonitorsetup;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Pattern;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class DeviceSecurity {
    static final int MAX_PASSWORD_BYTES = 128;
    private static final Pattern FORMATTED_INITIAL_CODE = Pattern.compile(
            "^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$",
            Pattern.CASE_INSENSITIVE);

    private DeviceSecurity() { }

    static String validatePassword(String password) {
        if (password == null) password = "";
        int bytes = password.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < 1 || bytes > MAX_PASSWORD_BYTES)
            return "Device Password must contain 1 to " + MAX_PASSWORD_BYTES + " UTF-8 bytes.";
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (Character.isISOControl(c)) return "Device Password cannot contain control characters.";
        }
        return null;
    }

    static String weakReason(String password) {
        if (password == null) password = "";
        if (password.length() < 10) return "It is short and may be easy to guess.";
        String lower = password.toLowerCase(Locale.US);
        if (lower.equals("password") || lower.equals("password1") || lower.equals("12345678")
                || lower.equals("123456789") || lower.equals("qwerty123") || lower.equals("letmein"))
            return "It is a commonly guessed password.";
        boolean lo = false, up = false, digit = false, other = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (Character.isLowerCase(c)) lo = true;
            else if (Character.isUpperCase(c)) up = true;
            else if (Character.isDigit(c)) digit = true;
            else other = true;
        }
        int classes = (lo ? 1 : 0) + (up ? 1 : 0) + (digit ? 1 : 0) + (other ? 1 : 0);
        return classes < 2 ? "It uses only one character type and may be easier to guess." : null;
    }

    static String initialCodeCompatibility(String password) {
        if (password == null) return "";
        if (!FORMATTED_INITIAL_CODE.matcher(password).matches()) return password;
        String value = password.replace("-", "").toUpperCase(Locale.US)
                .replace('O', '0').replace('I', '1').replace('L', '1');
        return value;
    }

    static byte[] sha256(String value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    }

    static String hexLower(byte[] value) {
        StringBuilder out = new StringBuilder(value.length * 2);
        for (byte b : value) out.append(String.format(Locale.US, "%02x", b & 0xFF));
        return out.toString();
    }

    static byte[] deriveManagementKey(String deviceId, String password) throws Exception {
        String effective = initialCodeCompatibility(password);
        byte[] root = sha256("BATMON-CODECHECK-V1|" + deviceId + "|" + effective);
        return sha256("BATMON-LAN-MGMT-V1|" + deviceId + "|" + hexLower(root));
    }

    static String deriveSoftApPassword(String deviceId, String password) throws Exception {
        String effective = initialCodeCompatibility(password);
        byte[] hash = sha256("BATMON-SOFTAP-V1|" + deviceId + "|" + effective);
        StringBuilder out = new StringBuilder(32);
        for (int i = 0; i < 16; i++) out.append(String.format(Locale.US, "%02X", hash[i] & 0xFF));
        return out.toString();
    }

    static byte[] hmacSha256(byte[] key, String message) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
    }
}

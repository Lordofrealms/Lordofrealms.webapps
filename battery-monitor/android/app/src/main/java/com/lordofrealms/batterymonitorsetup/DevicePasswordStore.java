package com.lordofrealms.batterymonitorsetup;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class DevicePasswordStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "BatteryMonitor.DevicePasswordStore.v1";
    private static final String PREFS = "battery_monitor_device_passwords_v1";
    private final SharedPreferences prefs;

    DevicePasswordStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String load(String deviceId) {
        try {
            String encoded = prefs.getString(keyName(deviceId), null);
            if (encoded == null || encoded.isEmpty()) return null;
            byte[] blob = Base64.decode(encoded, Base64.NO_WRAP);
            if (blob.length < 12 + 16) return null;
            ByteBuffer bb = ByteBuffer.wrap(blob);
            byte[] iv = new byte[12];
            bb.get(iv);
            byte[] ciphertext = new byte[bb.remaining()];
            bb.get(ciphertext);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad(deviceId));
            byte[] clear = cipher.doFinal(ciphertext);
            try { return new String(clear, StandardCharsets.UTF_8); }
            finally { java.util.Arrays.fill(clear, (byte) 0); }
        } catch (Exception ignored) {
            return null;
        }
    }

    void save(String deviceId, String password) throws Exception {
        String error = DeviceSecurity.validatePassword(password);
        if (error != null) throw new IllegalArgumentException(error);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        cipher.updateAAD(aad(deviceId));
        byte[] clear = password.getBytes(StandardCharsets.UTF_8);
        byte[] ciphertext;
        try { ciphertext = cipher.doFinal(clear); }
        finally { java.util.Arrays.fill(clear, (byte) 0); }
        byte[] iv = cipher.getIV();
        ByteBuffer blob = ByteBuffer.allocate(iv.length + ciphertext.length);
        blob.put(iv).put(ciphertext);
        prefs.edit().putString(keyName(deviceId), Base64.encodeToString(blob.array(), Base64.NO_WRAP)).apply();
    }

    void forget(String deviceId) {
        try {
            prefs.edit().remove(keyName(deviceId)).apply();
        } catch (Exception ignored) {
            // A credential-store failure must not crash the management UI.
        }
    }

    boolean has(String deviceId) {
        try {
            return prefs.contains(keyName(deviceId));
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String keyName(String deviceId) throws Exception {
        return "cred_" + DeviceSecurity.hexLower(DeviceSecurity.sha256("BATMON-ANDROID-CRED-ID-V1|" + deviceId));
    }

    private static byte[] aad(String deviceId) {
        return ("BATMON-ANDROID-CRED-V1|" + deviceId).getBytes(StandardCharsets.UTF_8);
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }
}

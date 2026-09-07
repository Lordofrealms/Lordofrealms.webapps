package com.lordofrealms.batterymonitorsetup;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class LanManagementDialog extends Dialog {
    interface ProvisioningRequestListener {
        void onProvisioningRequested(String deviceId, String devicePassword, boolean remember);
    }

    private final Activity activity;
    private final ProvisioningRequestListener provisioningListener;
    private final LanManagementClient client = new LanManagementClient();
    private final DevicePasswordStore passwordStore;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private EditText deviceId;
    private EditText address;
    private EditText currentPassword;
    private CheckBox rememberPassword;
    private CheckBox showPasswords;
    private EditText unitName;
    private Spinner batteryType;
    private EditText lowVoltage;
    private EditText criticalVoltage;
    private EditText sampleInterval;
    private EditText calibrationFactor;
    private EditText calibrationOffset;
    private EditText newPassword;
    private EditText confirmPassword;
    private TextView status;

    LanManagementDialog(Activity activity, ProvisioningRequestListener provisioningListener) {
        super(activity);
        this.activity = activity;
        this.provisioningListener = provisioningListener;
        this.passwordStore = new DevicePasswordStore(activity);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Battery Monitor - LAN Management");

        ScrollView scroll = new ScrollView(activity);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        root.setPadding(p, p, p, p);
        scroll.addView(root);

        addText(root, "Manage a Battery Monitor already reachable on your LAN. Read-only settings can be loaded without a password; every change authenticates with the Device Password.");
        deviceId = addEdit(root, "Device ID (BM-A1B2C3)", false);
        address = addEdit(root, "LAN address (example 192.168.1.40 or battery-a1b2c3.local)", false);
        currentPassword = addEdit(root, "Current Device Password", true);
        rememberPassword = new CheckBox(activity);
        rememberPassword.setText("Remember Device Password on this Android device");
        root.addView(rememberPassword, fullWidth());
        showPasswords = new CheckBox(activity);
        showPasswords.setText("Show passwords");
        root.addView(showPasswords, fullWidth());
        showPasswords.setOnCheckedChangeListener((button, checked) -> {
            int type = checked ? InputType.TYPE_CLASS_TEXT : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD;
            currentPassword.setInputType(type);
            newPassword.setInputType(type);
            confirmPassword.setInputType(type);
        });
        deviceId.setOnFocusChangeListener((v, hasFocus) -> { if (!hasFocus) loadSavedPassword(); });

        divider(root);
        addText(root, "Unit settings");
        unitName = addEdit(root, "Name stored on unit", false);
        batteryType = new Spinner(activity);
        batteryType.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"12 V Lead Acid", "4S LiFePO4"}));
        root.addView(batteryType, fullWidth());
        lowVoltage = addEdit(root, "Low warning (V)", false);
        decimal(lowVoltage);
        criticalVoltage = addEdit(root, "Critical (V)", false);
        decimal(criticalVoltage);
        sampleInterval = addEdit(root, "Sample interval (seconds)", false);
        sampleInterval.setInputType(InputType.TYPE_CLASS_NUMBER);
        calibrationFactor = addEdit(root, "Calibration factor", false);
        decimal(calibrationFactor);
        calibrationOffset = addEdit(root, "Calibration offset (V)", false);
        decimalSigned(calibrationOffset);

        LinearLayout settingsButtons = horizontal();
        Button load = button("Load Settings");
        Button save = button("Save Settings");
        settingsButtons.addView(load); settingsButtons.addView(save);
        root.addView(settingsButtons, fullWidth());
        load.setOnClickListener(v -> loadConfig());
        save.setOnClickListener(v -> saveConfig());

        divider(root);
        addText(root, "Security / Wi-Fi");
        newPassword = addEdit(root, "New Device Password (optional)", true);
        confirmPassword = addEdit(root, "Confirm new Device Password", true);
        LinearLayout securityButtons = horizontal();
        Button rotate = button("Change Password");
        Button wifi = button("Change Wi-Fi");
        securityButtons.addView(rotate); securityButtons.addView(wifi);
        root.addView(securityButtons, fullWidth());
        rotate.setOnClickListener(v -> requestPasswordRotation());
        wifi.setOnClickListener(v -> requestWifiProvisioning());

        Button forget = button("Forget Saved Device Password");
        root.addView(forget, fullWidth());
        forget.setOnClickListener(v -> {
            String id = normalizedDeviceId();
            if (id != null) passwordStore.forget(id);
            currentPassword.setText("");
            rememberPassword.setChecked(false);
            setStatus("Saved Device Password removed from this Android device.");
        });

        status = new TextView(activity);
        status.setPadding(0, dp(14), 0, dp(24));
        status.setText("Ready.");
        root.addView(status, fullWidth());

        setContentView(scroll);
    }

    @Override
    public void show() {
        super.show();
        if (getWindow() != null) getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    @Override
    public void dismiss() {
        executor.shutdownNow();
        super.dismiss();
    }

    private void loadSavedPassword() {
        String id = normalizedDeviceId();
        if (id == null || !currentPassword.getText().toString().isEmpty()) return;
        String saved = passwordStore.load(id);
        if (saved != null) {
            currentPassword.setText(saved);
            rememberPassword.setChecked(true);
        }
    }

    private void loadConfig() {
        String base = address.getText().toString().trim();
        if (base.isEmpty()) { setStatus("Enter the monitor's LAN address."); return; }
        setStatus("Loading read-only configuration...");
        executor.execute(() -> {
            try {
                JSONObject c = client.getConfig(base);
                activity.runOnUiThread(() -> {
                    try {
                        deviceId.setText(c.getString("deviceId"));
                        unitName.setText(c.optString("name"));
                        batteryType.setSelection("lifepo4_4s".equals(c.optString("batteryType")) ? 1 : 0);
                        lowVoltage.setText(String.valueOf(c.optDouble("lowVoltage", 12.2)));
                        criticalVoltage.setText(String.valueOf(c.optDouble("criticalVoltage", 11.9)));
                        sampleInterval.setText(String.valueOf(c.optInt("sampleIntervalSec", 10)));
                        calibrationFactor.setText(String.valueOf(c.optDouble("calibrationFactor", 1.0)));
                        calibrationOffset.setText(String.valueOf(c.optDouble("calibrationOffset", 0.0)));
                        loadSavedPassword();
                        setStatus("Configuration loaded. Changes require the Device Password.");
                    } catch (Exception ex) { setStatus("Could not parse configuration: " + message(ex)); }
                });
            } catch (Exception ex) {
                activity.runOnUiThread(() -> setStatus("Load failed: " + message(ex)));
            }
        });
    }

    private void saveConfig() {
        String id = normalizedDeviceId();
        if (id == null) { setStatus("Enter a valid Device ID such as BM-A1B2C3."); return; }
        String password = currentPassword.getText().toString();
        String error = DeviceSecurity.validatePassword(password);
        if (error != null) { setStatus(error); return; }
        Map<String, String> values = new LinkedHashMap<>();
        values.put("name", unitName.getText().toString().trim());
        values.put("batteryType", batteryType.getSelectedItemPosition() == 1 ? "lifepo4_4s" : "lead_acid");
        values.put("lowVoltage", lowVoltage.getText().toString().trim());
        values.put("criticalVoltage", criticalVoltage.getText().toString().trim());
        values.put("sampleIntervalSec", sampleInterval.getText().toString().trim());
        values.put("calibrationFactor", calibrationFactor.getText().toString().trim());
        values.put("calibrationOffset", calibrationOffset.getText().toString().trim());
        String base = address.getText().toString().trim();
        setStatus("Authenticating and saving settings...");
        executor.execute(() -> {
            try {
                client.saveConfig(base, id, password, values);
                if (rememberPassword.isChecked()) passwordStore.save(id, password); else passwordStore.forget(id);
                activity.runOnUiThread(() -> setStatus("Settings saved to the monitor."));
            } catch (Exception ex) {
                activity.runOnUiThread(() -> setStatus("Save failed: " + message(ex)));
            }
        });
    }

    private void requestWifiProvisioning() {
        String id = normalizedDeviceId();
        if (id == null) { setStatus("Enter a valid Device ID such as BM-A1B2C3."); return; }
        String password = currentPassword.getText().toString();
        String error = DeviceSecurity.validatePassword(password);
        if (error != null) { setStatus(error); return; }
        String base = address.getText().toString().trim();
        setStatus("Authenticating and asking the monitor to start secure Wi-Fi setup...");
        executor.execute(() -> {
            try {
                client.enterProvisioning(base, id, password);
                if (rememberPassword.isChecked()) passwordStore.save(id, password); else passwordStore.forget(id);
                activity.runOnUiThread(() -> {
                    setStatus("Secure setup requested. Switching to provisioning controls...");
                    provisioningListener.onProvisioningRequested(id, password, rememberPassword.isChecked());
                    dismiss();
                });
            } catch (Exception ex) {
                activity.runOnUiThread(() -> setStatus("Could not start secure Wi-Fi setup: " + message(ex)));
            }
        });
    }

    private void requestPasswordRotation() {
        String id = normalizedDeviceId();
        if (id == null) { setStatus("Enter a valid Device ID such as BM-A1B2C3."); return; }
        String current = currentPassword.getText().toString();
        String next = newPassword.getText().toString();
        String confirm = confirmPassword.getText().toString();
        String currentError = DeviceSecurity.validatePassword(current);
        if (currentError != null) { setStatus(currentError); return; }
        String nextError = DeviceSecurity.validatePassword(next);
        if (nextError != null) { setStatus(nextError); return; }
        if (!next.equals(confirm)) { setStatus("The new Device Password entries do not match."); return; }
        String weak = DeviceSecurity.weakReason(next);
        if (weak != null) {
            new AlertDialog.Builder(activity)
                    .setTitle("Weak Device Password")
                    .setMessage("This Device Password looks weak. " + weak + "\n\nA person on the same LAN may have an easier time guessing it. Use it anyway?")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Use Anyway", (d, which) -> rotatePasswordNow(id, current, next))
                    .show();
        } else {
            rotatePasswordNow(id, current, next);
        }
    }

    private void rotatePasswordNow(String id, String current, String next) {
        String base = address.getText().toString().trim();
        setStatus("Authenticating and changing Device Password...");
        executor.execute(() -> {
            try {
                client.rotatePassword(base, id, current, next);
                if (rememberPassword.isChecked()) passwordStore.save(id, next); else passwordStore.forget(id);
                activity.runOnUiThread(() -> {
                    currentPassword.setText(next);
                    newPassword.setText("");
                    confirmPassword.setText("");
                    setStatus("Device Password changed. Older management sessions were invalidated.");
                });
            } catch (Exception ex) {
                activity.runOnUiThread(() -> setStatus("Password change failed: " + message(ex)));
            }
        });
    }

    private String normalizedDeviceId() {
        String value = deviceId.getText().toString().trim().toUpperCase(Locale.US).replace(" ", "");
        return value.matches("BM-[0-9A-F]{6}") ? value : null;
    }

    private EditText addEdit(LinearLayout root, String hint, boolean password) {
        EditText edit = new EditText(activity);
        edit.setHint(hint);
        if (password) edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(edit, fullWidth());
        return edit;
    }

    private void decimal(EditText edit) { edit.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL); }
    private void decimalSigned(EditText edit) { edit.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED); }
    private Button button(String text) { Button b = new Button(activity); b.setText(text); return b; }
    private LinearLayout horizontal() { LinearLayout row = new LinearLayout(activity); row.setOrientation(LinearLayout.HORIZONTAL); return row; }
    private void divider(LinearLayout root) { View v = new View(activity); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)); p.setMargins(0, dp(16), 0, dp(8)); v.setBackgroundColor(0xFFCCCCCC); root.addView(v, p); }
    private void addText(LinearLayout root, String text) { TextView t = new TextView(activity); t.setText(text); t.setTextSize(16); t.setPadding(0, dp(6), 0, dp(8)); root.addView(t); }
    private LinearLayout.LayoutParams fullWidth() { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); }
    private void setStatus(String value) { status.setText(value); }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private static String message(Exception ex) { return ex.getMessage() == null || ex.getMessage().trim().isEmpty() ? ex.getClass().getSimpleName() : ex.getMessage(); }
}

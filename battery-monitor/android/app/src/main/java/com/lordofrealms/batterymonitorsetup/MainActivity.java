package com.lordofrealms.batterymonitorsetup;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.content.pm.PackageManager;
import android.os.Build;
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
import android.widget.Toast;

import com.budiyev.android.codescanner.CodeScanner;
import com.budiyev.android.codescanner.CodeScannerView;
import com.budiyev.android.codescanner.ScanMode;
import com.espressif.provisioning.DeviceConnectionEvent;
import com.espressif.provisioning.ESPConstants;
import com.espressif.provisioning.ESPDevice;
import com.espressif.provisioning.ESPProvisionManager;
import com.espressif.provisioning.WiFiAccessPoint;
import com.espressif.provisioning.listeners.ProvisionListener;
import com.espressif.provisioning.listeners.WiFiScanListener;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int WIFI_PERMISSION_REQUEST = 1001;
    private static final int CAMERA_PERMISSION_REQUEST = 1002;
    private static final String DEFAULT_USERNAME = "batmon";
    private static final String CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    private ESPProvisionManager provisionManager;
    private ESPDevice espDevice;
    private DevicePasswordStore passwordStore;

    private EditText deviceIdEdit;
    private EditText devicePasswordEdit;
    private CheckBox rememberDevicePassword;
    private Spinner homeWifiSpinner;
    private EditText homeSsidEdit;
    private EditText homePasswordEdit;
    private Button connectButton;
    private Button scanWifiButton;
    private Button provisionButton;
    private TextView statusText;

    private final List<String> homeSsids = new ArrayList<>();
    private ArrayAdapter<String> homeAdapter;
    private String provisioningUsername = DEFAULT_USERNAME;
    private boolean pendingSecureConnect;
    private boolean pendingQrScan;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        provisionManager = ESPProvisionManager.getInstance(this);
        passwordStore = new DevicePasswordStore(this);
        buildUi();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (!EventBus.getDefault().isRegistered(this)) EventBus.getDefault().register(this);
    }

    @Override
    protected void onStop() {
        if (EventBus.getDefault().isRegistered(this)) EventBus.getDefault().unregister(this);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        try { if (espDevice != null) espDevice.disconnectDevice(); } catch (Exception ignored) { }
        super.onDestroy();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        root.setPadding(p, p, p, p);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Battery Monitor Secure Setup");
        title.setTextSize(26);
        title.setPadding(0, 0, 0, dp(10));
        root.addView(title);

        TextView intro = new TextView(this);
        intro.setText("The same Device Password protects LAN management and Wi-Fi setup. Scan the initial QR code or enter the Device ID and Device Password. Wi-Fi credentials are sent through Espressif Security 2 (SRP6a + AES-GCM).");
        intro.setTextSize(16);
        intro.setPadding(0, 0, 0, dp(14));
        root.addView(intro);

        Button manageButton = new Button(this);
        manageButton.setText("Manage Device on LAN");
        manageButton.setOnClickListener(v -> openLanManagement());
        root.addView(manageButton, fullWidth());

        Button qrButton = new Button(this);
        qrButton.setText("Scan Initial Setup QR");
        qrButton.setOnClickListener(v -> requestQrScan());
        root.addView(qrButton, fullWidth());

        deviceIdEdit = addEdit(root, "Device ID (example BM-A1B2C3)", false);
        devicePasswordEdit = addEdit(root, "Device Password", true);
        rememberDevicePassword = new CheckBox(this);
        rememberDevicePassword.setText("Remember Device Password on this Android device");
        root.addView(rememberDevicePassword, fullWidth());

        Button forget = new Button(this);
        forget.setText("Forget Saved Device Password");
        forget.setOnClickListener(v -> forgetSavedPassword());
        root.addView(forget, fullWidth());

        deviceIdEdit.setOnFocusChangeListener((v, hasFocus) -> { if (!hasFocus) loadSavedPasswordIfAvailable(); });

        connectButton = new Button(this);
        connectButton.setText("Connect Securely");
        connectButton.setOnClickListener(v -> requestSecureConnect());
        root.addView(connectButton, fullWidth());

        addDivider(root);
        addLabel(root, "Home Wi-Fi");
        homeWifiSpinner = new Spinner(this);
        homeAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, homeSsids);
        homeWifiSpinner.setAdapter(homeAdapter);
        homeWifiSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> {
            if (position >= 0 && position < homeSsids.size()) homeSsidEdit.setText(homeSsids.get(position));
        }));
        root.addView(homeWifiSpinner, fullWidth());

        scanWifiButton = new Button(this);
        scanWifiButton.setText("Scan Wi-Fi from Monitor");
        scanWifiButton.setEnabled(false);
        scanWifiButton.setOnClickListener(v -> scanHomeNetworks());
        root.addView(scanWifiButton, fullWidth());

        homeSsidEdit = addEdit(root, "Home Wi-Fi SSID", false);
        homePasswordEdit = addEdit(root, "Home Wi-Fi password", true);

        provisionButton = new Button(this);
        provisionButton.setText("Provision Home Wi-Fi");
        provisionButton.setEnabled(false);
        provisionButton.setOnClickListener(v -> provisionHomeWifi());
        root.addView(provisionButton, fullWidth());

        TextView note = new TextView(this);
        note.setText("To change settings or the Device Password while the monitor is online, use Manage Device on LAN. A 5-second BOOT hold on the monitor also starts secure Wi-Fi setup without erasing the Device Password.");
        note.setPadding(0, dp(12), 0, 0);
        root.addView(note);

        statusText = new TextView(this);
        statusText.setText("Ready. Scan the QR, manage an online unit, or enter the Device ID and Device Password.");
        statusText.setTextSize(15);
        statusText.setPadding(0, dp(16), 0, dp(30));
        root.addView(statusText);

        setContentView(scroll);
    }

    private void openLanManagement() {
        LanManagementDialog dialog = new LanManagementDialog(this, (deviceId, password, remember) -> {
            deviceIdEdit.setText(deviceId);
            devicePasswordEdit.setText(password);
            rememberDevicePassword.setChecked(remember);
            setStatus("The monitor is entering secure setup. Connecting to its temporary setup network...");
            connectButton.postDelayed(this::requestSecureConnect, 700);
        });
        dialog.show();
    }

    private void loadSavedPasswordIfAvailable() {
        String id = normalizeDeviceId(deviceIdEdit.getText().toString());
        if (id.isEmpty() || !devicePasswordEdit.getText().toString().isEmpty()) return;
        String saved = passwordStore.load(id);
        if (saved != null) {
            devicePasswordEdit.setText(saved);
            rememberDevicePassword.setChecked(true);
        }
    }

    private void forgetSavedPassword() {
        String id = normalizeDeviceId(deviceIdEdit.getText().toString());
        if (id.isEmpty()) {
            toast("Enter the Device ID first.");
            return;
        }
        passwordStore.forget(id);
        devicePasswordEdit.setText("");
        rememberDevicePassword.setChecked(false);
        setStatus("Saved Device Password removed from this Android device.");
    }

    private void requestSecureConnect() {
        if (!hasWifiPermission()) {
            pendingSecureConnect = true;
            requestWifiPermission();
            return;
        }
        connectSecurely();
    }

    private void connectSecurely() {
        String deviceId = normalizeDeviceId(deviceIdEdit.getText().toString());
        String enteredPassword = devicePasswordEdit.getText().toString();
        if (deviceId.isEmpty()) {
            toast("Enter a valid Device ID such as BM-A1B2C3.");
            return;
        }
        String passwordError = DeviceSecurity.validatePassword(enteredPassword);
        if (passwordError != null) {
            toast(passwordError);
            return;
        }
        String effectivePassword = DeviceSecurity.initialCodeCompatibility(enteredPassword);

        String setupSsid = setupSsidForDevice(deviceId);
        String setupPassword;
        try { setupPassword = DeviceSecurity.deriveSoftApPassword(deviceId, enteredPassword); }
        catch (Exception ex) { setStatus("Could not derive setup-network credentials: " + ex.getMessage()); return; }

        try { if (espDevice != null) espDevice.disconnectDevice(); } catch (Exception ignored) { }
        espDevice = provisionManager.createESPDevice(
                ESPConstants.TransportType.TRANSPORT_SOFTAP,
                ESPConstants.SecurityType.SECURITY_2);
        espDevice.setDeviceName(setupSsid);
        espDevice.setProofOfPossession(effectivePassword);
        espDevice.setUserName(provisioningUsername);

        connectButton.setEnabled(false);
        scanWifiButton.setEnabled(false);
        provisionButton.setEnabled(false);
        setStatus("Connecting to " + setupSsid + " using its derived WPA2 key. Android may ask you to approve the temporary Wi-Fi connection...");

        try {
            espDevice.connectWiFiDevice(setupSsid, setupPassword);
        } catch (SecurityException ex) {
            connectButton.setEnabled(true);
            setStatus("Android blocked the setup-network connection: " + ex.getMessage());
        } catch (Exception ex) {
            connectButton.setEnabled(true);
            setStatus("Could not start secure connection: " + ex.getMessage());
        }
    }

    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onDeviceConnectionEvent(DeviceConnectionEvent event) {
        if (event.getEventType() == ESPConstants.EVENT_DEVICE_CONNECTED) {
            connectButton.setEnabled(true);
            scanWifiButton.setEnabled(true);
            provisionButton.setEnabled(true);
            setStatus("Setup network connected. Establishing Security 2 and asking the monitor to scan nearby home Wi-Fi networks...");
            scanHomeNetworks();
        } else if (event.getEventType() == ESPConstants.EVENT_DEVICE_CONNECTION_FAILED) {
            connectButton.setEnabled(true);
            scanWifiButton.setEnabled(false);
            provisionButton.setEnabled(false);
            setStatus("Could not connect to the secure Battery Monitor setup network. Check the Device ID/Device Password and confirm the monitor is in setup mode.");
        }
    }

    private void scanHomeNetworks() {
        if (espDevice == null) {
            toast("Connect securely to the monitor first.");
            return;
        }
        scanWifiButton.setEnabled(false);
        setStatus("Authenticating with Security 2 and scanning Wi-Fi from the monitor...");
        espDevice.scanNetworks(new WiFiScanListener() {
            @Override
            public void onWifiListReceived(ArrayList<WiFiAccessPoint> wifiList) {
                runOnUiThread(() -> {
                    Map<String, WiFiAccessPoint> best = new LinkedHashMap<>();
                    for (WiFiAccessPoint ap : wifiList) {
                        String ssid = ap.getWifiName();
                        if (ssid == null || ssid.trim().isEmpty()) continue;
                        WiFiAccessPoint old = best.get(ssid);
                        if (old == null || ap.getRssi() > old.getRssi()) best.put(ssid, ap);
                    }
                    List<WiFiAccessPoint> sorted = new ArrayList<>(best.values());
                    sorted.sort(Comparator.comparingInt(WiFiAccessPoint::getRssi).reversed());
                    homeSsids.clear();
                    for (WiFiAccessPoint ap : sorted) homeSsids.add(ap.getWifiName());
                    homeAdapter.notifyDataSetChanged();
                    if (!homeSsids.isEmpty()) {
                        homeWifiSpinner.setSelection(0);
                        homeSsidEdit.setText(homeSsids.get(0));
                    }
                    scanWifiButton.setEnabled(true);
                    provisionButton.setEnabled(true);
                    setStatus("Security 2 session established. Found " + homeSsids.size() + " Wi-Fi network(s). Select your home Wi-Fi and enter its password.");
                });
            }

            @Override
            public void onWiFiScanFailed(Exception e) {
                runOnUiThread(() -> {
                    scanWifiButton.setEnabled(true);
                    provisionButton.setEnabled(false);
                    setStatus("Secure session/Wi-Fi scan failed. A wrong Device Password is one possible cause. " + safeMessage(e));
                });
            }
        });
    }

    private void provisionHomeWifi() {
        if (espDevice == null) {
            toast("Connect securely to the monitor first.");
            return;
        }
        String ssid = homeSsidEdit.getText().toString().trim();
        String password = homePasswordEdit.getText().toString();
        if (ssid.isEmpty()
                || ssid.getBytes(StandardCharsets.UTF_8).length > 32
                || password.getBytes(StandardCharsets.UTF_8).length > 63) {
            toast("Check the home Wi-Fi SSID and password.");
            return;
        }

        provisionButton.setEnabled(false);
        setStatus("Sending home Wi-Fi credentials inside the authenticated Security 2 session...");
        espDevice.provision(ssid, password, new ProvisionListener() {
            @Override public void createSessionFailed(Exception e) { failProvision("Could not establish the encrypted Security 2 session", e); }
            @Override public void wifiConfigSent() { runOnUiThread(() -> setStatus("Encrypted Wi-Fi credentials sent. Waiting for the monitor to test them...")); }
            @Override public void wifiConfigFailed(Exception e) { failProvision("Could not send Wi-Fi credentials", e); }
            @Override public void wifiConfigApplied() { runOnUiThread(() -> setStatus("The monitor accepted the Wi-Fi credentials and is connecting...")); }
            @Override public void wifiConfigApplyFailed(Exception e) { failProvision("The monitor could not apply the Wi-Fi credentials", e); }
            @Override public void provisioningFailedFromDevice(ESPConstants.ProvisionFailureReason failureReason) {
                runOnUiThread(() -> {
                    provisionButton.setEnabled(true);
                    setStatus("The monitor rejected the home Wi-Fi configuration: " + failureReason);
                });
            }
            @Override public void deviceProvisioningSuccess() {
                runOnUiThread(() -> {
                    String id = normalizeDeviceId(deviceIdEdit.getText().toString());
                    String devicePassword = devicePasswordEdit.getText().toString();
                    try {
                        if (!id.isEmpty()) {
                            if (rememberDevicePassword.isChecked()) passwordStore.save(id, devicePassword);
                            else passwordStore.forget(id);
                        }
                    } catch (Exception ex) {
                        setStatus("Wi-Fi provisioning succeeded, but Android could not save the Device Password: " + safeMessage(ex));
                    }
                    homePasswordEdit.setText("");
                    if (!rememberDevicePassword.isChecked()) devicePasswordEdit.setText("");
                    scanWifiButton.setEnabled(false);
                    provisionButton.setEnabled(false);
                    connectButton.setEnabled(true);
                    setStatus("Secure provisioning succeeded. The monitor is joining " + ssid + ". The same Device Password remains valid for future management and secure reprovisioning.");
                    toast("Battery Monitor Wi-Fi configured securely");
                });
            }
            @Override public void onProvisioningFailed(Exception e) { failProvision("Secure provisioning failed", e); }
        });
    }

    private void failProvision(String prefix, Exception e) {
        runOnUiThread(() -> {
            provisionButton.setEnabled(true);
            setStatus(prefix + ": " + safeMessage(e));
        });
    }

    private void requestQrScan() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            pendingQrScan = true;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
            return;
        }
        showQrScanner();
    }

    private void showQrScanner() {
        Dialog dialog = new Dialog(this);
        CodeScannerView scannerView = new CodeScannerView(this);
        scannerView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        dialog.setContentView(scannerView);

        CodeScanner scanner = new CodeScanner(this, scannerView);
        scanner.setScanMode(ScanMode.SINGLE);
        scanner.setDecodeCallback(result -> runOnUiThread(() -> {
            try {
                applyQrPayload(result.getText());
                dialog.dismiss();
            } catch (Exception ex) {
                toast("Invalid Battery Monitor QR: " + ex.getMessage());
                scanner.startPreview();
            }
        }));
        scanner.setErrorCallback(error -> runOnUiThread(() -> {
            toast("QR camera error: " + error.getMessage());
            dialog.dismiss();
        }));
        dialog.setOnDismissListener(d -> scanner.releaseResources());
        dialog.setOnShowListener(d -> scanner.startPreview());
        dialog.show();
        if (dialog.getWindow() != null) dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private void applyQrPayload(String raw) throws Exception {
        JSONObject json = new JSONObject(raw);
        if (!"v1".equals(json.optString("ver"))) throw new IllegalArgumentException("unsupported QR version");
        if (!"softap".equalsIgnoreCase(json.optString("transport"))) throw new IllegalArgumentException("unsupported transport");
        if (json.optInt("security", 2) != 2) throw new IllegalArgumentException("Security 2 is required");

        String deviceId = normalizeDeviceId(json.optString("id"));
        String initialCode = normalizeSetupCode(json.optString("pop"));
        String username = json.optString("username", DEFAULT_USERNAME).trim();
        if (deviceId.isEmpty() || initialCode.isEmpty() || username.isEmpty()) throw new IllegalArgumentException("missing device identity/initial Device Password");

        String expectedSsid = setupSsidForDevice(deviceId);
        String qrSsid = json.optString("name", expectedSsid);
        if (!expectedSsid.equals(qrSsid)) throw new IllegalArgumentException("QR device name does not match Device ID");
        String expectedPassword = DeviceSecurity.deriveSoftApPassword(deviceId, initialCode);
        String qrPassword = json.optString("password", "");
        if (!qrPassword.isEmpty() && !MessageDigest.isEqual(expectedPassword.getBytes(StandardCharsets.US_ASCII), qrPassword.getBytes(StandardCharsets.US_ASCII)))
            throw new IllegalArgumentException("QR setup-network credential mismatch");

        provisioningUsername = username;
        deviceIdEdit.setText(deviceId);
        devicePasswordEdit.setText(formatSetupCode(initialCode));
        rememberDevicePassword.setChecked(false);
        setStatus("QR accepted for " + deviceId + ". Tap Connect Securely.");
    }

    private boolean hasWifiPermission() {
        if (Build.VERSION.SDK_INT >= 33)
            return checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestWifiPermission() {
        if (Build.VERSION.SDK_INT >= 33)
            requestPermissions(new String[]{Manifest.permission.NEARBY_WIFI_DEVICES}, WIFI_PERMISSION_REQUEST);
        else
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, WIFI_PERMISSION_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == WIFI_PERMISSION_REQUEST) {
            if (granted && pendingSecureConnect) {
                pendingSecureConnect = false;
                connectSecurely();
            } else if (!granted) {
                pendingSecureConnect = false;
                setStatus("Nearby Wi-Fi permission is required to connect to the monitor's temporary setup network.");
            }
        } else if (requestCode == CAMERA_PERMISSION_REQUEST) {
            if (granted && pendingQrScan) {
                pendingQrScan = false;
                showQrScanner();
            } else if (!granted) {
                pendingQrScan = false;
                setStatus("Camera permission was denied. You can enter the Device ID and Device Password manually instead.");
            }
        }
    }

    private static String normalizeDeviceId(String input) {
        if (input == null) return "";
        String value = input.trim().toUpperCase(Locale.US).replace(" ", "");
        if (!value.matches("BM-[0-9A-F]{6}")) return "";
        return value;
    }

    private static String setupSsidForDevice(String deviceId) {
        return "BatteryMonitor-" + deviceId.substring(3);
    }

    // QR labels are version-1 manufacturing labels and intentionally remain
    // the canonical 16-character high-entropy initial Device Password format.
    private static String normalizeSetupCode(String input) {
        if (input == null) return "";
        StringBuilder out = new StringBuilder(16);
        for (int i = 0; i < input.length(); i++) {
            char c = Character.toUpperCase(input.charAt(i));
            if (c == '-' || Character.isWhitespace(c)) continue;
            if (c == 'O') c = '0';
            if (c == 'I' || c == 'L') c = '1';
            if (CODE_ALPHABET.indexOf(c) < 0) return "";
            out.append(c);
        }
        return out.length() == 16 ? out.toString() : "";
    }

    private static String formatSetupCode(String code) {
        if (code.length() != 16) return code;
        return code.substring(0, 4) + "-" + code.substring(4, 8) + "-" + code.substring(8, 12) + "-" + code.substring(12, 16);
    }

    private static String safeMessage(Exception e) {
        if (e == null || e.getMessage() == null || e.getMessage().trim().isEmpty()) return "unknown error";
        return e.getMessage();
    }

    private EditText addEdit(LinearLayout root, String hint, boolean password) {
        EditText edit = new EditText(this);
        edit.setHint(hint);
        if (password) edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(edit, fullWidth());
        return edit;
    }

    private void addLabel(LinearLayout root, String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextSize(16);
        label.setPadding(0, dp(10), 0, dp(3));
        root.addView(label);
    }

    private void addDivider(LinearLayout root) {
        View divider = new View(this);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
        params.setMargins(0, dp(18), 0, dp(8));
        divider.setBackgroundColor(0xFFCCCCCC);
        root.addView(divider, params);
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private void setStatus(String text) { statusText.setText(text); }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private interface PositionConsumer { void accept(int position); }
    private static final class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
        private final PositionConsumer consumer;
        private SimpleItemSelectedListener(PositionConsumer consumer) { this.consumer = consumer; }
        @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) { consumer.accept(position); }
        @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
    }
}

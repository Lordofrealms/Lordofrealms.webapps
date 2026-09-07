package com.lordofrealms.batterymonitorsetup;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int WIFI_PERMISSION_REQUEST = 1001;
    private static final String MONITOR_PREFIX = "BatteryMonitor-";
    private static final String DEVICE_BASE_URL = "http://192.168.4.1";

    private WifiManager wifiManager;
    private ConnectivityManager connectivityManager;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private Spinner monitorSpinner;
    private EditText manualMonitorSsid;
    private Spinner homeWifiSpinner;
    private EditText homeSsid;
    private EditText wifiPassword;
    private EditText deviceName;
    private Spinner batteryType;
    private EditText lowVoltage;
    private EditText criticalVoltage;
    private EditText sampleInterval;
    private TextView statusText;
    private Button connectButton;
    private Button configureButton;

    private final List<String> monitorSsids = new ArrayList<>();
    private final List<String> homeSsids = new ArrayList<>();
    private ArrayAdapter<String> monitorAdapter;
    private ArrayAdapter<String> homeAdapter;

    private Network monitorNetwork;
    private ConnectivityManager.NetworkCallback monitorNetworkCallback;
    private boolean scanReceiverRegistered;

    private final BroadcastReceiver wifiScanReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            updateMonitorScanResults();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        buildUi();
        registerScanReceiver();
        ensureWifiPermissionThenScan();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        root.setPadding(p, p, p, p);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Battery Monitor Setup");
        title.setTextSize(26);
        title.setPadding(0, 0, 0, dp(12));
        root.addView(title);

        TextView intro = new TextView(this);
        intro.setText("1. Power the ESP32.  2. Select its BatteryMonitor-XXXXXX setup network.  3. Connect.  4. Select your home Wi-Fi, enter the password, and configure the unit.");
        intro.setTextSize(16);
        intro.setPadding(0, 0, 0, dp(16));
        root.addView(intro);

        addLabel(root, "Battery monitor setup network");
        monitorSpinner = new Spinner(this);
        monitorAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, monitorSsids);
        monitorSpinner.setAdapter(monitorAdapter);
        root.addView(monitorSpinner, fullWidth());

        manualMonitorSsid = addEdit(root, "Manual monitor SSID (optional, e.g. BatteryMonitor-A1B2C3)", false);

        LinearLayout monitorButtons = horizontalRow();
        Button scanButton = new Button(this);
        scanButton.setText("Scan Monitors");
        scanButton.setOnClickListener(v -> ensureWifiPermissionThenScan());
        connectButton = new Button(this);
        connectButton.setText("Connect to Monitor");
        connectButton.setOnClickListener(v -> connectToSelectedMonitor());
        monitorButtons.addView(scanButton, weighted());
        monitorButtons.addView(connectButton, weighted());
        root.addView(monitorButtons, fullWidth());

        Button wifiSettings = new Button(this);
        wifiSettings.setText("Open Android Wi-Fi Settings (fallback)");
        wifiSettings.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS)));
        root.addView(wifiSettings, fullWidth());

        addDivider(root);
        addLabel(root, "Home Wi-Fi network");
        homeWifiSpinner = new Spinner(this);
        homeAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, homeSsids);
        homeWifiSpinner.setAdapter(homeAdapter);
        homeWifiSpinner.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> {
            if (homeSsid != null && position >= 0 && position < homeSsids.size()) homeSsid.setText(homeSsids.get(position));
        }));
        root.addView(homeWifiSpinner, fullWidth());

        Button scanHomeButton = new Button(this);
        scanHomeButton.setText("Scan Home Wi-Fi from ESP32");
        scanHomeButton.setOnClickListener(v -> scanHomeNetworks());
        root.addView(scanHomeButton, fullWidth());

        homeSsid = addEdit(root, "Home Wi-Fi SSID", false);
        wifiPassword = addEdit(root, "Home Wi-Fi password", true);

        addDivider(root);
        deviceName = addEdit(root, "Device name (e.g. GX 460)", false);

        addLabel(root, "Battery type");
        batteryType = new Spinner(this);
        ArrayAdapter<String> batteryAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"12 V Lead Acid", "4S LiFePO4"});
        batteryType.setAdapter(batteryAdapter);
        batteryType.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> applyChemistryDefaults(position == 1)));
        root.addView(batteryType, fullWidth());

        lowVoltage = addEdit(root, "Low warning voltage", false);
        lowVoltage.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        criticalVoltage = addEdit(root, "Critical voltage", false);
        criticalVoltage.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        sampleInterval = addEdit(root, "ESP32 sample interval in seconds (default 10)", false);
        sampleInterval.setInputType(InputType.TYPE_CLASS_NUMBER);
        sampleInterval.setText("10");
        applyChemistryDefaults(false);

        configureButton = new Button(this);
        configureButton.setText("Configure Device");
        configureButton.setEnabled(false);
        configureButton.setOnClickListener(v -> configureDevice());
        root.addView(configureButton, fullWidth());

        statusText = new TextView(this);
        statusText.setText("Scanning for BatteryMonitor setup networks...");
        statusText.setTextSize(15);
        statusText.setPadding(0, dp(16), 0, dp(30));
        root.addView(statusText);

        setContentView(scroll);
    }

    private void applyChemistryDefaults(boolean lifepo4) {
        if (lowVoltage == null || criticalVoltage == null) return;
        if (lifepo4) {
            lowVoltage.setText("12.80");
            criticalVoltage.setText("12.00");
        } else {
            lowVoltage.setText("12.20");
            criticalVoltage.setText("11.90");
        }
    }

    private void ensureWifiPermissionThenScan() {
        if (hasWifiPermission()) {
            startMonitorScan();
            return;
        }
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{Manifest.permission.NEARBY_WIFI_DEVICES}, WIFI_PERMISSION_REQUEST);
        } else {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, WIFI_PERMISSION_REQUEST);
        }
    }

    private boolean hasWifiPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED;
        }
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == WIFI_PERMISSION_REQUEST && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startMonitorScan();
        } else if (requestCode == WIFI_PERMISSION_REQUEST) {
            setStatus("Wi-Fi discovery permission was denied. You can still type the BatteryMonitor-XXXXXX SSID manually or use Android Wi-Fi Settings.");
        }
    }

    private void registerScanReceiver() {
        IntentFilter filter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(wifiScanReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(wifiScanReceiver, filter);
        }
        scanReceiverRegistered = true;
    }

    private void startMonitorScan() {
        try {
            setStatus("Scanning for BatteryMonitor setup networks...");
            boolean started = wifiManager.startScan();
            if (!started) {
                updateMonitorScanResults();
                setStatus("Android throttled the active Wi-Fi scan; showing cached results. Use manual SSID or Wi-Fi Settings if needed.");
            }
        } catch (SecurityException ex) {
            setStatus("Android blocked Wi-Fi scanning: " + ex.getMessage());
        }
    }

    private void updateMonitorScanResults() {
        if (!hasWifiPermission()) return;
        try {
            List<ScanResult> results = wifiManager.getScanResults();
            Set<String> unique = new HashSet<>();
            for (ScanResult result : results) {
                String ssid = result.SSID;
                if (ssid != null && ssid.startsWith(MONITOR_PREFIX)) unique.add(ssid);
            }
            List<String> sorted = new ArrayList<>(unique);
            Collections.sort(sorted);
            monitorSsids.clear();
            monitorSsids.addAll(sorted);
            monitorAdapter.notifyDataSetChanged();
            setStatus(sorted.isEmpty()
                    ? "No setup networks found. If the unit has working Wi-Fi it will not expose the setup AP. Hold BOOT for 5 seconds to clear Wi-Fi, or wait for automatic fallback after a failed connection."
                    : "Found " + sorted.size() + " Battery Monitor setup network(s). Select one and tap Connect.");
        } catch (SecurityException ex) {
            setStatus("Could not read Wi-Fi scan results: " + ex.getMessage());
        }
    }

    private void connectToSelectedMonitor() {
        String ssid = manualMonitorSsid.getText().toString().trim();
        if (ssid.isEmpty() && monitorSpinner.getSelectedItem() != null) ssid = monitorSpinner.getSelectedItem().toString();
        if (ssid.isEmpty() || !ssid.startsWith(MONITOR_PREFIX)) {
            toast("Select or enter a BatteryMonitor-XXXXXX network.");
            return;
        }

        releaseMonitorNetwork();
        setStatus("Requesting connection to " + ssid + ". Android may ask you to approve the temporary Wi-Fi connection.");
        connectButton.setEnabled(false);

        WifiNetworkSpecifier specifier = new WifiNetworkSpecifier.Builder().setSsid(ssid).build();
        NetworkRequest request = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .setNetworkSpecifier(specifier)
                .build();

        final String targetSsid = ssid;
        monitorNetworkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                monitorNetwork = network;
                runOnUiThread(() -> {
                    connectButton.setEnabled(true);
                    configureButton.setEnabled(true);
                    setStatus("Connected to " + targetSsid + ". Reading device settings...");
                });
                loadDeviceAndHomeNetworks();
            }

            @Override
            public void onUnavailable() {
                runOnUiThread(() -> {
                    connectButton.setEnabled(true);
                    configureButton.setEnabled(false);
                    setStatus("Android could not connect to " + targetSsid + ". Make sure the monitor is in setup mode and try again.");
                });
            }

            @Override
            public void onLost(Network network) {
                if (monitorNetwork == network) monitorNetwork = null;
                runOnUiThread(() -> {
                    connectButton.setEnabled(true);
                    configureButton.setEnabled(false);
                    setStatus("The setup network disconnected. If configuration was just submitted, this is expected while the monitor joins your home Wi-Fi.");
                });
            }
        };
        try {
            connectivityManager.requestNetwork(request, monitorNetworkCallback);
        } catch (SecurityException ex) {
            connectButton.setEnabled(true);
            configureButton.setEnabled(false);
            setStatus("Android blocked the Wi-Fi connection request: " + ex.getMessage());
        }
    }

    private void loadDeviceAndHomeNetworks() {
        io.execute(() -> {
            try {
                JSONObject status = new JSONObject(httpGet(DEVICE_BASE_URL + "/api/status"));
                JSONObject scan = new JSONObject(httpGet(DEVICE_BASE_URL + "/api/wifi/scan"));
                List<WifiChoice> choices = parseWifiChoices(scan);
                runOnUiThread(() -> {
                    deviceName.setText(status.optString("name", "Battery Monitor"));
                    String type = status.optString("batteryType", "lead_acid");
                    batteryType.setSelection("lifepo4_4s".equals(type) ? 1 : 0);
                    lowVoltage.setText(String.format(Locale.US, "%.2f", status.optDouble("lowVoltage", 12.20)));
                    criticalVoltage.setText(String.format(Locale.US, "%.2f", status.optDouble("criticalVoltage", 11.90)));
                    sampleInterval.setText(String.valueOf(status.optInt("sampleIntervalSec", 10)));
                    populateHomeChoices(choices);
                    setStatus("Connected to " + status.optString("deviceId", "monitor") + ". Select your home Wi-Fi and tap Configure Device.");
                });
            } catch (Exception ex) {
                runOnUiThread(() -> setStatus("Connected to the setup Wi-Fi, but could not reach the ESP32 at 192.168.4.1: " + ex.getMessage()));
            }
        });
    }

    private void scanHomeNetworks() {
        if (monitorNetwork == null) {
            toast("Connect to a Battery Monitor setup network first.");
            return;
        }
        setStatus("Asking the ESP32 to scan nearby Wi-Fi networks...");
        io.execute(() -> {
            try {
                JSONObject scan = new JSONObject(httpGet(DEVICE_BASE_URL + "/api/wifi/scan"));
                List<WifiChoice> choices = parseWifiChoices(scan);
                runOnUiThread(() -> {
                    populateHomeChoices(choices);
                    setStatus("ESP32 Wi-Fi scan complete. Choose the home network and enter its password.");
                });
            } catch (Exception ex) {
                runOnUiThread(() -> setStatus("ESP32 Wi-Fi scan failed: " + ex.getMessage()));
            }
        });
    }

    private List<WifiChoice> parseWifiChoices(JSONObject scan) throws Exception {
        JSONArray networks = scan.getJSONArray("networks");
        Map<String, WifiChoice> best = new LinkedHashMap<>();
        for (int i = 0; i < networks.length(); i++) {
            JSONObject n = networks.getJSONObject(i);
            String ssid = n.optString("ssid", "").trim();
            if (ssid.isEmpty()) continue;
            int rssi = n.optInt("rssi", -100);
            boolean secure = n.optBoolean("secure", true);
            WifiChoice old = best.get(ssid);
            if (old == null || rssi > old.rssi) best.put(ssid, new WifiChoice(ssid, rssi, secure));
        }
        List<WifiChoice> result = new ArrayList<>(best.values());
        result.sort(Comparator.comparingInt((WifiChoice w) -> w.rssi).reversed());
        return result;
    }

    private void populateHomeChoices(List<WifiChoice> choices) {
        homeSsids.clear();
        for (WifiChoice choice : choices) homeSsids.add(choice.ssid);
        homeAdapter.notifyDataSetChanged();
        if (!homeSsids.isEmpty()) {
            homeWifiSpinner.setSelection(0);
            homeSsid.setText(homeSsids.get(0));
        }
    }

    private void configureDevice() {
        if (monitorNetwork == null) {
            toast("Connect to the monitor setup network first.");
            return;
        }

        String ssid = homeSsid.getText().toString().trim();
        String pass = wifiPassword.getText().toString();
        String name = deviceName.getText().toString().trim();
        String type = batteryType.getSelectedItemPosition() == 1 ? "lifepo4_4s" : "lead_acid";
        String low = lowVoltage.getText().toString().trim();
        String crit = criticalVoltage.getText().toString().trim();
        String sample = sampleInterval.getText().toString().trim();

        if (ssid.isEmpty() || name.isEmpty()) {
            toast("Home Wi-Fi SSID and device name are required.");
            return;
        }
        try {
            double lowV = Double.parseDouble(low);
            double critV = Double.parseDouble(crit);
            int sampleSec = Integer.parseInt(sample);
            if (lowV <= critV || critV < 6 || lowV > 20 || sampleSec < 1 || sampleSec > 3600) throw new IllegalArgumentException();
        } catch (Exception ex) {
            toast("Check the voltage thresholds and sample interval.");
            return;
        }

        configureButton.setEnabled(false);
        setStatus("Saving device settings and Wi-Fi credentials...");
        io.execute(() -> {
            try {
                Map<String, String> config = new LinkedHashMap<>();
                config.put("name", name);
                config.put("batteryType", type);
                config.put("lowVoltage", low);
                config.put("criticalVoltage", crit);
                config.put("sampleIntervalSec", sample);
                postForm(DEVICE_BASE_URL + "/api/config", config);

                Map<String, String> wifi = new LinkedHashMap<>();
                wifi.put("ssid", ssid);
                wifi.put("password", pass);
                postForm(DEVICE_BASE_URL + "/api/wifi", wifi);

                runOnUiThread(() -> {
                    setStatus("Configuration saved. The ESP32 is now trying " + ssid + ". If it cannot connect, its BatteryMonitor setup AP will remain/return and it will retry the saved Wi-Fi every 10 minutes. Hold BOOT for 5 seconds at any time to clear Wi-Fi and force setup mode.");
                    toast("Battery Monitor configured");
                    mainHandler.postDelayed(this::releaseMonitorNetwork, 1500);
                });
            } catch (Exception ex) {
                runOnUiThread(() -> {
                    configureButton.setEnabled(true);
                    setStatus("Configuration failed: " + ex.getMessage());
                });
            }
        });
    }

    private String httpGet(String urlString) throws Exception {
        HttpURLConnection connection = openConnection(urlString);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(8000);
        connection.setRequestMethod("GET");
        return readResponse(connection);
    }

    private String postForm(String urlString, Map<String, String> values) throws Exception {
        StringBuilder body = new StringBuilder();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8.name()));
            body.append('=');
            body.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8.name()));
        }
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection connection = openConnection(urlString);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(8000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        connection.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(bytes);
        }
        return readResponse(connection);
    }

    private HttpURLConnection openConnection(String urlString) throws Exception {
        URL url = new URL(urlString);
        Network network = monitorNetwork;
        if (network == null) throw new IllegalStateException("Not connected to the monitor setup network.");
        return (HttpURLConnection) network.openConnection(url);
    }

    private String readResponse(HttpURLConnection connection) throws Exception {
        int code = connection.getResponseCode();
        InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) text.append(line);
            }
        }
        connection.disconnect();
        if (code < 200 || code >= 300) throw new IllegalStateException("ESP32 returned HTTP " + code + ": " + text);
        return text.toString();
    }

    private void releaseMonitorNetwork() {
        monitorNetwork = null;
        if (monitorNetworkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(monitorNetworkCallback); } catch (Exception ignored) { }
            monitorNetworkCallback = null;
        }
        configureButton.setEnabled(false);
        connectButton.setEnabled(true);
    }

    private void setStatus(String text) {
        statusText.setText(text);
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
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

    private LinearLayout horizontalRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams weighted() {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        releaseMonitorNetwork();
        if (scanReceiverRegistered) {
            try { unregisterReceiver(wifiScanReceiver); } catch (Exception ignored) { }
        }
        io.shutdownNow();
        super.onDestroy();
    }

    private static final class WifiChoice {
        final String ssid;
        final int rssi;
        final boolean secure;
        WifiChoice(String ssid, int rssi, boolean secure) {
            this.ssid = ssid;
            this.rssi = rssi;
            this.secure = secure;
        }
    }

    private interface PositionConsumer { void accept(int position); }

    private static final class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
        private final PositionConsumer consumer;
        private SimpleItemSelectedListener(PositionConsumer consumer) { this.consumer = consumer; }
        @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) { consumer.accept(position); }
        @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
    }
}

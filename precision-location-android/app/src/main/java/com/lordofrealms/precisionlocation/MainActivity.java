package com.lordofrealms.precisionlocation;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Locale;

public final class MainActivity extends Activity implements PrecisionLocationService.UiListener {
    private static final int PERMISSION_REQUEST = 1001;

    private TextView stateView;
    private TextView accuracyView;
    private TextView modeView;
    private TextView detailView;
    private TextView engineView;
    private Button startButton;
    private Button settingsButton;
    private boolean running;
    private boolean diagnosticsVisible;
    private boolean bound;
    private PppSolution lastSolution;
    private PrecisionLocationService service;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            PrecisionLocationService.LocalBinder local = (PrecisionLocationService.LocalBinder)binder;
            service = local.getService();
            bound = true;
            service.setUiListener(MainActivity.this);
            running = service.isRunning();
            if (running) {
                startButton.setText("Stop");
                settingsButton.setEnabled(false);
                PppSolution solution = service.getLastSolution();
                if (solution != null) {
                    lastSolution = solution;
                    renderLastSolution();
                } else {
                    renderStartingState();
                }
            } else {
                refreshSetupState();
            }
        }

        @Override public void onServiceDisconnected(ComponentName name) {
            bound = false;
            service = null;
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        engineView.setText(AutoPppEngine.nativeEngineInfo());

        // Long-press while running only reveals engineering diagnostics. HAS
        // credentials now have a visible Settings button and are not hidden.
        detailView.setOnLongClickListener(v -> {
            if (running) {
                diagnosticsVisible = !diagnosticsVisible;
                renderLastSolution();
                return true;
            }
            return false;
        });
        refreshSetupState();
    }

    @Override protected void onStart() {
        super.onStart();
        Intent intent = new Intent(this, PrecisionLocationService.class);
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    @Override protected void onStop() {
        if (bound) {
            service.setUiListener(null);
            unbindService(serviceConnection);
            bound = false;
            service = null;
        }
        // Deliberately do NOT stop GNSS here. Screen-off/backgrounding is one
        // of the main use cases for the foreground service.
        super.onStop();
    }

    private void buildUi() {
        int pad = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(Color.rgb(11, 15, 20));

        TextView title = text("Precision Location", 28, Color.WHITE, true);
        root.addView(title, matchWrap());
        TextView subtitle = text("High-accuracy positioning that configures itself", 14,
                Color.rgb(160, 172, 184), false);
        subtitle.setPadding(0, dp(5), 0, dp(24));
        root.addView(subtitle, matchWrap());

        stateView = text("OFF", 18, Color.rgb(160, 172, 184), true);
        stateView.setGravity(Gravity.CENTER);
        root.addView(stateView, matchWrap());

        accuracyView = text("—", 64, Color.WHITE, true);
        accuracyView.setGravity(Gravity.CENTER);
        root.addView(accuracyView, matchWrap());
        TextView accuracyLabel = text("estimated horizontal accuracy", 13,
                Color.rgb(160, 172, 184), false);
        accuracyLabel.setGravity(Gravity.CENTER);
        root.addView(accuracyLabel, matchWrap());

        modeView = text("AUTOMATIC", 17, Color.rgb(143, 209, 79), true);
        modeView.setGravity(Gravity.CENTER);
        modeView.setPadding(0, dp(24), 0, dp(6));
        root.addView(modeView, matchWrap());

        detailView = text("Tap Start.", 15, Color.rgb(205, 213, 221), false);
        detailView.setGravity(Gravity.CENTER);
        detailView.setPadding(0, dp(8), 0, dp(24));
        root.addView(detailView, matchWrap());

        startButton = new Button(this);
        startButton.setText("Start");
        startButton.setTextSize(18);
        startButton.setOnClickListener(v -> toggle());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(58));
        root.addView(startButton, buttonParams);

        settingsButton = new Button(this);
        settingsButton.setText("HAS Settings");
        settingsButton.setTextSize(14);
        settingsButton.setOnClickListener(v -> showHasSetupDialog());
        LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(50));
        settingsParams.topMargin = dp(10);
        root.addView(settingsButton, settingsParams);

        engineView = text("", 11, Color.rgb(105, 119, 132), false);
        engineView.setGravity(Gravity.CENTER);
        engineView.setPadding(0, dp(24), 0, 0);
        engineView.setVisibility(View.GONE);
        root.addView(engineView, matchWrap());

        setContentView(root);
    }

    private void refreshSetupState() {
        running = false;
        diagnosticsVisible = false;
        engineView.setVisibility(View.GONE);
        settingsButton.setEnabled(true);
        modeView.setText("AUTOMATIC");
        accuracyView.setText("—");
        if (HasAccessConfig.load(this).isConfigured()) {
            stateView.setText("OFF");
            stateView.setTextColor(Color.rgb(160, 172, 184));
            detailView.setText("HAS configured. Tap Start.");
            startButton.setText("Start");
        } else {
            stateView.setText("GNSS TEST READY");
            stateView.setTextColor(Color.rgb(245, 190, 78));
            detailView.setText("HAS is not configured yet. Test GNSS now or add credentials in HAS Settings.");
            startButton.setText("Test GNSS");
        }
    }

    private void toggle() {
        boolean active = service != null ? service.isRunning() : running;
        if (active) {
            Intent stop = new Intent(this, PrecisionLocationService.class);
            stop.setAction(PrecisionLocationService.ACTION_STOP);
            startService(stop);
            refreshSetupState();
            return;
        }
        requestPermissionsAndStart();
    }

    private void requestPermissionsAndStart() {
        ArrayList<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), PERMISSION_REQUEST);
            return;
        }
        startPrecisionSession();
    }

    private void startPrecisionSession() {
        running = true;
        diagnosticsVisible = false;
        startButton.setText("Stop");
        settingsButton.setEnabled(false);
        renderStartingState();

        Intent start = new Intent(this, PrecisionLocationService.class);
        start.setAction(PrecisionLocationService.ACTION_START);
        startForegroundService(start);
    }

    private void renderStartingState() {
        if (HasAccessConfig.load(this).isConfigured()) {
            stateView.setText("STARTING");
            detailView.setText("Getting a high-accuracy position…");
        } else {
            stateView.setText("PRECHECK");
            detailView.setText("Testing the phone's raw GNSS… this continues with the screen off.");
        }
        stateView.setTextColor(Color.rgb(245, 190, 78));
        accuracyView.setText("—");
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PERMISSION_REQUEST) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED) {
            // Notification permission is useful but not required for the location
            // foreground service to function; Android still exposes active FGS state.
            startPrecisionSession();
        } else {
            onServiceError("Precise location permission is required");
        }
    }

    private void showHasSetupDialog() {
        if (running) return;
        HasAccessConfig existing = HasAccessConfig.load(this);
        int pad = dp(14);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(pad, dp(4), pad, 0);

        EditText url = new EditText(this);
        url.setHint("HTTPS caster URL including mountpoint");
        url.setSingleLine(true);
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(existing.url);
        form.addView(url, matchWrap());

        EditText username = new EditText(this);
        username.setHint("HAS username");
        username.setSingleLine(true);
        username.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        username.setText(existing.username);
        form.addView(username, matchWrap());

        EditText password = new EditText(this);
        password.setHint("HAS password");
        password.setSingleLine(true);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setText(existing.password);
        form.addView(password, matchWrap());

        TextView testStatus = text("", 13, Color.rgb(160, 172, 184), false);
        testStatus.setPadding(0, dp(8), 0, dp(4));
        form.addView(testStatus, matchWrap());

        Button testButton = new Button(this);
        testButton.setText("Test Connection");
        form.addView(testButton, matchWrap());

        final HasNtripClient[] testClient = new HasNtripClient[1];
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("HAS Settings")
                .setMessage("Add or change Galileo HAS Internet Data Distribution access here. Changes are used the next time positioning starts.")
                .setView(form)
                .setNeutralButton("Clear", null)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Save", null)
                .create();

        Runnable stopTest = () -> {
            HasNtripClient client = testClient[0];
            testClient[0] = null;
            if (client != null) client.stop();
        };

        testButton.setOnClickListener(v -> {
            stopTest.run();
            HasAccessConfig candidate = new HasAccessConfig(
                    url.getText().toString(), username.getText().toString(), password.getText().toString());
            if (!candidate.isConfigured()) {
                testStatus.setText("Enter the HTTPS caster URL, username, and password first.");
                return;
            }
            testStatus.setText("Connecting…");
            HasNtripClient client = new HasNtripClient(candidate, new HasNtripClient.Listener() {
                @Override public void onCorrectionBytes(byte[] data, int length) {
                    runOnUiThread(() -> testStatus.setText("Connected — correction data received."));
                    stopTest.run();
                }
                @Override public void onStatus(String status) {
                    runOnUiThread(() -> testStatus.setText(status));
                }
                @Override public void onFatalError(String message) {
                    runOnUiThread(() -> testStatus.setText(message));
                }
            });
            testClient[0] = client;
            client.start();
        });

        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                HasAccessConfig value = new HasAccessConfig(
                        url.getText().toString(), username.getText().toString(), password.getText().toString());
                if (!value.isConfigured()) {
                    url.setError("Use the full HTTPS HAS caster URL and enter the issued login");
                    return;
                }
                stopTest.run();
                value.save(this);
                dialog.dismiss();
                refreshSetupState();
            });
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> {
                stopTest.run();
                HasAccessConfig.clear(this);
                dialog.dismiss();
                refreshSetupState();
            });
        });
        dialog.setOnDismissListener(ignored -> stopTest.run());
        dialog.show();
    }

    @Override public void onServiceSolution(PppSolution solution) {
        runOnUiThread(() -> {
            running = solution.state != PppSolution.State.OFF;
            settingsButton.setEnabled(!running);
            startButton.setText(running ? "Stop" : (HasAccessConfig.load(this).isConfigured() ? "Start" : "Test GNSS"));
            lastSolution = solution;
            if (!running) refreshSetupState();
            else renderLastSolution();
        });
    }

    @Override public void onServiceError(String message) {
        runOnUiThread(() -> {
            stateView.setText("ERROR");
            stateView.setTextColor(Color.rgb(255, 126, 108));
            detailView.setText(message);
        });
    }

    private void renderLastSolution() {
        PppSolution solution = lastSolution;
        if (solution == null) return;

        stateView.setText(solution.state.name().replace('_', ' '));
        modeView.setText(diagnosticsVisible ? solution.mode : "AUTOMATIC");
        engineView.setVisibility(diagnosticsVisible ? View.VISIBLE : View.GONE);
        detailView.setText(diagnosticsVisible ? solution.detail : friendlyDetail(solution.state));

        if (Double.isFinite(solution.horizontalAccuracyMeters)) {
            if (solution.horizontalAccuracyMeters < 1.0) {
                accuracyView.setText(String.format(Locale.US, "%.0f cm", solution.horizontalAccuracyMeters * 100.0));
            } else {
                accuracyView.setText(String.format(Locale.US, "%.1f m", solution.horizontalAccuracyMeters));
            }
        } else {
            accuracyView.setText("—");
        }

        int color;
        switch (solution.state) {
            case READY: color = Color.rgb(143, 209, 79); break;
            case PRECHECK:
            case CONVERGING:
            case STARTING: color = Color.rgb(245, 190, 78); break;
            case DEGRADED:
            case ERROR: color = Color.rgb(255, 126, 108); break;
            default: color = Color.rgb(205, 213, 221); break;
        }
        stateView.setTextColor(color);
    }

    private String friendlyDetail(PppSolution.State state) {
        switch (state) {
            case PRECHECK:
                return "Testing phone GNSS. This continues with the screen off.";
            case STARTING:
                return "Acquiring satellites and corrections…";
            case CONVERGING:
                return "Improving accuracy. Keep a clear view of the sky.";
            case READY:
                return "High-accuracy position is ready.";
            case DEGRADED:
                return "Accuracy is temporarily degraded. Keep a clear view of the sky.";
            case ERROR:
                return "Positioning needs attention. Long-press here for diagnostics.";
            case OFF:
            default:
                return "Tap Start.";
        }
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(sp);
        v.setTextColor(color);
        if (bold) v.setTypeface(v.getTypeface(), android.graphics.Typeface.BOLD);
        return v;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}

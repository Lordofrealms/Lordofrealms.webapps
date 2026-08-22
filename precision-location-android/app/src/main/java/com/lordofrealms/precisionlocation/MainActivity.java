package com.lordofrealms.precisionlocation;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
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
        detailView.setOnLongClickListener(v -> {
            if (!running) return false;
            diagnosticsVisible = !diagnosticsVisible;
            renderLastSolution();
            return true;
        });
        refreshSetupState();
    }

    @Override protected void onStart() {
        super.onStart();
        bindService(new Intent(this, PrecisionLocationService.class),
                serviceConnection, Context.BIND_AUTO_CREATE);
    }

    @Override protected void onResume() {
        super.onResume();
        if (!running) refreshSetupState();
    }

    @Override protected void onStop() {
        if (bound) {
            service.setUiListener(null);
            unbindService(serviceConnection);
            bound = false;
            service = null;
        }
        // Active GNSS belongs to the foreground service and continues through
        // screen-off/backgrounding until Stop or the app task is closed.
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
        root.addView(startButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(58)));

        settingsButton = new Button(this);
        settingsButton.setText("Settings");
        settingsButton.setTextSize(14);
        settingsButton.setOnClickListener(v ->
                startActivity(new Intent(this, AppSettingsActivity.class)));
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
        startButton.setText("Start");
        modeView.setText("AUTOMATIC");
        accuracyView.setText("—");
        stateView.setText("READY TO START");
        stateView.setTextColor(Color.rgb(160, 172, 184));

        String positioning = HasAccessConfig.load(this).isConfigured()
                ? "HAS configured; Start will prefer HAS PPP."
                : "No-signup positioning ready; HAS is optional in Settings.";
        String phoneOutput;
        if (!PhoneLocationConfig.isEnabled(this)) {
            phoneOutput = "";
        } else if (PhoneLocationConfig.isAuthorized(this)) {
            phoneOutput = " Phone location replacement is enabled.";
        } else {
            phoneOutput = " Phone location replacement still needs one-time Android authorization.";
        }
        detailView.setText(positioning + phoneOutput);
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
        stateView.setText("STARTING");
        if (HasAccessConfig.load(this).isConfigured()) {
            detailView.setText("Starting GNSS and HAS corrections…");
        } else {
            detailView.setText("Starting no-signup precision GNSS… this continues with the screen off.");
        }
        stateView.setTextColor(Color.rgb(245, 190, 78));
        accuracyView.setText("—");
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PERMISSION_REQUEST) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED) {
            startPrecisionSession();
        } else {
            onServiceError("Precise location permission is required");
        }
    }

    @Override public void onServiceSolution(PppSolution solution) {
        runOnUiThread(() -> {
            running = solution.state != PppSolution.State.OFF;
            settingsButton.setEnabled(!running);
            startButton.setText(running ? "Stop" : "Start");
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
                accuracyView.setText(String.format(Locale.US, "%.0f cm",
                        solution.horizontalAccuracyMeters * 100.0));
            } else {
                accuracyView.setText(String.format(Locale.US, "%.1f m",
                        solution.horizontalAccuracyMeters));
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
                return "No-signup GNSS is stabilizing. This continues with the screen off.";
            case STARTING:
                return "Acquiring satellites and corrections…";
            case CONVERGING:
                return "Improving accuracy. Keep a clear view of the sky.";
            case READY:
                return "Precision position is ready.";
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
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}

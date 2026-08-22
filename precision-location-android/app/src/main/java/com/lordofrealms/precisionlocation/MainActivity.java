package com.lordofrealms.precisionlocation;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

public final class MainActivity extends Activity implements PositionEngine.Listener, GnssCollector.Listener {
    private static final int LOCATION_REQUEST = 1001;

    private TextView stateView;
    private TextView accuracyView;
    private TextView modeView;
    private TextView detailView;
    private TextView engineView;
    private Button startButton;
    private boolean running;
    private AutoPppEngine engine;
    private GnssCollector collector;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        engine = new AutoPppEngine(this, this);
        collector = new GnssCollector(this, engine, this);
        engineView.setText(AutoPppEngine.nativeEngineInfo());
        engineView.setOnLongClickListener(v -> {
            if (!running) showHasSetupDialog();
            return true;
        });
        refreshSetupState();
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

        modeView = text("AUTO", 18, Color.rgb(143, 209, 79), true);
        modeView.setGravity(Gravity.CENTER);
        modeView.setPadding(0, dp(24), 0, dp(6));
        root.addView(modeView, matchWrap());

        detailView = text("Tap Start. The app will choose the best positioning mode the phone supports.",
                14, Color.rgb(205, 213, 221), false);
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

        engineView = text("", 11, Color.rgb(105, 119, 132), false);
        engineView.setGravity(Gravity.CENTER);
        engineView.setPadding(0, dp(24), 0, 0);
        root.addView(engineView, matchWrap());

        setContentView(root);
    }

    private void refreshSetupState() {
        if (HasAccessConfig.load(this).isConfigured()) {
            stateView.setText("OFF");
            stateView.setTextColor(Color.rgb(160, 172, 184));
            detailView.setText("Tap Start. High-accuracy corrections and GNSS mode are automatic.");
            startButton.setText("Start");
        } else {
            stateView.setText("SETUP REQUIRED");
            stateView.setTextColor(Color.rgb(245, 190, 78));
            detailView.setText("Galileo HAS access is a one-time setup. After that, just tap Start.");
            startButton.setText("Set up HAS");
        }
    }

    private void toggle() {
        if (running) {
            collector.stop();
            running = false;
            startButton.setText("Start");
            return;
        }
        if (!HasAccessConfig.load(this).isConfigured()) {
            showHasSetupDialog();
            return;
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION_REQUEST);
            return;
        }
        startCollector();
    }

    private void showHasSetupDialog() {
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

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("One-time HAS access")
                .setMessage("Enter the Galileo HAS Internet Data Distribution access issued by the Galileo Service Centre.")
                .setView(form)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Save", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            HasAccessConfig value = new HasAccessConfig(
                    url.getText().toString(), username.getText().toString(), password.getText().toString());
            if (!value.isConfigured()) {
                url.setError("Use the full HTTPS HAS caster URL");
                return;
            }
            value.save(this);
            dialog.dismiss();
            refreshSetupState();
        }));
        dialog.show();
    }

    private void startCollector() {
        running = true;
        startButton.setText("Stop");
        collector.start();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCollector();
        } else {
            onError("Precise location permission is required");
        }
    }

    @Override public void onSolution(PppSolution solution) {
        runOnUiThread(() -> {
            stateView.setText(solution.state.name().replace('_', ' '));
            modeView.setText(solution.mode);
            detailView.setText(solution.detail);
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
                case CONVERGING: color = Color.rgb(245, 190, 78); break;
                case DEGRADED:
                case ERROR: color = Color.rgb(255, 126, 108); break;
                default: color = Color.rgb(205, 213, 221); break;
            }
            stateView.setTextColor(color);
        });
    }

    @Override public void onInventory(SignalInventory inventory) { }

    @Override public void onError(String message) {
        runOnUiThread(() -> {
            stateView.setText("ERROR");
            stateView.setTextColor(Color.rgb(255, 126, 108));
            detailView.setText(message);
            if (running) {
                running = false;
                startButton.setText("Start");
            }
        });
    }

    @Override protected void onStop() {
        super.onStop();
        if (running) {
            collector.stop();
            running = false;
            startButton.setText("Start");
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

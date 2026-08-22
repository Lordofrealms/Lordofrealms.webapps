package com.lordofrealms.precisionlocation;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class AppSettingsActivity extends Activity {
    private CheckBox phoneLocationCheck;
    private TextView phoneLocationStatus;
    private EditText hasUrl;
    private EditText hasUsername;
    private EditText hasPassword;
    private TextView hasStatus;
    private HasNtripClient testClient;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
    }

    @Override protected void onResume() {
        super.onResume();
        updatePhoneLocationStatus();
    }

    @Override protected void onDestroy() {
        stopTestClient();
        super.onDestroy();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(18), dp(20), dp(24));
        root.setBackgroundColor(Color.rgb(11, 15, 20));
        scroll.addView(root);

        TextView title = text("Settings", 27, Color.WHITE, true);
        root.addView(title, matchWrap());

        TextView phoneTitle = text("Use as phone location", 19, Color.WHITE, true);
        phoneTitle.setPadding(0, dp(26), 0, dp(4));
        root.addView(phoneTitle, matchWrap());

        TextView phoneHelp = text(
                "When enabled, Precision Location publishes its corrected position and estimated accuracy to Android's fused location stream for other apps. Android requires a one-time Developer options authorization.",
                14, Color.rgb(185, 196, 207), false);
        root.addView(phoneHelp, matchWrap());

        phoneLocationCheck = new CheckBox(this);
        phoneLocationCheck.setText("Replace phone location while Precision Location is running");
        phoneLocationCheck.setTextColor(Color.WHITE);
        phoneLocationCheck.setChecked(PhoneLocationConfig.isEnabled(this));
        phoneLocationCheck.setPadding(0, dp(10), 0, dp(4));
        phoneLocationCheck.setOnCheckedChangeListener((button, checked) -> {
            PhoneLocationConfig.setEnabled(this, checked);
            updatePhoneLocationStatus();
        });
        root.addView(phoneLocationCheck, matchWrap());

        phoneLocationStatus = text("", 14, Color.rgb(245, 190, 78), false);
        root.addView(phoneLocationStatus, matchWrap());

        Button developerButton = new Button(this);
        developerButton.setText("Open Developer Options");
        developerButton.setOnClickListener(v -> openDeveloperOptions());
        LinearLayout.LayoutParams developerParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        developerParams.topMargin = dp(8);
        root.addView(developerButton, developerParams);

        TextView devInstruction = text(
                "One time: Developer options → Select mock location app → Precision Location. Other apps can detect that Android marks this as a mock location.",
                12, Color.rgb(130, 145, 158), false);
        devInstruction.setPadding(0, dp(5), 0, 0);
        root.addView(devInstruction, matchWrap());

        TextView hasTitle = text("Galileo HAS", 19, Color.WHITE, true);
        hasTitle.setPadding(0, dp(30), 0, dp(4));
        root.addView(hasTitle, matchWrap());

        TextView hasHelp = text(
                "HAS is optional. Without it the app uses its best no-signup GNSS mode. If HAS access is configured, Start automatically prefers HAS PPP.",
                14, Color.rgb(185, 196, 207), false);
        root.addView(hasHelp, matchWrap());

        HasAccessConfig existing = HasAccessConfig.load(this);

        hasUrl = new EditText(this);
        hasUrl.setHint("HTTPS caster URL including mountpoint");
        hasUrl.setTextColor(Color.WHITE);
        hasUrl.setHintTextColor(Color.rgb(120, 135, 148));
        hasUrl.setSingleLine(true);
        hasUrl.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        hasUrl.setText(existing.url);
        root.addView(hasUrl, matchWrap());

        hasUsername = new EditText(this);
        hasUsername.setHint("HAS username");
        hasUsername.setTextColor(Color.WHITE);
        hasUsername.setHintTextColor(Color.rgb(120, 135, 148));
        hasUsername.setSingleLine(true);
        hasUsername.setText(existing.username);
        root.addView(hasUsername, matchWrap());

        hasPassword = new EditText(this);
        hasPassword.setHint("HAS password");
        hasPassword.setTextColor(Color.WHITE);
        hasPassword.setHintTextColor(Color.rgb(120, 135, 148));
        hasPassword.setSingleLine(true);
        hasPassword.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        hasPassword.setText(existing.password);
        root.addView(hasPassword, matchWrap());

        hasStatus = text(existing.isConfigured() ? "HAS credentials saved." : "HAS not configured.",
                13, Color.rgb(160, 172, 184), false);
        hasStatus.setPadding(0, dp(8), 0, dp(6));
        root.addView(hasStatus, matchWrap());

        Button testButton = new Button(this);
        testButton.setText("Test HAS Connection");
        testButton.setOnClickListener(v -> testHasConnection());
        root.addView(testButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));

        Button saveButton = new Button(this);
        saveButton.setText("Save HAS Settings");
        saveButton.setOnClickListener(v -> saveHasSettings());
        LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        saveParams.topMargin = dp(8);
        root.addView(saveButton, saveParams);

        Button clearButton = new Button(this);
        clearButton.setText("Clear HAS Credentials");
        clearButton.setOnClickListener(v -> confirmClearHas());
        LinearLayout.LayoutParams clearParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        clearParams.topMargin = dp(8);
        root.addView(clearButton, clearParams);

        TextView legalTitle = text("Legal", 19, Color.WHITE, true);
        legalTitle.setPadding(0, dp(30), 0, dp(8));
        root.addView(legalTitle, matchWrap());

        TextView legalHelp = text(
                "Terms must be accepted again after every app update. You can review the current Terms and MIT License here at any time.",
                14, Color.rgb(185, 196, 207), false);
        root.addView(legalHelp, matchWrap());

        Button termsButton = new Button(this);
        termsButton.setText("Terms of Use & Safety");
        termsButton.setOnClickListener(v ->
                startActivity(LegalNoticeActivity.termsIntent(this, false)));
        LinearLayout.LayoutParams termsParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        termsParams.topMargin = dp(8);
        root.addView(termsButton, termsParams);

        Button licenseButton = new Button(this);
        licenseButton.setText("MIT License");
        licenseButton.setOnClickListener(v ->
                startActivity(LegalNoticeActivity.licenseIntent(this)));
        LinearLayout.LayoutParams licenseParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        licenseParams.topMargin = dp(8);
        root.addView(licenseButton, licenseParams);

        Button doneButton = new Button(this);
        doneButton.setText("Done");
        doneButton.setOnClickListener(v -> finish());
        LinearLayout.LayoutParams doneParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        doneParams.topMargin = dp(24);
        root.addView(doneButton, doneParams);

        setContentView(scroll);
        updatePhoneLocationStatus();
    }

    private void updatePhoneLocationStatus() {
        if (phoneLocationStatus == null || phoneLocationCheck == null) return;
        boolean enabled = phoneLocationCheck.isChecked();
        boolean authorized = PhoneLocationConfig.isAuthorized(this);
        if (!enabled) {
            phoneLocationStatus.setText("Off — other apps keep using normal Android location.");
            phoneLocationStatus.setTextColor(Color.rgb(160, 172, 184));
        } else if (authorized) {
            phoneLocationStatus.setText("Ready — Android has authorized Precision Location as the mock location app.");
            phoneLocationStatus.setTextColor(Color.rgb(143, 209, 79));
        } else {
            phoneLocationStatus.setText("Needs one-time Android authorization below before it can replace location for other apps.");
            phoneLocationStatus.setTextColor(Color.rgb(245, 190, 78));
        }
    }

    private void openDeveloperOptions() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
        } catch (RuntimeException ex) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    private HasAccessConfig enteredHasConfig() {
        return new HasAccessConfig(
                hasUrl.getText().toString(),
                hasUsername.getText().toString(),
                hasPassword.getText().toString());
    }

    private boolean allHasFieldsEmpty() {
        return hasUrl.getText().toString().trim().isEmpty()
                && hasUsername.getText().toString().trim().isEmpty()
                && hasPassword.getText().toString().isEmpty();
    }

    private void saveHasSettings() {
        stopTestClient();
        if (allHasFieldsEmpty()) {
            HasAccessConfig.clear(this);
            hasStatus.setText("HAS not configured. No-signup mode will be used.");
            return;
        }
        HasAccessConfig value = enteredHasConfig();
        if (!value.isConfigured()) {
            hasStatus.setText("Enter the HTTPS caster URL, username, and password, or clear all three fields.");
            return;
        }
        value.save(this);
        hasStatus.setText("HAS credentials saved. They will be used on the next Start.");
    }

    private void testHasConnection() {
        stopTestClient();
        HasAccessConfig candidate = enteredHasConfig();
        if (!candidate.isConfigured()) {
            hasStatus.setText("Enter the HTTPS caster URL, username, and password first.");
            return;
        }
        hasStatus.setText("Connecting…");
        testClient = new HasNtripClient(candidate, new HasNtripClient.Listener() {
            @Override public void onCorrectionBytes(byte[] data, int length) {
                runOnUiThread(() -> hasStatus.setText("Connected — correction data received."));
                stopTestClient();
            }

            @Override public void onStatus(String status) {
                runOnUiThread(() -> hasStatus.setText(status));
            }

            @Override public void onFatalError(String message) {
                runOnUiThread(() -> hasStatus.setText(message));
            }
        });
        testClient.start();
    }

    private void confirmClearHas() {
        new AlertDialog.Builder(this)
                .setTitle("Clear HAS credentials?")
                .setMessage("The app will return to no-signup positioning until new HAS access is saved.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Clear", (dialog, which) -> {
                    stopTestClient();
                    HasAccessConfig.clear(this);
                    hasUrl.setText("");
                    hasUsername.setText("");
                    hasPassword.setText("");
                    hasStatus.setText("HAS not configured. No-signup mode will be used.");
                })
                .show();
    }

    private void stopTestClient() {
        HasNtripClient client = testClient;
        testClient = null;
        if (client != null) client.stop();
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

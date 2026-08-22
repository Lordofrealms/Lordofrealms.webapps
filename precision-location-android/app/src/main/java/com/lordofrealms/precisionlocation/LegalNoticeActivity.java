package com.lordofrealms.precisionlocation;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Terms/Safety acceptance is required once for every installed app version. */
public final class LegalNoticeActivity extends Activity {
    public static final String EXTRA_MODE = "mode";
    public static final String MODE_TERMS = "terms";
    public static final String MODE_LICENSE = "license";
    public static final String EXTRA_REQUIRE_ACCEPTANCE = "requireAcceptance";

    private static final String PREFS = "precision_location_legal";
    private static final String ACCEPTED_VERSION_CODE_KEY = "accepted_app_version_code";
    private static final String ACCEPTED_TERMS_VERSION_KEY = "accepted_terms_version";
    public static final String TERMS_VERSION = "2026-08-21-v1";

    private static final String TERMS_TEXT =
            "OPEN-SOURCE LICENSE\n\n" +
            "The source code is licensed under the MIT License. The MIT License governs your rights to copy, modify, distribute, sublicense, and use the software. These Terms do not reduce rights granted by the MIT License.\n\n" +
            "EXPERIMENTAL POSITIONING TOOL\n\n" +
            "Precision Location is an experimental GNSS positioning and correction-processing tool. It is not certified surveying, aviation, navigation-safety, emergency-response, life-safety, machine-control, or other safety-critical equipment. It does not replace a licensed survey or other professionally verified positioning method where one is required.\n\n" +
            "VERIFY EVERYTHING THAT MATTERS\n\n" +
            "You are responsible for independently verifying coordinates, boundaries, elevations, routes, clearances, construction points, and other decisions before relying on the app. GNSS results can be wrong because of device limitations, multipath, obstructions, atmospheric conditions, satellite geometry, correction-service outages, bad reference data, software defects, or other causes.\n\n" +
            "ESTIMATED ACCURACY IS NOT A GUARANTEE\n\n" +
            "Displayed horizontal or vertical accuracy values are statistical estimates produced by the device or positioning engine. They are not guaranteed error bounds and actual position error can be larger. A READY state does not certify survey-grade accuracy.\n\n" +
            "CORRECTIONS AND THIRD-PARTY SERVICES\n\n" +
            "Galileo HAS and any future correction sources are third-party services whose availability, format, credentials, performance, and terms can change. The app may fall back to less-accurate positioning when corrections are unavailable.\n\n" +
            "PHONE-LOCATION OUTPUT\n\n" +
            "If you choose to publish Precision Location as Android phone location, other applications may receive the corrected position and Android may mark it as a mock location. Other applications can reject, reinterpret, or misuse that data. You are responsible for deciding where this feature is appropriate.\n\n" +
            "LOCAL DATA AND CREDENTIALS\n\n" +
            "Diagnostic logs can contain precise coordinates and GNSS measurements. HAS credentials are stored on the device for use by the app. Protect exported logs, project data, and credentials according to their sensitivity.\n\n" +
            "NO WARRANTY\n\n" +
            "The software and application are provided “AS IS,” without warranty of any kind. To the maximum extent permitted by law, the authors and contributors are not liable for claims, damages, losses, injuries, costs, or other liability arising from use of the software or application.\n\n" +
            "By accepting, you acknowledge these limitations and agree to use the application at your own risk and with independent judgment.";

    private static final String MIT_LICENSE =
            "MIT License\n\n" +
            "Copyright (c) 2026 Lordofrealms\n\n" +
            "Permission is hereby granted, free of charge, to any person obtaining a copy\n" +
            "of this software and associated documentation files (the \"Software\"), to deal\n" +
            "in the Software without restriction, including without limitation the rights\n" +
            "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n" +
            "copies of the Software, and to permit persons to whom the Software is\n" +
            "furnished to do so, subject to the following conditions:\n\n" +
            "The above copyright notice and this permission notice shall be included in all\n" +
            "copies or substantial portions of the Software.\n\n" +
            "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n" +
            "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n" +
            "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n" +
            "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n" +
            "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n" +
            "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n" +
            "SOFTWARE.";

    public static boolean isAccepted(Context context) {
        long acceptedCode = context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getLong(ACCEPTED_VERSION_CODE_KEY, -1L);
        String acceptedTerms = context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(ACCEPTED_TERMS_VERSION_KEY, "");
        return acceptedCode == currentVersionCode(context)
                && TERMS_VERSION.equals(acceptedTerms);
    }

    private static long currentVersionCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0);
            return info.getLongVersionCode();
        } catch (Exception ex) {
            return -1L;
        }
    }

    private static String currentVersionName(Context context) {
        try {
            PackageInfo info = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0);
            return info.versionName == null ? "unknown" : info.versionName;
        } catch (Exception ex) {
            return "unknown";
        }
    }

    public static Intent termsIntent(Context context, boolean requireAcceptance) {
        return new Intent(context, LegalNoticeActivity.class)
                .putExtra(EXTRA_MODE, MODE_TERMS)
                .putExtra(EXTRA_REQUIRE_ACCEPTANCE, requireAcceptance);
    }

    public static Intent licenseIntent(Context context) {
        return new Intent(context, LegalNoticeActivity.class)
                .putExtra(EXTRA_MODE, MODE_LICENSE)
                .putExtra(EXTRA_REQUIRE_ACCEPTANCE, false);
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
    }

    private void buildUi() {
        String mode = getIntent().getStringExtra(EXTRA_MODE);
        boolean license = MODE_LICENSE.equals(mode);
        boolean requireAcceptance = !license
                && getIntent().getBooleanExtra(EXTRA_REQUIRE_ACCEPTANCE, false)
                && !isAccepted(this);

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(18), dp(20), dp(28));
        root.setBackgroundColor(Color.rgb(11, 15, 20));
        scroll.addView(root);

        TextView title = text(license ? "MIT License" : "Terms of Use & Safety", 27,
                Color.WHITE, true);
        root.addView(title, matchWrap());

        if (!license) {
            TextView version = text(
                    "App v" + currentVersionName(this)
                            + " • Terms " + TERMS_VERSION
                            + " • acceptance required after every app update",
                    12, Color.rgb(130, 145, 158), false);
            version.setPadding(0, dp(4), 0, dp(18));
            root.addView(version, matchWrap());
        }

        TextView body = text(license ? MIT_LICENSE : TERMS_TEXT, 14,
                Color.rgb(205, 213, 221), false);
        body.setLineSpacing(0f, 1.15f);
        body.setTextIsSelectable(true);
        root.addView(body, matchWrap());

        if (requireAcceptance) {
            CheckBox accept = new CheckBox(this);
            accept.setText("I have read and accept these Terms of Use and Safety Notice for this app version.");
            accept.setTextColor(Color.WHITE);
            accept.setPadding(0, dp(20), 0, dp(8));
            root.addView(accept, matchWrap());

            Button continueButton = new Button(this);
            continueButton.setText("Accept & Continue");
            continueButton.setEnabled(false);
            accept.setOnCheckedChangeListener((button, checked) ->
                    continueButton.setEnabled(checked));
            continueButton.setOnClickListener(v -> {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putLong(ACCEPTED_VERSION_CODE_KEY, currentVersionCode(this))
                        .putString(ACCEPTED_TERMS_VERSION_KEY, TERMS_VERSION)
                        .apply();
                setResult(RESULT_OK);
                finish();
            });
            root.addView(continueButton, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));

            Button decline = new Button(this);
            decline.setText("Decline");
            decline.setOnClickListener(v -> finish());
            LinearLayout.LayoutParams declineParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
            declineParams.topMargin = dp(8);
            root.addView(decline, declineParams);
        } else {
            Button done = new Button(this);
            done.setText("Done");
            done.setOnClickListener(v -> finish());
            LinearLayout.LayoutParams doneParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
            doneParams.topMargin = dp(24);
            root.addView(done, doneParams);
        }

        setContentView(scroll);
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setGravity(Gravity.START);
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

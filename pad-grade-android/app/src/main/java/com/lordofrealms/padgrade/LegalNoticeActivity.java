package com.lordofrealms.padgrade;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Pad Grade Terms/Safety + MIT license gate.
 * Acceptance is tied to Android versionCode, so every installed app update
 * requires a fresh acceptance even when the legal wording itself is unchanged.
 */
public final class LegalNoticeActivity extends Activity {
    private static final String PREFS = "pad_grade_legal";
    private static final String ACCEPTED_VERSION_CODE = "accepted_version_code";
    public static final String TERMS_VERSION = "2026-08-21-v2";

    private static final String TERMS_TEXT =
            "PAD GRADE MAPPER — TERMS OF USE & SAFETY NOTICE\n\n" +
            "Terms version: " + TERMS_VERSION + "\n\n" +
            "OPEN-SOURCE LICENSE\n\n" +
            "The source code is licensed under the MIT License. The MIT License governs rights to copy, modify, distribute, sublicense, and use the software. These Terms do not reduce rights granted by the MIT License.\n\n" +
            "EXPERIMENTAL PLANNING TOOL\n\n" +
            "Pad Grade Mapper is an experimental layout, grade-recording, GPS-guidance, and earthwork-planning aid. It is not certified surveying, engineering, excavation-control, machine-control, or safety equipment. It does not replace a licensed survey, engineered grading plan, compaction specification, drainage design, utility locate, or other professional service where one is required.\n\n" +
            "Consumer-device GPS may be inaccurate, delayed, unavailable, or affected by device hardware, satellite geometry, sky view, multipath, correction availability, browser/app behavior, or other conditions. Rod readings, reference elevations, dimensions, grid locations, and other user inputs may also be incorrect.\n\n" +
            "USER RESPONSIBILITY\n\n" +
            "You are responsible for independently verifying measurements, benchmarks, property limits, elevations, slopes, drainage requirements, cut/fill decisions, quantities, utility locations, excavation limits, and site conditions before relying on them for construction or earthmoving. Maintain independent control of equipment and work methods.\n\n" +
            "EARTHWORK ESTIMATES\n\n" +
            "Cut, fill, net-volume, and similar calculations are planning estimates based on the entered grid and assumptions used by the application. They are not survey-grade or engineering-grade quantity calculations.\n\n" +
            "GPS-GUIDED POINT LOCATION\n\n" +
            "GPS-guided mode is intended to help navigate approximately between measurement points. Displayed accuracy/error values are estimates, not guaranteed bounds. A position can be wrong by more than the displayed uncertainty. Do not use the app to establish legal boundaries, construction control, precise grade stakes, or survey monuments where professional or verified control is required.\n\n" +
            "MAP IMAGERY AND NETWORK ACCESS\n\n" +
            "GPS coordinates, grade readings, and project data are designed to remain on the device unless you explicitly export them. When the GPS map is visible, the app requests map tiles from the USGS National Map service. Those requests can reveal the approximate geographic area being viewed to that service. The original distributed app does not include analytics or telemetry.\n\n" +
            "DATA AND AVAILABILITY\n\n" +
            "Local application/browser storage can be cleared, corrupted, or lost. Device failure, app/browser updates, permission changes, map-service availability, correction-service availability, or other events can make features or saved data unavailable. Export important projects when data loss would matter.\n\n" +
            "NO WARRANTY / LIMITATION OF LIABILITY\n\n" +
            "The software and application are provided AS IS, without warranty of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy, noninfringement, or availability. To the maximum extent permitted by law, the authors and contributors are not liable for claims, damages, losses, injuries, costs, or other liability arising from or related to use of the software or application.\n\n" +
            "ACCEPTANCE\n\n" +
            "By accepting, you acknowledge these limitations and agree to use Pad Grade Mapper at your own risk and with independent judgment. You will be asked to accept again after each installed app update.\n\n" +
            "MODIFIED OR REDISTRIBUTED VERSIONS\n\n" +
            "A person who modifies or redistributes the software under the MIT License may change, remove, or replace these Terms for their own distribution, subject to the MIT License and applicable law.\n\n" +
            "This is a practical project safety/usage notice and is not legal advice.";

    private static final String MIT_LICENSE =
            "MIT LICENSE\n\n" +
            "Copyright (c) 2026 Lordofrealms\n\n" +
            "Permission is hereby granted, free of charge, to any person obtaining a copy " +
            "of this software and associated documentation files (the \"Software\"), to deal " +
            "in the Software without restriction, including without limitation the rights " +
            "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell " +
            "copies of the Software, and to permit persons to whom the Software is furnished " +
            "to do so, subject to the following conditions:\n\n" +
            "The above copyright notice and this permission notice shall be included in all " +
            "copies or substantial portions of the Software.\n\n" +
            "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR " +
            "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS " +
            "FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR " +
            "COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER " +
            "IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION " +
            "WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";

    public static long currentVersionCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.getLongVersionCode();
        } catch (PackageManager.NameNotFoundException ex) {
            return -1L;
        }
    }

    public static boolean isAccepted(Context context) {
        long current = currentVersionCode(context);
        long accepted = context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getLong(ACCEPTED_VERSION_CODE, Long.MIN_VALUE);
        return current > 0 && accepted == current;
    }

    private static void recordAcceptance(Context context) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putLong(ACCEPTED_VERSION_CODE, currentVersionCode(context))
                .apply();
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 15, 20));
        getWindow().setNavigationBarColor(Color.rgb(11, 15, 20));
        buildUi();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(18), dp(20), dp(28));
        root.setBackgroundColor(Color.rgb(11, 15, 20));
        scroll.addView(root);

        TextView title = text("Terms of Use & Safety", 27, Color.WHITE, true);
        root.addView(title, matchWrap());
        TextView version = text("App versionCode " + currentVersionCode(this)
                        + " • Terms " + TERMS_VERSION,
                12, Color.rgb(130, 145, 158), false);
        version.setPadding(0, dp(4), 0, dp(18));
        root.addView(version, matchWrap());

        TextView terms = text(TERMS_TEXT, 14, Color.rgb(205, 213, 221), false);
        terms.setLineSpacing(0f, 1.15f);
        terms.setTextIsSelectable(true);
        root.addView(terms, matchWrap());

        TextView license = text(MIT_LICENSE, 13, Color.rgb(180, 192, 204), false);
        license.setPadding(0, dp(24), 0, dp(10));
        license.setLineSpacing(0f, 1.12f);
        license.setTextIsSelectable(true);
        root.addView(license, matchWrap());

        CheckBox accept = new CheckBox(this);
        accept.setText("I have read and accept these Terms of Use and Safety Notice.");
        accept.setTextColor(Color.WHITE);
        accept.setPadding(0, dp(18), 0, dp(8));
        root.addView(accept, matchWrap());

        Button continueButton = new Button(this);
        continueButton.setText("Accept & Continue");
        continueButton.setEnabled(false);
        accept.setOnCheckedChangeListener((button, checked) -> continueButton.setEnabled(checked));
        continueButton.setOnClickListener(v -> {
            recordAcceptance(this);
            setResult(RESULT_OK);
            finish();
        });
        root.addView(continueButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));

        Button decline = new Button(this);
        decline.setText("Decline");
        decline.setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });
        LinearLayout.LayoutParams declineParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        declineParams.topMargin = dp(8);
        root.addView(decline, declineParams);

        setContentView(scroll);
        scroll.requestApplyInsets();
    }

    @Override public void onBackPressed() {
        setResult(RESULT_CANCELED);
        super.onBackPressed();
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

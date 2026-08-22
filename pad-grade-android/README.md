# Pad Grade Android wrapper

Pad Grade has **one canonical application codebase**: `../pad-grade/`.

The Android project does not keep a second copy of the HTML/CSS/JavaScript. During
`merge*Assets`, Gradle copies the canonical `pad-grade/` directory into generated
Android assets and packages those exact files in the APK. GitHub Pages continues
to publish the same source directory.

## Platform model

The shared `pad-grade/platform.js` is inert in a normal browser. In the Android
WebView, the wrapper exposes `PadGradeNative`; when a compatible Precision Location
app is installed, `platform.js` presents its solution stream through a
Geolocation-compatible provider so the existing Pad Grade GPS/calibration code does
not need an Android-specific fork.

If Precision Location is absent or does not yet expose the IPC action, the WebView
falls back to ordinary Android/WebView geolocation.

## Precision Location IPC

The wrapper starts the user-visible Precision Location foreground service and binds
to the exported `com.lordofrealms.precisionlocation.EXTERNAL_BIND` action.
Communication uses Android `Messenger` + `Bundle`, not mock location.

Pad Grade receives:

- latitude / longitude / altitude
- estimated horizontal accuracy
- solution mode (Enhanced GNSS / HAS PPP / future modes)
- solution state (starting / converging / ready / degraded)
- timestamp / fix age

The Precision Location service verifies the Binder caller UID resolves to
`com.lordofrealms.padgrade` before accepting solution subscriptions.

## Build

From the repository root environment with Android SDK/Gradle available:

```text
gradle -p pad-grade-android :app:assembleDebug
```

The debug APK is written under:

`pad-grade-android/app/build/outputs/apk/debug/app-debug.apk`

CI is intentionally quiet and only runs when `ci-build-trigger.txt` changes or a
temporary validation PR changes that trigger file.

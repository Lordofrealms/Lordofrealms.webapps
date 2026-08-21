# Precision Location — Android prototype

A deliberately simple Android front-end for phone-internal high-accuracy GNSS.
The normal user should not configure PPP, RTK, constellations, frequencies,
ionosphere models, or ambiguity settings.

## Intended normal workflow

1. Open the app.
2. Tap **Start**.
3. Wait for the large status to become **READY**.
4. Use the corrected position in Pad Grade / future native tools.
5. Tap **Stop** when finished.

The app detects the measurements actually exposed by the handset at runtime.
A single-frequency handset can run SF PPP; phones exposing valid carrier phase
on a second/third frequency can automatically use DF/MF processing. The mode is
shown for diagnostics but is not a user setting.

## Correction source

Primary design target: Galileo High Accuracy Service (HAS) through the official
Internet Data Distribution (IDD) NTRIP service. HAS access is intended to be a
one-time account/credential setup. Caster details and estimator tuning belong in
an Advanced/troubleshooting surface, not on the normal screen.

## Engine

The native layer is structured around MRTKLIB (BSD-2-Clause), pinned to a known
commit for reproducible behavior. MRTKLIB provides a C11 PPP engine and Galileo
HAS support. Android raw GNSS acquisition uses full-tracking
`GnssMeasurementRequest` and collects navigation messages at the same time.

## Current prototype milestone

Implemented in this branch:

- Android 12+ native project (Java, no UI framework dependencies).
- One-button Start/Stop user interface.
- Raw GNSS full-tracking acquisition.
- Navigation-message acquisition.
- Automatic signal-band inventory.
- Automatic SF vs DF/MF capability selection from valid ADR observations.
- System-GPS fallback while the PPP filter is not yet producing a solution.
- JNI/CMake bridge that builds against pinned MRTKLIB.
- Stable interface between the eventual PPP engine and Pad Grade.
- Branch CI using AGP 9.3, Gradle 9.5, Android API 36, and NDK 28.2.

Still required before this produces a HAS-corrected PPP position:

- Translate Android `GnssClock`/`GnssMeasurement` epochs into MRTKLIB
  pseudorange/carrier-phase `obsd_t` records.
- Decode Android broadcast navigation messages into MRTKLIB `nav_t` ephemerides.
- Connect the registered Galileo HAS IDD stream and adapt its framing to
  MRTKLIB's HAS correction input.
- Feed the resulting observations/corrections into `pppos()` and return solution
  covariance to Java.
- Validate against the official HAS reference-algorithm test vectors and an
  outdoor A16 static dataset.

The architecture intentionally keeps those GNSS details out of the UI so they
can change without teaching the end user how PPP works.

# Precision Location — Android prototype

A deliberately simple Android front-end for phone-internal high-accuracy GNSS.
The normal user should not configure PPP, RTK, constellations, frequencies,
ionosphere models, or ambiguity settings.

## Normal workflow

1. Open the app.
2. Tap **Start**.
3. The app automatically uses the best available positioning mode.
4. Tap **Stop** when finished.

The active session runs as a user-started foreground location service. Locking the
screen or switching apps does not stop GNSS or reset PPP convergence. The ongoing
notification shows that Precision Location is active and includes a Stop action.
Swiping the app task away deliberately ends the session.

## Automatic positioning modes

### No-signup Enhanced GNSS

This is the default and requires no account or correction service. It uses the
phone's hardware GNSS as the absolute anchor, temporal/motion smoothing, raw
GPS/Galileo carrier phase, carrier-smoothed pseudorange, TDCP-aided range rate,
smartphone-specific measurement weighting, and an independent MRTKLIB broadcast
solution as a consistency check.

Because broadcast orbit/clock and single-frequency ionosphere biases remain, this
mode deliberately keeps a **0.5 m minimum estimated horizontal-accuracy floor** in
v0.4.0. This is an uncertainty floor, not a promise of 0.5 m absolute accuracy.
If the independent broadcast solution disagrees with Android's hardware fix, the
reported uncertainty is widened rather than hiding the discrepancy.

### Galileo HAS PPP

If Galileo HAS IDD credentials are saved, **Start automatically prefers HAS PPP**.
While HAS connects/converges, Enhanced GNSS continues to provide a usable fallback.
Once MRTKLIB has a valid covariance-backed HAS PPP solution, that solution replaces
the fallback automatically.

The carrier smoothing, TDCP derivation, cycle-slip handling and smartphone quality
weighting occur before the solver, so the same conditioned observations also feed
HAS PPP. The app detects the measurements actually exposed by the handset at
runtime. A single-frequency handset can run uncombined SF PPP; phones exposing valid
carrier phase on additional frequencies automatically move to DF/MF processing.

## Settings

The main screen has one visible **Settings** button while stopped.

### Use as phone location

Optional. When enabled, Precision Location publishes its corrected position and its
estimated horizontal accuracy into Google's fused location stream so most ordinary
Android apps can consume it.

Android requires one one-time system authorization:

`Developer options → Select mock location app → Precision Location`

The Settings screen reports whether that authorization is currently present and can
open Developer Options directly. Mock output is never allowed to break the GNSS
engine: if authorization is missing or an output call fails, positioning continues.
Stop always turns mock mode back off. Android marks injected positions as mock, so
apps that intentionally reject mock locations may ignore them.

### Galileo HAS

HAS is optional. Credentials can be added, edited, cleared and connection-tested
without reinstalling the app. Caster/PPP tuning remains hidden from normal users.
HAS remains the single signup-based correction path; the app does not add a second
precision-service account or user-facing correction configuration path.

## Engine

The native layer embeds MRTKLIB (BSD-2-Clause), pinned to commit
`d0f56fe6a67612efcb1fa448ec2923d1eae23c1a` for reproducible behavior. Android
raw GNSS acquisition requests full tracking and collects navigation messages
concurrently.

The pinned MRTKLIB version contains several dual-frequency assumptions in its
uncombined PPP path. This branch applies a small reviewable patch so a genuine
L1/E1-only phone can initialize and estimate slant-ionosphere and float
carrier-ambiguity states instead of being rejected for lacking a second band.
The same patch adds Android-specific continuous code weighting from the conditioned
C/N0/uncertainty score. Dual/multi-frequency operation continues to use the upstream
multi-band states.

Implemented data paths include:

- GPS/Galileo pseudorange, ADR carrier phase, Doppler/range-rate, C/N0 and code type.
- Per-signal finite-window carrier-smoothed pseudorange with arc restart on reset,
  cycle slip, unresolved half cycle, receiver-clock discontinuity, long gaps or
  gross code/carrier innovation.
- TDCP range-rate derived from continuous ADR arcs and uncertainty-weighted fusion
  with Android Doppler/range rate.
- Android pseudorange, ADR and range-rate uncertainties carried into observation
  conditioning, with C/N0-based soft weighting in both broadcast SPP and HAS PPP.
- Receiver-clock discontinuity, cycle-slip and half-cycle-state handling.
- GPS L1 C/A Android navigation reconstruction/parity validation.
- Galileo I/NAV page reconstruction/CRC validation.
- Rolling broadcast-ephemeris history.
- Broadcast SPP consistency preflight.
- TLS/NTRIP v2 HAS client with reconnect.
- RTCM3 SSR and IDD broadcast-ephemeris ingestion.
- Automatic SF/DF/MF PPP filter configuration.
- PPP covariance returned to Java as the precision uncertainty.
- Optional fused mock-location publishing with the same uncertainty.

## First A16 field result

A Samsung SM-A166U run captured about 10 minutes / 600 epochs at ~1 Hz. The phone
exposed roughly 12 simultaneous valid GPS+Galileo ADR observations in a typical
epoch, valid GPS/Galileo carrier phase in about 80% of logged observations, no
Android-reported cycle slips, and a stable hardware clock discontinuity counter.
GPS L1 C/A and Galileo I/NAV messages were also present. This is a strong enough
carrier-phase baseline to continue PPP development.

## Validation still required

- Install the current foreground-service revision and verify a long screen-off run.
- Confirm the Engine CSV reaches `SPP OK` and compare broadcast SPP against the
  Android hardware location.
- Field-check the v0.4.0 no-signup uncertainty model against known/static points.
- Exercise HAS with public historical data, then live IDD when credentials are issued.
- Validate convergence/accuracy against a known reference point.
- Tune handset stochastic weighting only if field residuals justify it.

Offline replay/regression tooling is intentionally deferred until after this field
validation pass.

The architecture intentionally keeps GNSS internals out of the normal UI so those
internals can evolve without teaching the end user how PPP works.

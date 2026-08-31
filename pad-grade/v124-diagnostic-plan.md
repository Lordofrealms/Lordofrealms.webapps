# Pad Grade v1.2.4 callback timing diagnostic

The diagnostic build separates file-request latency into the existing JavaScript/native bridge call, the single-threaded PadGradeFileIO queue wait, actual SAF I/O, Android WebView/UI-thread post wait, evaluateJavascript-to-JavaScript dispatch, and the final JavaScript callback/microtask handoff.

The v1.2.2 flickerless heat-map presentation architecture is intentionally unchanged and is protected by an explicit change-control comment in `v122-dev.js`.

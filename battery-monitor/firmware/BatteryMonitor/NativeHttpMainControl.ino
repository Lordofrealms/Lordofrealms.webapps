// Main-task control handoff for native HTTP.
//
// Management challenge/session arrays are owned by esp_http_server's task.
// Their expiry is already performed lazily by authentication handlers. The
// historical serviceNativeHttpControl() also expired them from Arduino loop(),
// which became a real cross-task race after the native HTTP migration. Keep the
// main task limited to deferred provisioning/reboot actions.

void serviceNativeHttpControlMainSafe() {
  if (nativeProvisioningStartAtMs != 0 && (long)(millis() - nativeProvisioningStartAtMs) >= 0) {
    nativeProvisioningStartAtMs = 0;
    if (!fallbackApActive) {
      stopNativeHttpServer();
      stopMdns();
      stopDiscovery();
      startFallbackAp();
    }
  }

  if (nativeFirmwareRebootPending && (int32_t)(millis() - nativeFirmwareRebootAtMs) >= 0) {
    nativeFirmwareRebootPending = false;
    Serial.println("Signed native LAN OTA verified; rebooting into candidate partition.");
    Serial.flush();
    delay(25);
    ESP.restart();
  }
}

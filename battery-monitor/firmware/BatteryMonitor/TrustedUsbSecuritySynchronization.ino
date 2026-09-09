// Trusted-USB synchronization for Device Password credential operations.
//
// Native HTTP authentication runs on esp_http_server's task while BATMON1 USB
// commands run on the Arduino application task. Credential rotation reloads and
// frees SRP/NVS material, so trusted USB must quiesce HTTP before reading or
// replacing that shared material. LAN password rotation remains HTTP-task-owned.

static bool trustedUsbShouldRestoreNativeHttp() {
  return httpServerActive && !fallbackApActive && WiFi.status() == WL_CONNECTED;
}

static void trustedUsbRestoreNativeHttp(bool restore) {
  if (restore && !fallbackApActive && WiFi.status() == WL_CONNECTED) {
    if (!startNativeHttpServer())
      Serial.println("WARNING: Native HTTP did not restart after trusted USB credential operation.");
  }
}

static bool trustedUsbQuiesceNativeHttp() {
  bool restore = trustedUsbShouldRestoreNativeHttp();
  if (httpServerActive) stopNativeHttpServer();
  return restore;
}

bool verifyDevicePasswordFlexibleTrustedUsb(const String& candidate) {
  // The protected provisioning AP has no native LAN HTTP server. Verification
  // only reads the stable check hash, so it is safe while Security 2 is active.
  if (secureProvisioningActive) return verifyDevicePasswordFlexible(candidate);

  bool restore = trustedUsbQuiesceNativeHttp();
  bool ok = verifyDevicePasswordFlexible(candidate);
  trustedUsbRestoreNativeHttp(restore);
  return ok;
}

bool setDevicePasswordFlexibleTrustedUsb(const String& usernameValue,
                                         const String& password,
                                         String& errorOut) {
  // Security 2 owns pointers into the current SRP credential material for the
  // life of an active provisioning session. Do not free/replace it underneath
  // the provisioner; the USB administrator can retry once provisioning ends.
  if (secureProvisioningActive) {
    errorOut = "PROVISIONING_ACTIVE";
    return false;
  }

  bool restore = trustedUsbQuiesceNativeHttp();
  invalidateManagementSessions();
  clearManagementAuthFailures();
  bool ok = setDevicePasswordFlexible(usernameValue, password, errorOut);
  trustedUsbRestoreNativeHttp(restore);
  return ok;
}

bool clearProvisioningIdentityTrustedUsb(String& errorOut) {
  // Security 2 owns pointers into the SRP material. Ask the provisioner to stop
  // and wait for NETWORK_PROV_END before freeing those pointers. Unlike the old
  // void-only path, a stop timeout is returned to the USB client explicitly.
  if (secureProvisioningActive) {
    requestStopSecureProvisioning();
    unsigned long started = millis();
    while (secureProvisioningActive && (unsigned long)(millis() - started) < 5000UL) delay(10);
    if (secureProvisioningActive) {
      errorOut = "PROVISIONING_STOP_TIMEOUT";
      return false;
    }
  }

  bool restore = trustedUsbQuiesceNativeHttp();
  invalidateManagementSessions();
  clearManagementAuthFailures();
  clearProvisioningIdentity();
  trustedUsbRestoreNativeHttp(restore);
  errorOut = "";
  return true;
}

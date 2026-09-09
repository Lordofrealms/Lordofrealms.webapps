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

bool verifyDevicePasswordFlexibleTrustedUsb(const String& candidate, bool& credentialPresentOut) {
  credentialPresentOut = false;

  // Security 2 owns the currently loaded SRP pointers while provisioning is
  // active. The protected setup AP has no LAN HTTP server, and an active
  // provisioner necessarily already has credential material loaded. Never try
  // to reload/free that material just to service a USB verification request.
  if (secureProvisioningActive) {
    credentialPresentOut = hasProvisioningIdentity();
    return credentialPresentOut && verifyDevicePasswordFlexible(candidate);
  }

  // Outside provisioning, stop native HTTP before both the existence/load check
  // and the password verification. This closes the last read race with LAN
  // password rotation, whose handler can replace the same credential material.
  bool restore = trustedUsbQuiesceNativeHttp();
  credentialPresentOut = hasProvisioningIdentity() || loadDeviceCredentialIdentity();
  bool ok = credentialPresentOut && verifyDevicePasswordFlexible(candidate);
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

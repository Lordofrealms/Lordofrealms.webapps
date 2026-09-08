// Trusted physical-USB export of the P0-3 Monitoring Identity Key.
// The serial caller is responsible for treating the returned hex as secret and
// the Windows client redacts it before any user-visible logging.
String trustedUsbMonitoringIdentityKeyHex() {
  if (!monitoringIdentityReady && !loadOrCreateMonitoringIdentity()) return "";
  return bytesToLowerHex(monitoringIdentityKey, sizeof(monitoringIdentityKey));
}

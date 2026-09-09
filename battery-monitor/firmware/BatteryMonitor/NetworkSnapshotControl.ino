// Main-task bridge for the cached network snapshot.
//
// BatteryMonitor.ino is left transport-neutral. These wrappers ensure the Wi-Fi
// driver is sampled on the Arduino/main task before HTTP starts and then at the
// configured one-second cadence during normal loop service.

bool startNativeHttpServerWithNetworkSnapshot() {
  publishNetworkSnapshotNow();
  return startNativeHttpServer();
}

void serviceNativeHttpControlWithNetworkSnapshot() {
  serviceNetworkSnapshot();
  serviceNativeHttpControlMainSafe();
}

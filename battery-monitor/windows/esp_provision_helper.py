#!/usr/bin/env python3
"""Battery Monitor Windows bridge for Espressif Security-2 provisioning.

The executable built from this file receives exactly one JSON request on stdin.
Secrets are intentionally never accepted as command-line arguments and are never
printed. Espressif's pinned esp_prov implementation supplies SRP6a + AES-GCM.
"""

import asyncio
import contextlib
import io
import json
import os
import sys

# Espressif's esp_prov package loads generated protocomm protobuf modules from
# IDF_PATH at import time. The packaged Windows helper carries only the pinned
# protocomm/python support tree it needs under a synthetic bundled IDF root.
if "IDF_PATH" not in os.environ:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        os.environ["IDF_PATH"] = os.path.join(sys._MEIPASS, "idf")
    else:
        bundled_idf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "idf")
        if os.path.isdir(bundled_idf):
            os.environ["IDF_PATH"] = bundled_idf

import esp_prov

PROTOCOL = "BATMONPROV1"


def emit(kind: str, **values) -> None:
    payload = {"protocol": PROTOCOL, "kind": kind, **values}
    print(json.dumps(payload, separators=(",", ":")), flush=True)


async def quiet(awaitable):
    # The upstream tool prints connection/status details that are not needed in
    # the GUI. Suppress them so a future upstream diagnostic cannot
    # accidentally turn our helper stdout into a credential-bearing log.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return await awaitable


async def provision(request: dict) -> None:
    username = str(request.get("username", "batmon"))
    setup_code = str(request.get("setupCode", ""))
    home_ssid = str(request.get("homeSsid", ""))
    home_password = str(request.get("homePassword", ""))
    service_name = str(request.get("serviceName", "192.168.4.1:80"))

    if not username or len(username) > 32:
        raise ValueError("Invalid Security-2 username.")
    if len(setup_code) != 16:
        raise ValueError("Setup code must be the 16-character canonical code.")
    if not home_ssid or len(home_ssid.encode("utf-8")) > 32:
        raise ValueError("Home Wi-Fi SSID is required and must fit the Wi-Fi SSID limit.")
    if len(home_password.encode("utf-8")) > 63:
        raise ValueError("Home Wi-Fi password is too long.")

    emit("stage", message="Contacting Battery Monitor secure provisioning service...")
    transport = await quiet(esp_prov.get_transport("softap", service_name))
    if transport is None:
        raise RuntimeError("Could not connect to the Battery Monitor provisioning service.")

    try:
        patch = await quiet(esp_prov.get_sec_patch_ver(transport, False))
        security = esp_prov.get_security(2, patch, username, setup_code, "", False)
        if security is None:
            raise RuntimeError("Could not initialize Espressif Security 2.")

        emit("stage", message="Authenticating setup code with Security 2...")
        if not await quiet(esp_prov.establish_session(transport, security)):
            raise RuntimeError("Security-2 authentication failed. Check the device ID and setup code.")

        emit("stage", message="Sending home Wi-Fi credentials through the encrypted session...")
        if not await quiet(esp_prov.send_wifi_config(transport, security, home_ssid, home_password)):
            raise RuntimeError("The ESP32 rejected the Wi-Fi configuration.")

        emit("stage", message="Applying Wi-Fi configuration...")
        if not await quiet(esp_prov.apply_wifi_config(transport, security)):
            raise RuntimeError("The ESP32 could not apply the Wi-Fi configuration.")

        emit("stage", message="Waiting for the Battery Monitor to join the home network...")
        if not await quiet(esp_prov.wait_wifi_connected(transport, security)):
            raise RuntimeError("The Battery Monitor could not connect to the requested home Wi-Fi network.")

        emit("result", ok=True, message="Secure Wi-Fi provisioning completed successfully.")
    finally:
        try:
            await quiet(transport.disconnect())
        except Exception:
            pass


async def main() -> int:
    try:
        line = sys.stdin.readline()
        if not line:
            raise ValueError("No provisioning request was supplied on stdin.")
        request = json.loads(line)
        if request.get("protocol") != PROTOCOL:
            raise ValueError("Unsupported provisioning helper protocol.")
        await provision(request)
        return 0
    except Exception as exc:
        # Exception messages from this controlled call graph are expected to be
        # protocol/connection errors, not credential values. Never echo request
        # content in error handling.
        emit("result", ok=False, message=str(exc) or "Secure provisioning failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

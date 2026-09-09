#!/usr/bin/env python3
"""Fail CI if the production firmware regains Arduino WebServer coupling."""

from __future__ import annotations

import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
FIRMWARE_ROOT = REPO_ROOT / "battery-monitor" / "firmware"
SOURCE_ROOT = FIRMWARE_ROOT / "BatteryMonitor"
APP_TU = FIRMWARE_ROOT / "idf" / "main" / "BatteryMonitorApp.cpp"

FORBIDDEN_FILES = {
    "BatteryMonitorLegacy.inc",
    "WebServerTask.ino",
    "WifiFirmwareUpdate.ino",
    "YManagementAuthPrototypes.ino",
    "ZManagementAuth.ino",
    "ZZMonitorIdentity.ino",
}

FORBIDDEN_CODE_PATTERNS = (
    (re.compile(r"^\s*#\s*include\s*[<\"]WebServer\.h[>\"]", re.MULTILINE), "Arduino WebServer header include"),
    (re.compile(r"\bWebServer\s+[A-Za-z_]\w*\s*\("), "Arduino WebServer object construction"),
    (
        re.compile(
            r"\bserver\.(?:on|send|sendHeader|hasArg|arg|header|client|handleClient|begin|stop)\s*\("
        ),
        "legacy Arduino server.* call",
    ),
)

REQUIRED_APP_INCLUDES = (
    '../../BatteryMonitor/BatteryMonitorCore.ino',
    '../../BatteryMonitor/ManagementSecurityCore.ino',
    '../../BatteryMonitor/MonitoringIdentityCore.ino',
    '../../BatteryMonitor/NativeHttpServer.ino',
    '../../BatteryMonitor/BatteryMonitor.ino',
)

FORBIDDEN_APP_INCLUDES = tuple(f'../../BatteryMonitor/{name}' for name in FORBIDDEN_FILES)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not SOURCE_ROOT.is_dir():
        fail(f"production firmware source directory missing: {SOURCE_ROOT}")
    if not APP_TU.is_file():
        fail(f"authoritative application translation unit missing: {APP_TU}")

    existing_forbidden = sorted(
        path.relative_to(REPO_ROOT).as_posix()
        for path in FIRMWARE_ROOT.rglob("*")
        if path.is_file() and path.name in FORBIDDEN_FILES
    )
    if existing_forbidden:
        fail("obsolete Arduino HTTP module(s) restored: " + ", ".join(existing_forbidden))

    violations: list[str] = []
    for path in sorted(SOURCE_ROOT.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".ino", ".h", ".hpp", ".c", ".cc", ".cpp"}:
            continue
        text = path.read_text(encoding="utf-8")
        for pattern, description in FORBIDDEN_CODE_PATTERNS:
            if pattern.search(text):
                violations.append(f"{path.relative_to(REPO_ROOT).as_posix()}: {description}")

    if violations:
        fail("Arduino WebServer dependency detected:\n  " + "\n  ".join(violations))

    app_text = APP_TU.read_text(encoding="utf-8")
    for include in REQUIRED_APP_INCLUDES:
        if include not in app_text:
            fail(f"authoritative translation unit no longer includes required native module: {include}")
    for include in FORBIDDEN_APP_INCLUDES:
        if include in app_text:
            fail(f"authoritative translation unit restored obsolete module: {include}")

    if "#include <esp_http_server.h>" not in (SOURCE_ROOT / "NativeHttpServer.ino").read_text(encoding="utf-8"):
        fail("NativeHttpServer.ino no longer includes esp_http_server.h")

    print("Native HTTP authority check passed: no Arduino WebServer production dependency found.")


if __name__ == "__main__":
    main()

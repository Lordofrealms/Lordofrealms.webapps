#!/usr/bin/env python3
"""Inventory and CRC-check an RTCM3 byte stream using only the Python stdlib."""

from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

CRC24Q_POLY = 0x1864CFB


def crc24q(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte << 16
        for _ in range(8):
            crc <<= 1
            if crc & 0x1000000:
                crc ^= CRC24Q_POLY
        crc &= 0xFFFFFF
    return crc


def is_ssr_message(message_type: int) -> bool:
    # RTCM 3.x SSR families for GPS/GLO/GAL/QZS/SBAS/BDS.
    return (
        1057 <= message_type <= 1068
        or 1240 <= message_type <= 1263
    )


def is_gps_gal_ephemeris(message_type: int) -> bool:
    return message_type in (1019, 1045, 1046)


def inventory(data: bytes) -> tuple[Counter[int], int, int, int]:
    counts: Counter[int] = Counter()
    valid = 0
    bad_crc = 0
    skipped = 0
    i = 0

    while i + 6 <= len(data):
        if data[i] != 0xD3:
            i += 1
            skipped += 1
            continue

        length = ((data[i + 1] & 0x03) << 8) | data[i + 2]
        frame_len = 3 + length + 3
        if length < 2 or i + frame_len > len(data):
            # A false 0xD3 in arbitrary bytes should not make us discard the
            # rest of the stream. Advance one byte and continue searching.
            i += 1
            skipped += 1
            continue

        frame_without_crc = data[i : i + 3 + length]
        expected_crc = int.from_bytes(data[i + 3 + length : i + frame_len], "big")
        actual_crc = crc24q(frame_without_crc)
        if actual_crc != expected_crc:
            bad_crc += 1
            i += 1
            continue

        payload = data[i + 3 : i + 3 + length]
        message_type = (payload[0] << 4) | (payload[1] >> 4)
        counts[message_type] += 1
        valid += 1
        i += frame_len

    return counts, valid, bad_crc, skipped


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("stream", type=Path)
    parser.add_argument("--require-ssr", action="store_true")
    parser.add_argument("--require-ephemeris", action="store_true")
    args = parser.parse_args()

    data = args.stream.read_bytes()
    counts, valid, bad_crc, skipped = inventory(data)

    print(f"bytes={len(data)} valid_frames={valid} bad_crc={bad_crc} skipped_bytes={skipped}")
    for message_type, count in sorted(counts.items()):
        tags = []
        if is_ssr_message(message_type):
            tags.append("SSR")
        if is_gps_gal_ephemeris(message_type):
            tags.append("EPH")
        suffix = f" [{' '.join(tags)}]" if tags else ""
        print(f"RTCM {message_type}: {count}{suffix}")

    if valid == 0:
        raise SystemExit("no valid RTCM3 frames found")
    if bad_crc != 0:
        raise SystemExit(f"stream contained {bad_crc} CRC-invalid candidate frames")
    if args.require_ssr and not any(is_ssr_message(t) for t in counts):
        raise SystemExit("no RTCM SSR correction messages found")
    if args.require_ephemeris and not any(is_gps_gal_ephemeris(t) for t in counts):
        raise SystemExit("no GPS/Galileo broadcast ephemeris messages found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

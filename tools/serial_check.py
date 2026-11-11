"""
serial_check.py - find out which direction of the STM32 <-> PC serial link works.

Usage:  python tools/serial_check.py COM7      (close Tera Term first)
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM7"
ser = serial.Serial(PORT, 115200, timeout=0.05)
print(f"Opened {PORT}  (DTR={ser.dtr}, RTS={ser.rts})")


def listen(seconds):
    data = b""
    end = time.time() + seconds
    while time.time() < end:
        data += ser.read(256)
    return data


print("\nTEST 1 - STM32 -> PC: press the black RESET button on the Nucleo now (listening 8 s)...")
d = listen(8)
print(f"  received {len(d)} bytes: {d[:120]!r}")

print("\nTEST 2 - PC -> STM32, typed slowly like Tera Term: 'PING' + CR")
for ch in b"PING\r":
    ser.write(bytes([ch]))
    time.sleep(0.05)
d = listen(2)
print(f"  received {len(d)} bytes: {d[:120]!r}")

print("\nTEST 3 - PC -> STM32, all at once: 'PING' + CR + LF")
ser.write(b"PING\r\n")
d = listen(2)
print(f"  received {len(d)} bytes: {d[:120]!r}")

ser.close()

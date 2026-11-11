"""
serial_check2.py - try several ways of writing to the ST-LINK virtual COM port
and report which ones the STM32 actually answers.

Usage:  python tools/serial_check2.py COM7      (close Tera Term first)
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM7"
ser = serial.Serial(PORT, 115200, timeout=0.05)
print(f"Opened {PORT}")
time.sleep(0.5)
ser.read(4096)                       # drain anything already waiting


def got_pong(seconds=1.0):
    data = b""
    end = time.time() + seconds
    while time.time() < end:
        data += ser.read(256)
        if b"PONG" in data:
            return True, data
    return False, data


def whole(line):
    ser.write(line)


def bytewise(line):
    for b in line:
        ser.write(bytes([b]))
        time.sleep(0.02)


def whole_flush(line):
    ser.write(line)
    ser.flush()


def dtr_toggle(line):
    ser.dtr = False
    time.sleep(0.1)
    ser.dtr = True
    time.sleep(0.1)
    ser.write(line)


def rts_toggle(line):
    ser.rts = False
    time.sleep(0.1)
    ser.rts = True
    time.sleep(0.1)
    ser.write(line)


tests = [
    ("1 whole line  PING\\r\\n", whole, b"PING\r\n"),
    ("2 whole line  PING\\r   ", whole, b"PING\r"),
    ("3 byte by byte PING\\r  ", bytewise, b"PING\r"),
    ("4 whole + flush        ", whole_flush, b"PING\r\n"),
    ("5 DTR off/on, then line", dtr_toggle, b"PING\r\n"),
    ("6 RTS off/on, then line", rts_toggle, b"PING\r\n"),
]

for rnd in (1, 2):
    print(f"\nRound {rnd}")
    for name, fn, line in tests:
        fn(line)
        ok, data = got_pong()
        print(f"  {name}: {'OK  ' if ok else 'FAIL'}  {data[:60]!r}")

ser.close()

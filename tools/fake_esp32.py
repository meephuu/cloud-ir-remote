"""
fake_esp32.py - pretend to be the ESP32 and talk to the STM32 IR firmware
over the Nucleo's USB serial port (USART2). Same protocol as docs/uart-protocol.md.

Usage:
    pip install pyserial
    python tools/fake_esp32.py COM7

Close Tera Term first: only one program can open the COM port at a time.
"""
import sys
import time

import serial  # pip install pyserial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM7"
ser = serial.Serial(PORT, 115200, timeout=0.05)
bytes_seen = 0          # total bytes received, for troubleshooting


def send(line: str) -> None:
    ser.write((line + "\r\n").encode())


def reply(timeout: float):
    """Return the next protocol line, printing '# ' debug lines along the way."""
    global bytes_seen
    deadline = time.time() + timeout
    buf = b""
    while time.time() < deadline:
        c = ser.read(1)
        if not c:
            continue
        bytes_seen += 1
        if c != b"\n":
            buf += c
            continue
        line = buf.decode(errors="replace").strip()
        buf = b""
        if not line:
            continue
        if line.startswith("#") or line == "READY":
            print("   STM32", line)
            continue
        return line
    return None


def command(line: str, timeout: float = 2.0):
    shown = line if len(line) < 60 else line[:60] + "..."
    print(f"-> {shown}")
    send(line)
    r = reply(timeout)
    shown = r if (r is None or len(r) < 60) else r[:60] + f"... ({len(r)} chars)"
    print(f"<- {shown}")
    return r


print(f"Opened {PORT}")
# Keep pinging until the STM32 answers (up to 15 s).
t_open = time.time()
# Throw away anything already waiting in the receive buffer.
time.sleep(0.2)
ser.read(ser.in_waiting or 1)
for attempt in range(15):
    if command("PING", timeout=1.0) == "PONG":
        print(f"Link up {time.time() - t_open:.1f} s after opening the port")
        break
else:
    print("No PONG - listening 6 s for STM32 debug/stats lines...")
    reply(6)
    sys.exit(f"No PONG after 15 s ({bytes_seen} bytes received in total). "
             "Is the 03_ir_commands firmware running and Tera Term closed?")

code = None
while True:
    choice = input("\n[l] learn  [s] send last code  [q] quit > ").strip().lower()
    if choice == "q":
        break
    if choice == "l":
        print("Tap a remote button at the KY-022 within 10 s...")
        r = command("LEARN", timeout=12)
        if r and r.startswith("CODE,"):
            code = r[len("CODE,"):]          # "<n>,<t1>,...,<tn>"
            n = code.split(",", 1)[0]
            print(f"Learned a code with {n} durations")
    elif choice == "s":
        if not code:
            print("Learn a code first.")
            continue
        command("SEND," + code, timeout=3)

ser.close()

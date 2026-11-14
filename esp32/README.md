# ESP32-S3 firmware (Wi-Fi bridge)

The ESP32-S3 connects the website to the STM32:

```
Website <-> Firebase Realtime Database <-> ESP32-S3 <-> UART <-> STM32
```

It picks up commands the website writes to Firebase, sends them to the STM32 over UART, and writes the answers back. It also forwards sensor readings and writes a heartbeat so the website can show "ESP32 online".

| Folder | What |
|---|---|
| `00_hello/` | Step 2.1: prints "Hello" to check the board and cable |
| `cloud_ir_bridge/` | The real firmware: Wi-Fi, Firebase, UART, command logic |

## Setup (once)

1. Install **Arduino IDE 2** from https://www.arduino.cc/en/software.
2. **File > Preferences > Additional boards manager URLs**: add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Tools > Board > Boards Manager**: search `esp32`, install **esp32 by Espressif Systems** (version 3.x).
4. **Tools > Manage Libraries**: search `ArduinoJson`, install **ArduinoJson by Benoit Blanchon** (version 7.x). The bridge needs no other library.
5. Board settings in the **Tools** menu:
   - **Board:** ESP32S3 Dev Module
   - **Port:** the COM port that appears when you plug the board in
   - **USB CDC On Boot:** see below

**Which USB-C port?** Most ESP32-S3 boards have two USB-C ports, often labelled **COM/UART** and **USB**.
- **COM/UART port:** works with the default settings. Easiest choice.
- **USB port (native):** set **Tools > USB CDC On Boot > Enabled**, or the Serial Monitor stays empty.

If uploading fails with "Failed to connect", hold the **BOOT** button, press **RST** once, release **BOOT**, and upload again.

## Step 2.1: Hello on the Serial Monitor

1. Open `esp32/00_hello/00_hello.ino` and click **Upload** (→).
2. Open **Tools > Serial Monitor** and set it to **115200 baud**.
3. You should see `Hello from the ESP32-S3!`, then `alive 0`, `alive 1`, and so on. If nothing appears, press **RST** on the board.

## Step 2.2 to 2.5: the bridge

### 1. Secrets

In `esp32/cloud_ir_bridge/`, copy `secrets.example.h` to `secrets.h` and fill in:
- `WIFI_SSID` and `WIFI_PASSWORD`. The network must be **2.4 GHz**. University Wi-Fi that asks for a username (WPA2-Enterprise) will not work, so use a phone hotspot or home Wi-Fi.
- `FIREBASE_DB_URL`: the URL at the top of **Firebase console > Realtime Database > Data**, for example `https://cloud-ir-remote-default-rtdb.asia-southeast1.firebasedatabase.app`.

`secrets.h` is in `.gitignore`. The repo is public, so never commit it.

Deploy the database rules before you start (`npm run deploy` in `web/`, see `web/README.md`). The bridge asks Firebase for "pending commands only", which needs the index defined in those rules. Without it, the bridge still works but prints a warning.

### 2. Upload and watch the Serial Monitor

Open `esp32/cloud_ir_bridge/cloud_ir_bridge.ino`, upload, then open the Serial Monitor at **115200** with line ending set to **Newline**. You should see:

```
=== Cloud IR Remote: ESP32 bridge ===
Wi-Fi: connecting to "MyHotspot"....
Wi-Fi: connected, IP 192.168.1.23, signal -52 dBm
Firebase: OK
-> STM32  PING
Ready. Type ? for status, >PING to test the STM32 link, or STM32 lines like ACK,SEND.
```

With Wi-Fi and Firebase OK, the website header switches to **ESP32 online** within 10 seconds. That covers steps 2.2 (Wi-Fi) and 2.3 (Firebase).

### 3. Test without the STM32 (pretend to be it)

Anything you type in the Serial Monitor is handled as if the STM32 sent it:

| Try this | What happens |
|---|---|
| Website: press **Send** on a button | Monitor shows `-> STM32  SEND,319,3480,...`. Type `ACK,SEND` within 4 s and the website row says **Sent**. Type nothing and it says the STM32 did not reply. |
| Website: **Learn new button**, name it, start | Monitor shows `-> STM32  LEARN`. Type `CODE,4,9000,4500,560,560` and the website shows **Saved** with a small timing diagram. Type `ERR,LEARN,TIMEOUT` to see the error screen. |
| Type `ENV,285,62` | The website shows 28.5 °C and 62 %. |
| Type `?` | Prints Wi-Fi, clock, STM32 link and counters. |

### 4. Test with a real STM32 (your own Nucleo)

Flash `stm32/03_ir_commands` onto the Nucleo and wire it up:

| ESP32-S3 | Nucleo | Note |
|---|---|---|
| GPIO17 (TX) | PA10 (D2) | ESP32 TX -> STM32 RX |
| GPIO18 (RX) | PA9 (D8) | STM32 TX -> ESP32 RX |
| GND | GND | Common ground is required |

Both boards use 3.3 V logic, so they connect directly. Power each board from its own USB.

Reset the ESP32. The Monitor should show `<- STM32  PONG` and `UART link to the STM32 is working`. You can also type `>PING` at any time. Then press **Send** on the website: the STM32 answers `ACK,SEND` on its own, and the row says **Sent**. No IR LED is needed for this test.

## How it works

`cloud_ir_bridge.ino` runs one loop:

1. **Read UART lines** from the STM32 (and the Serial Monitor) into a line buffer; each full line is handled:
   - `ACK,SEND` -> mark the current SEND command `done`
   - `CODE,<n>,...` -> save a new `/codes/{id}` and mark the LEARN command `done` with that `codeId`
   - `ERR,...` -> mark the current command `error` with the error text
   - `ENV,<temp_x10>,<hum>` -> write `/env/latest` (at most every 5 s) and `/env/history/{ms}` (every 5 min)
   - `READY` (the STM32 rebooted) -> fail whatever was in progress
2. **Poll Firebase** every 1 s for commands with `status: "pending"`, oldest first, but only when idle (one command at a time, as the protocol requires).
   - `SEND`: read `/codes/{codeId}`, check that `n` matches the number of timings, write `SEND,<n>,<timings>`, wait up to 4 s for `ACK,SEND`.
   - `LEARN`: write `LEARN`, wait up to 13 s for `CODE,...` (the STM32 listens for 10 s). On timeout, send `CANCEL`.
   - Commands older than 60 s are marked `error` instead of run, so an air-con code pressed while the ESP32 was off does not fire hours later.
3. **Heartbeat**: write `/device/lastSeen` (server timestamp) every 10 s.

Firebase is reached through its REST API (`https://<db>/<path>.json`) using the ESP32's built-in `HTTPClient`, with one HTTPS connection kept open. HTTP requests block the loop for about 0.1 s each. That is why `Serial1.setRxBufferSize(4096)` matters: a 2 KB `CODE` line can arrive in the meantime and must fit in the buffer.

The automation rule (`RULE,...`) is written but switched off (`FORWARD_RULE_TO_STM32 0` in `config.h`) until the STM32 supports it. Today it would answer `ERR,UNKNOWN`.

| File | What |
|---|---|
| `cloud_ir_bridge.ino` | Main loop, UART line handling, command logic |
| `firebase_rest.h/.cpp` | Tiny Firebase REST client (GET/PUT/PATCH/POST) |
| `config.h` | Pins, buffer sizes, timeouts, feature switch |
| `secrets.example.h` | Template for `secrets.h` (Wi-Fi + database URL) |

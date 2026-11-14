# ESP32 + Firebase + website: status (14 Nov 2026)

Phu's half of the project. What works, what changed in the shared contract, and what the STM32 side needs next.

## What works

- **Firebase**: project and Realtime Database created; rules in `web/database.rules.json`.
- **Website** (`web/`, React + Vite, Firebase Hosting): saved buttons with Send / Rename / Delete, Learn new button, live temperature and humidity with a history graph, automation rule, activity log. See `web/README.md`.
- **ESP32-S3** (`esp32/cloud_ir_bridge/`): connects to Wi-Fi and Firebase, shows "ESP32 online" on the site, runs SEND and LEARN commands over UART, and forwards ENV readings. See `esp32/README.md`.
- **Tested end to end with a fake STM32**: typing `ACK,SEND`, `CODE,...` and `ENV,...` into the ESP32's Serial Monitor makes the website show Sent, Saved and the new temperature. With nothing connected, a Send correctly ends with "No reply from the STM32".
- **Not tested yet**: a real STM32 on the wires. That is the next step.

## Changes to the database layout

Same as your draft, plus:

| Path / field | Why |
|---|---|
| `/device/lastSeen` (ms timestamp) | ESP32 heartbeat every 10 s; the site shows online/offline |
| `/commands/{id}.createdAt`, `.doneAt` (ms timestamps) | ordering, and showing when things happened |
| `/commands/{id}.error` | the raw STM32 line, e.g. `"ERR,SEND,BUSY"`; the site explains it in words |
| `/commands/{id}.codeId` on a finished LEARN | so the site can show the code it just learned |
| `/codes/{id}.createdAt` | sort order |

`temp` is stored in °C as a decimal (`28.5`); the ESP32 divides your `temp_x10` by 10. The full table is in `web/README.md`.

## UART: what the ESP32 sends and expects

Exactly as in `docs/uart-protocol.md` v0.2, nothing changed:

- Sends `PING` at boot, `SEND,<n>,<t1>,...`, `LEARN`, and `CANCEL` (only if a LEARN gets no answer within 13 s).
- One command at a time: it never sends a new command before the previous reply or its timeout (SEND 4 s, LEARN 13 s).
- Ends lines with `\r\n`; reads until `\n` and trims.
- `READY` while a command is in progress marks that command as failed ("The STM32 restarted").

### Needed from the STM32 next

1. **`ENV,<temp_x10>,<hum>`** with the DHT11, every few seconds. The ESP32 already handles it: `/env/latest` at most every 5 s, one `/env/history` point every 5 min.
2. **`RULE,<threshold_x10>,<0/1>,<n>,<t1>,...,<tn>`**. Code for it is written on the ESP32 but switched off (`FORWARD_RULE_TO_STM32 0` in `esp32/cloud_ir_bridge/config.h`), because the STM32 answers `ERR,UNKNOWN` today. It sends the rule when it changes on the website and again after `READY`. With the rule disabled it sends `RULE,<threshold_x10>,0,0`. Tell me if you want a reply such as `ACK,RULE`, or a different format.
3. **`FIRED`** is only logged on the ESP32 for now. If you want it on the website, we can add `/rule/lastFired`.

## Try it

- Website locally: `cd web && npm install && npm run dev`. Without a `web/.env.local` it runs in demo mode with a simulated device.
- ESP32: Arduino IDE, board "ESP32S3 Dev Module", libraries: ArduinoJson 7. Copy `secrets.example.h` to `secrets.h`.
- Wiring to a Nucleo running `stm32/03_ir_commands`: ESP32 GPIO17 → PA10 (D2), GPIO18 → PA9 (D8), GND → GND.

Secrets stay out of git: `esp32/cloud_ir_bridge/secrets.h` and `web/.env.local` are both in `.gitignore`.

## Other files

`PRODUCT.md`, `DESIGN.md` and `.impeccable/` hold the website's product notes and design system (colours, type, layout rules), used when designing the pages. They are not part of the firmware.

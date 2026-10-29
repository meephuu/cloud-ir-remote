# ESP32-S3 firmware (Wi-Fi bridge)

The ESP32-S3 Arduino sketch goes in this folder.

## Wiring to the Nucleo

| ESP32-S3 | Nucleo | Note |
|---|---|---|
| GPIO17 (TX) | PA10 (D2) | ESP32 TX -> STM32 RX |
| GPIO18 (RX) | PA9 (D8) | STM32 TX -> ESP32 RX |
| GND | GND | Common ground is required |

Both boards use 3.3 V logic, so they connect directly. Power each board from its own USB.

```cpp
Serial1.begin(115200, SERIAL_8N1, 18 /*RX*/, 17 /*TX*/);
```

## Secrets

Keep Wi-Fi and Firebase credentials in `secrets.h`, which git ignores. Commit only `secrets.example.h` with placeholder values.

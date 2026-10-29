# Cloud IR Remote

Turn any infrared-controlled device (TV, projector, air-con, LED light) into a smart device you can control from a website.

> Final project for **2110366 Embedded System Laboratory**, Semester 1/2026,
> Department of Computer Engineering, Chulalongkorn University

## What it does

- **Learn**: press "Learn new button" on the website, point a real remote at the device, and press a button. The STM32 records the raw IR signal and it is saved to the cloud under a name (e.g. "TV Power").
- **Replay**: press a saved button on the website. The STM32 re-transmits the exact signal through its IR LED, and the TV/air-con responds.
- **Automate**: the device measures room temperature and humidity. Set a rule on the website (e.g. "if above 30 °C, send *Air-con ON*") and the STM32 runs it locally, even if Wi-Fi drops.

## Architecture

```
 Website  <-->  Firebase Realtime DB  <-->  ESP32-S3  <--UART-->  STM32 NUCLEO-F411RE
 (UI)           (code library, history,     (Wi-Fi bridge)        (real-time IR + sensors)
                 commands, settings)                                 |-- KY-022 IR receiver
                                                                     |-- KY-005 IR emitter
                                                                     '-- KY-015 DHT11
```

- **STM32**: all timing-critical work: IR capture (timer input capture, 1 µs), IR transmit (38 kHz PWM carrier gated by a timer interrupt), DHT11 reading, automation rule.
- **ESP32-S3**: Wi-Fi and cloud connection; relays commands down and data up.
- **Cloud and web**: stores learned codes and sensor history; the user interface.

## Hardware

| Part | Role | Type |
|---|---|---|
| STM32 NUCLEO-F411RE | Main controller | MCU |
| ESP32-S3 dev board | Wi-Fi bridge | MCU |
| KY-022 IR receiver (38 kHz) | Learn signals from real remotes | Sensor |
| KY-005 IR emitter | Send signals to devices | Actuator |
| KY-015 DHT11 | Room temperature and humidity | Sensor |

## Repository layout

| Folder | Contents |
|---|---|
| [`stm32/`](stm32/) | STM32CubeIDE project, wiring and pin plan |
| [`esp32/`](esp32/) | ESP32-S3 firmware (Arduino) |
| [`web/`](web/) | Website |
| [`docs/`](docs/) | UART protocol, diagrams, report material |

## Team

| Name | Student ID | Role |
|---|---|---|
| Tanakrit Roongtanapirom | 6731322021 | STM32 firmware: IR capture/replay, DHT11, UART |
| Phu Anuntaworasakul | 6731339821 | ESP32-S3 firmware, Firebase, website |

Shared: system architecture, UART protocol, integration, report, and demo.

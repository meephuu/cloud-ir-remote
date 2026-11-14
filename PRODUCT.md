# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite (user's choice), deployed to Firebase Hosting. Data in Firebase Realtime Database through the Firebase JS SDK.

## Users

Two engineering students (the project team) and the lab TA. The team uses it at home on a phone as a remote for an air-con and other IR devices, and on a laptop or projector during the lab demo. Both uses matter equally.

## Product Purpose

Cloud IR Remote turns any infrared-controlled device (air-con, TV, projector, LED light) into a device you can control from a website. The website is the user interface for the whole system: it lists learned IR buttons and sends them, starts learning a new button from a real remote, shows room temperature and humidity with history, and sets an automation rule.

Success: pressing a saved button on the site makes the real device respond, and the demo clearly shows each part of the chain working.

## Positioning

The site does not talk to hardware directly. It writes commands into Firebase, an ESP32-S3 relays them over UART to an STM32 that records and replays raw IR timings. Any remote can be learned; no device database is needed.

## Operating Context

- Data path: Website <-> Firebase Realtime DB <-> ESP32-S3 <-> UART <-> STM32 NUCLEO-F411RE.
- Commands are asynchronous: the site writes a command with status `pending`, the ESP32 marks it `done` or `error`. The UI must show this round trip.
- Learning waits up to 10 s for the user to press a button on the real remote; the STM32 can time out (`ERR,LEARN,TIMEOUT`) or reject long signals (`ERR,LEARN,TOO_LONG`).
- Sending an air-con code takes about 0.2 s once it reaches the STM32.
- Sensor: DHT11, temperature in 0.1 °C steps (sent x10), humidity in whole %.
- The automation rule will be run on the STM32 locally, so it keeps working when Wi-Fi drops.

## Capabilities and Constraints

- DB layout (team-agreed draft, may change):
  - `/codes/{id}` -> `{ name, n, timings: "486,403,..." }` (max 600 durations; a Daikin code is 319)
  - `/env/latest` -> `{ temp, hum, ts }`, `/env/history/{ts}` -> `{ temp, hum }`
  - `/commands/{id}` -> `{ type: "SEND" | "LEARN", codeId | name, status: "pending" | "done" | "error" }`
  - `/rule` -> `{ threshold, enabled, codeId }`
- Must work before the hardware is ready: data can be typed into the DB by hand, and a demo mode with fake data is needed until the Firebase project exists.
- Firebase keys must not be committed to the public repo.
- Undecided: authentication (none yet), whether history is trimmed, unit of `ts`.

## Brand Commitments

Name: "Cloud IR Remote". Course: 2110366 Embedded System Laboratory, Chulalongkorn University. No logo or other brand assets exist.

## Evidence on Hand

A real Daikin air-con code (319 durations) was captured and replayed successfully. No screenshots, photos, or user data exist yet; do not invent device names beyond the examples "AC Cool" and "AC Off".

## Product Principles

1. Every action shows its round trip: pending, done, or error, never a silent click.
2. Honest about the hardware: when the device is offline or the data is stale, say so.
3. Works one-handed on a phone and reads clearly on a projector.
4. Simple enough to explain in one page of the final report.

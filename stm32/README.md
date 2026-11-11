# STM32 firmware (NUCLEO-F411RE)

The STM32CubeIDE project goes in this folder.

## Pin plan (draft)

| Function | STM32 pin | Nucleo header | Peripheral |
|---|---|---|---|
| KY-022 IR receiver OUT | PA0 | A0 | TIM2 CH1 input capture, both edges, 1 MHz tick |
| KY-005 IR emitter S | PA6 | D12 | TIM3 CH1 PWM, ~38 kHz carrier, ~33% duty. **Needs a series resistor (100 Ω) or the 2N2222 driver: the KY-005 has no resistor on board.** |
| IR mark/space timing | — | — | TIM5 (32-bit) update interrupt, 1 MHz tick |
| DHT11 DATA | PB5 | D4 | GPIO (output/input switching) + TIM10 as 1 µs counter |
| UART to ESP32 TX | PA9 | D8 | USART1, 115200 8N1 |
| UART to ESP32 RX | PA10 | D2 | USART1 |
| Debug serial | PA2 / PA3 | (ST-LINK USB) | USART2, 115200 8N1 |

All modules are powered from the Nucleo **3.3 V** pin, with GND to GND.

## Clock

- SYSCLK 100 MHz (HSI -> PLLM=8, PLLN=100, PLLP=/2), APB1 /2, APB2 /1, so all timer clocks run at 100 MHz.
- TIM2/TIM5/TIM10: PSC = 99 gives a 1 MHz tick (1 µs).
- TIM3 (carrier): PSC = 0, ARR = 2631 gives 38.0 kHz; CCR = 877 gives ~33% duty. CCR = 0 means carrier off.

## IR emitter driver (2N2222 booster)

The KY-005 has no current-limiting resistor (R1 is empty), and a GPIO pin alone is too weak:
with a 100 Ω resistor straight from PA6 the air-con beeped but rejected the frame, and long codes lost bits in the loopback test.
A transistor driver fixes this:

```
Nucleo 5V ──[ 47 Ω ]── KY-005 S        (LED anode)
                       KY-005 −  ───── 2N2222 C
                                       2N2222 E ── GND
PA6 (D12) ──[ 1 kΩ ]────────────────── 2N2222 B
```

- Base current ≈ (3.3 − 0.7) / 1 kΩ ≈ 2.6 mA from PA6
- LED current ≈ (5 − 1.3 − 0.2) / 47 Ω ≈ 75 mA (pulsed, 38 kHz, 33% duty)
- Result: the Daikin air-con turns on from the replayed COOL code; loopback receives 319/319 durations.

## Experiments

| Folder | What it does | Result |
|---|---|---|
| `01_ir_capture` | TIM2 input capture prints raw IR timings | Daikin ARC480A51: 319 durations, ~197 ms per press |
| `02_ir_replay` | Saves the last capture; B1 replays it via TIM3 38 kHz carrier + TIM5 segment timer | Air-con turns on from the replayed COOL code |

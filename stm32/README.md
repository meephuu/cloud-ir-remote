# STM32 firmware (NUCLEO-F411RE)

The STM32CubeIDE project goes in this folder.

## Pin plan (draft)

| Function | STM32 pin | Nucleo header | Peripheral |
|---|---|---|---|
| KY-022 IR receiver OUT | PA0 | A0 | TIM2 CH1 input capture, both edges, 1 MHz tick |
| KY-005 IR emitter S | PA6 | D12 | TIM3 CH1 PWM, ~38 kHz carrier, ~33% duty |
| IR mark/space timing | — | — | TIM4 update interrupt, 1 MHz tick |
| DHT11 DATA | PB5 | D4 | GPIO (output/input switching) + TIM10 as 1 µs counter |
| UART to ESP32 TX | PA9 | D8 | USART1, 115200 8N1 |
| UART to ESP32 RX | PA10 | D2 | USART1 |
| Debug serial | PA2 / PA3 | (ST-LINK USB) | USART2, 115200 8N1 |

All modules are powered from the Nucleo **3.3 V** pin, with GND to GND.

## Clock

- SYSCLK 100 MHz (HSI -> PLLM=8, PLLN=100, PLLP=/2), APB1 /2, APB2 /1, so all timer clocks run at 100 MHz.
- TIM2/TIM4/TIM10: PSC = 99 gives a 1 MHz tick (1 µs).
- TIM3 (carrier): PSC = 0, ARR = 2631 gives 38.0 kHz; CCR = 877 gives ~33% duty. CCR = 0 means carrier off.

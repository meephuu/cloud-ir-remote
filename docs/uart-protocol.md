# STM32 <-> ESP32 UART protocol (v0.2)

- **Link:** USART1 on the STM32 (PA9 TX, PA10 RX) <-> Serial1 on the ESP32-S3 (GPIO18 RX, GPIO17 TX), 115200 baud, 8N1, common GND.
- The STM32 accepts the **same commands on USART2** (the Nucleo's USB serial port), so either side can be tested from a terminal (Tera Term / Serial Monitor). A reply always goes back to the port the command came from.
- **Framing:** one message per line, ASCII, fields separated by `,`.
  - The STM32 ends its lines with `\r\n`. The ESP32 should read until `\n` and then `trim()`.
  - The STM32 accepts `\r`, `\n` or `\r\n` as the end of a command, and ignores empty lines.
- **Debug lines** start with `# ` and are only sent on USART2. They are for humans; the ESP32 never sees them.
- **Numbers:** integers only. Temperature is x10 (`285` = 28.5 °C).
- **IR codes:** durations in microseconds, alternating **mark** (IR on) / **space** (IR off), starting with a mark. 38 kHz carrier. **Max 600 durations per code.** A Daikin air-con code is 319 durations, about 2 KB of text, so the ESP32 must use a bigger receive buffer: `Serial1.setRxBufferSize(4096);` before `Serial1.begin(...)`.
- **One command at a time:** send a command, wait for its reply, then send the next. A line that arrives while the STM32 is still busy with the previous command is dropped.

## STM32 -> ESP32

| Message | When |
|---|---|
| `READY` | STM32 booted (sent on both ports) |
| `PONG` | Reply to `PING` |
| `CODE,<n>,<t1>,...,<tn>` | Reply to `LEARN`: the captured code |
| `ACK,SEND` | Reply to `SEND`, sent when the transmission has **finished** (~0.2 s for an air-con code) |
| `ACK,CANCEL` | Reply to `CANCEL` |
| `ENV,<temp_x10>,<hum>` | Periodic sensor reading, e.g. `ENV,285,62` *(coming with the DHT11 step)* |
| `FIRED` | The automation rule sent its code *(coming later)* |

### Errors

| Message | Meaning |
|---|---|
| `ERR,LEARN,TIMEOUT` | No IR signal within 10 s of `LEARN` |
| `ERR,LEARN,TOO_LONG` | The signal had more than 600 durations |
| `ERR,SEND,BUSY` | Still transmitting the previous code |
| `ERR,SEND,FORMAT` | Bad `SEND` line (wrong count, non-numbers, n = 0 or > 600) |
| `ERR,LINE,TOO_LONG` | Line longer than the STM32's 5000-byte buffer |
| `ERR,UNKNOWN` | Unknown command |

## ESP32 -> STM32

| Message | Meaning |
|---|---|
| `PING` | Link check |
| `LEARN` | Wait up to 10 s for one IR signal; reply `CODE,...` or `ERR,LEARN,...` |
| `CANCEL` | Stop learning |
| `SEND,<n>,<t1>,...,<tn>` | Transmit this IR code; reply `ACK,SEND` when done |
| `RULE,<threshold_x10>,<0/1>,<n>,<t1>,...,<tn>` | Automation rule *(coming later)* |

## Example session

```
-> PING
<- PONG
-> LEARN
   (user taps the remote's COOL button)
<- CODE,319,486,403,401,482,...,426
-> SEND,319,486,403,401,482,...,426
<- ACK,SEND
```

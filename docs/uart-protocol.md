# STM32 <-> ESP32 UART protocol (draft v0.1)

- **Link:** USART1 on the STM32 (PA9 TX, PA10 RX) <-> Serial1 on the ESP32-S3 (GPIO18 RX, GPIO17 TX), 115200 baud, 8N1.
- **Framing:** one message per line, ASCII text, fields separated by `,`, ending with `\n`. A line can be read and typed by hand in a serial monitor, which makes debugging easy.
- **Numbers:** integers only, to avoid `printf("%f")` on the STM32. Temperature is sent x10 (`285` = 28.5 °C).
- **IR codes:** a list of durations in microseconds, alternating **mark** (carrier on) and **space** (carrier off), always starting with a mark. Carrier is fixed at 38 kHz. Maximum 600 durations per code (enough for air-con remotes).

## STM32 -> ESP32

| Message | Meaning |
|---|---|
| `READY` | STM32 booted |
| `PONG` | Reply to `PING` |
| `ENV,<temp_x10>,<hum>` | Periodic sensor reading, e.g. `ENV,285,62` |
| `CODE,<n>,<t1>,<t2>,...,<tn>` | Learned IR code, e.g. `CODE,4,9000,4500,560,560` |
| `ACK,<command>` | Command done, e.g. `ACK,SEND` |
| `ERR,<command>,<reason>` | Command failed, e.g. `ERR,LEARN,TIMEOUT` |
| `FIRED` | The automation rule sent its code |

## ESP32 -> STM32

| Message | Meaning |
|---|---|
| `PING` | Link check |
| `LEARN` | Wait for one IR signal (10 s timeout), reply with `CODE` or `ERR,LEARN,TIMEOUT` |
| `CANCEL` | Stop learning |
| `SEND,<n>,<t1>,...,<tn>` | Transmit this IR code, reply with `ACK,SEND` |
| `RULE,<threshold_x10>,<0/1>,<n>,<t1>,...,<tn>` | Set the automation rule: threshold, enabled, and the code to send. The STM32 keeps it in RAM. |

*Draft: change it together as the implementation develops.*

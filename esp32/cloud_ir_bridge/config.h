#pragma once

// ---- UART link to the STM32 (docs/uart-protocol.md) ----
#define STM32_RX_PIN 18          // ESP32 RX  <- STM32 PA9  (TX)
#define STM32_TX_PIN 17          // ESP32 TX  -> STM32 PA10 (RX)
#define STM32_BAUD 115200
#define STM32_RX_BUFFER 4096     // one air-con code is a ~2 KB line; the default 256 B would cut it
#define UART_LINE_MAX 5200            // longest line we accept (STM32 limit is 5000)
#define MAX_DURATIONS 600

// ---- Timing ----
#define POLL_INTERVAL_MS 1000          // how often to look for new commands in Firebase
#define HEARTBEAT_MS 10000             // how often to write /device/lastSeen
#define SEND_REPLY_TIMEOUT_MS 4000     // wait this long for ACK,SEND
#define LEARN_REPLY_TIMEOUT_MS 13000   // STM32 listens 10 s, plus a margin
#define COMMAND_MAX_AGE_MS 60000UL     // ignore commands older than this (sent while we were offline)
#define ENV_LATEST_MIN_MS 5000         // write /env/latest at most this often
#define ENV_HISTORY_MS (5UL * 60UL * 1000UL)  // one /env/history point every 5 minutes
#define WIFI_RETRY_MS 5000

// ---- Automation rule ----
// The STM32 does not understand RULE yet (it answers ERR,UNKNOWN).
// Set to 1 once stm32/ supports "RULE,<threshold_x10>,<0/1>,<n>,<t1>,...".
#define FORWARD_RULE_TO_STM32 0
#define RULE_POLL_MS 5000

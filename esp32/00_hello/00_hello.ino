// Step 2.1: check the board, the cable and the Serial Monitor.
// Board: "ESP32S3 Dev Module". Serial Monitor: 115200 baud.
// Prints a line every second; the number keeps going up.

void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 3000) {}  // wait for the USB serial port (native USB only)
  Serial.println();
  Serial.println("Hello from the ESP32-S3!");
  Serial.printf("Chip: %s rev %d, %d cores, %lu MHz\n", ESP.getChipModel(), ESP.getChipRevision(), ESP.getChipCores(),
                (unsigned long)ESP.getCpuFreqMHz());
  Serial.printf("Flash: %lu MB, PSRAM: %lu KB\n", (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)),
                (unsigned long)(ESP.getPsramSize() / 1024));
}

void loop() {
  static unsigned long count = 0;
  Serial.printf("alive %lu\n", count++);
  delay(1000);
}

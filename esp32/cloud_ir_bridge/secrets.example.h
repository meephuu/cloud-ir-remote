#pragma once
// Copy this file to secrets.h (same folder) and fill it in.
// secrets.h is in .gitignore: the repo is public, never commit real passwords.

// 2.4 GHz Wi-Fi only (the ESP32 cannot see 5 GHz networks).
// University Wi-Fi with a username + password login (WPA2-Enterprise) will not work:
// use a phone hotspot or home Wi-Fi.
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Firebase console > Realtime Database > Data: the URL shown at the top. No trailing slash.
#define FIREBASE_DB_URL "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app"

// Leave empty while web/database.rules.json allows open access.
// If you add Firebase Authentication later, put an ID token or database secret here.
#define FIREBASE_AUTH ""

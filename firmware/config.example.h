#ifndef TWIN_CONFIG_H
#define TWIN_CONFIG_H

// ==============================================================================
// DIGITAL TWIN ATHLETE - WEARABLE HARDWARE CONFIGURATION TEMPLATE
// Copy this file to "config.h" in your firmware folder and customize credentials.
// Notice: config.h is gitignored to protect your private Wi-Fi and API keys.
// ==============================================================================

// 1. Wi-Fi Network Credentials (2.4 GHz only)
#define WIFI_SSID       "YOUR_WIFI_NAME"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// 2. TwinAthlete Server Endpoint
#define SERVER_URL      "http://192.168.1.5:5000/api/esp32/telemetry"

// 3. Hardware Device Identity (e.g. ESP32-ATHLETE-01 or ESP32-MAX30100)
#define DEVICE_ID       "ESP32-ATHLETE-01"

// 4. API Authentication Key (Matches TWIN_API_KEYS on server)
#define TWIN_API_KEY    "twin-device-api-key"

#endif // TWIN_CONFIG_H

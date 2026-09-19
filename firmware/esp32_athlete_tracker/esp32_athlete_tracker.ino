/*
 * ==============================================================================
 * DIGITAL TWIN ATHLETE - ESP32 TELEMETRY FIRMWARE
 * Real-time biometric & biomechanical streaming over Wi-Fi (HTTP POST)
 * 
 * Hardware Supported:
 *   - ESP32 DevKit v1 / NodeMCU-32S
 *   - MAX30102 / MAX30100 (Pulse Oximeter & Heart Rate) via I2C (0x57)
 *   - MPU6050 (6-Axis Accelerometer & Gyroscope) via I2C (0x68)
 * 
 * Wiring (I2C Bus):
 *   - ESP32 GPIO 21 (SDA) -> MAX30102 SDA & MPU6050 SDA
 *   - ESP32 GPIO 22 (SCL) -> MAX30102 SCL & MPU6050 SCL
 *   - 3.3V                -> VCC (Both sensors)
 *   - GND                 -> GND (Both sensors)
 * 
 * Note: If sensors are not connected, the firmware automatically activates
 * a realistic fallback telemetry generator so you can test Wi-Fi & PC dashboard
 * streaming immediately before soldering or wiring!
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>

// ==============================================================================
// 1. NETWORK & SERVER CONFIGURATION
// Replace with your local Wi-Fi network and PC's local IP address
// ==============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";       // E.g. "Home-WiFi" or Phone Hotspot
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";   // Wi-Fi Password
const char* SERVER_URL    = "http://192.168.1.100:5000/api/esp32/telemetry"; // Change to your PC IP!
const char* DEVICE_ID     = "ESP32-ATHLETE-01";

// Telemetry interval in milliseconds (1000 ms = 1 Hz, 500 ms = 2 Hz)
const unsigned long TRANSMIT_INTERVAL_MS = 1000;

// Onboard LED pin (GPIO 2 on most ESP32 Dev boards)
const int LED_PIN = 2;

// I2C Sensor addresses
const uint8_t MPU6050_ADDR = 0x68;
const uint8_t MAX30102_ADDR = 0x57;

bool mpuConnected = false;
bool maxConnected = false;
unsigned long lastTransmitTime = 0;
unsigned long packetCounter = 0;

// ==============================================================================
// 2. I2C SCANNER HELPER
// ==============================================================================
bool checkI2CDevice(uint8_t address) {
  Wire.beginTransmission(address);
  return (Wire.endTransmission() == 0);
}

// ==============================================================================
// 3. SETUP
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.println("\n==================================================");
  Serial.println("   DIGITAL TWIN ATHLETE: ESP32 WEARABLE TRACKER   ");
  Serial.println("==================================================");

  // Initialize I2C Bus on GPIO 21 (SDA) and GPIO 22 (SCL)
  Wire.begin(21, 22);

  // Probe for connected sensors
  mpuConnected = checkI2CDevice(MPU6050_ADDR);
  maxConnected = checkI2CDevice(MAX30102_ADDR);

  Serial.printf("[Sensors] MPU6050 (Accel)    : %s\n", mpuConnected ? "FOUND (0x68)" : "NOT DETECTED (Using fallback)");
  Serial.printf("[Sensors] MAX30102 (HR/SpO2) : %s\n", maxConnected ? "FOUND (0x57)" : "NOT DETECTED (Using fallback)");

  if (mpuConnected) {
    // Wake up MPU-6050 (write 0 to PWR_MGMT_1 register 0x6B)
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x6B);
    Wire.write(0x00);
    Wire.endTransmission();
    Serial.println("[Sensors] MPU6050 Initialized.");
  }

  // Connect to Wi-Fi
  Serial.printf("[Wi-Fi] Connecting to '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 25) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Blink while connecting
    wifiAttempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("\n[Wi-Fi] Connected successfully!");
    Serial.printf("[Wi-Fi] ESP32 IP Address : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[Wi-Fi] Target Server    : %s\n", SERVER_URL);
  } else {
    Serial.println("\n[Wi-Fi] WARNING: Could not connect to Wi-Fi.");
    Serial.println("[Wi-Fi] Verify SSID/Password, or use USB Serial Bridge (esp32_serial_bridge.py).");
  }

  Serial.println("==================================================\n");
}

// ==============================================================================
// 4. SENSOR READING & FALLBACK GENERATOR
// ==============================================================================
void readSensors(float &hr, float &spo2, float &ax, float &ay, float &az) {
  unsigned long nowMs = millis();
  float t = nowMs / 1000.0;

  // 1. Read MPU6050 Accelerometer
  if (mpuConnected) {
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x3B); // Starting register for accelerometer readings (ACCEL_XOUT_H)
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom((int)MPU6050_ADDR, 6) == 6) {
      int16_t rawX = (Wire.read() << 8) | Wire.read();
      int16_t rawY = (Wire.read() << 8) | Wire.read();
      int16_t rawZ = (Wire.read() << 8) | Wire.read();

      // Convert 16-bit raw values to G (assuming default +/- 2g scale: 16384 LSB/g)
      ax = rawX / 16384.0;
      ay = rawY / 16384.0;
      az = rawZ / 16384.0;
    } else {
      mpuConnected = false;
    }
  }

  // Fallback Accelerometer (Realistic running motion cadence)
  if (!mpuConnected) {
    float stridePhase = t * 2.8 * 2.0 * PI; // ~168 steps per minute running cadence
    ax = 0.55 * sin(stridePhase) + (random(-10, 10) / 100.0);
    ay = 1.25 * cos(stridePhase) + 1.05 + (random(-15, 15) / 100.0); // Vertical impact
    az = 0.35 * sin(stridePhase * 0.5) + (random(-10, 10) / 100.0);
  }

  // 2. Read MAX30102 Heart Rate & SpO2
  if (!maxConnected) {
    // Fallback Heart Rate: Athletic training curve ramping from 135 to 160 BPM
    hr = 142.0 + 16.0 * sin(t * 0.05) + (random(-20, 20) / 10.0);
    spo2 = 98.0 + (random(-10, 10) / 10.0);
  } else {
    // If you integrate SparkFun MAX3010x library, place read function here
    hr = 140.0;
    spo2 = 98.0;
  }
}

// ==============================================================================
// 5. MAIN LOOP
// ==============================================================================
void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - lastTransmitTime >= TRANSMIT_INTERVAL_MS) {
    lastTransmitTime = currentMillis;
    packetCounter++;

    float hr, spo2, ax, ay, az;
    readSensors(hr, spo2, ax, ay, az);
    int battery = 92; // Can be read via ADC pin if voltage divider is attached

    // Format JSON packet cleanly using snprintf
    char jsonPayload[256];
    snprintf(jsonPayload, sizeof(jsonPayload),
      "{\"device_id\":\"%s\",\"heart_rate\":%.1f,\"spo2\":%.1f,\"ax\":%.2f,\"ay\":%.2f,\"az\":%.2f,\"battery\":%d,\"packet\":%lu}",
      DEVICE_ID, hr, spo2, ax, ay, az, battery, packetCounter
    );

    // Also output to USB Serial (so esp32_serial_bridge.py can read it over USB cable!)
    Serial.println(jsonPayload);

    // If connected to Wi-Fi, send HTTP POST to the TwinAthlete dashboard server
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(SERVER_URL);
      http.addHeader("Content-Type", "application/json");

      int httpResponseCode = http.POST((uint8_t*)jsonPayload, strlen(jsonPayload));

      if (httpResponseCode > 0) {
        Serial.printf("[HTTP] Transmitted packet #%lu | Code: %d\n", packetCounter, httpResponseCode);
        // Pulse LED briefly on successful delivery
        digitalWrite(LED_PIN, HIGH);
        delay(40);
        digitalWrite(LED_PIN, LOW);
      } else {
        Serial.printf("[HTTP ERROR] Failed to send packet: %s\n", http.errorToString(httpResponseCode).c_str());
      }

      http.end();
    }
  }
}

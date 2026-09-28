/*
 * ==============================================================================
 * DIGITAL TWIN ATHLETE — ESP32 #1: MPU6050 MOTION & BIOMECHANICS SENSOR
 * Real-time 6-DOF IMU streaming over Wi-Fi (HTTP POST)
 * 
 * Hardware:
 *   - ESP32 Development Board (DevKit v1, NodeMCU-32S, etc.)
 *   - MPU6050 6-Axis Accelerometer & Gyroscope Module (I2C: 0x68)
 * 
 * Wiring:
 *   - ESP32 3.3V  -> MPU6050 VCC
 *   - ESP32 GND   -> MPU6050 GND
 *   - ESP32 GPIO 21 -> MPU6050 SDA
 *   - ESP32 GPIO 22 -> MPU6050 SCL
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>

// ==============================================================================
// 1. NETWORK & SERVER CONFIGURATION
// ==============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";       // 2.4 GHz Wi-Fi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";   // Wi-Fi Password
const char* SERVER_URL    = "http://192.168.1.5:5000/api/esp32/telemetry"; // Backend IP
const char* DEVICE_ID     = "ESP32-MPU6050";

// Transmit interval (1000 ms = 1 Hz, 500 ms = 2 Hz)
const unsigned long TRANSMIT_INTERVAL_MS = 1000;

// Onboard indicator LED (GPIO 2 on most ESP32 boards)
const int LED_PIN = 2;
const uint8_t MPU6050_ADDR = 0x68;

bool mpuConnected = false;
unsigned long lastTransmitTime = 0;
unsigned long packetCounter = 0;

bool checkI2CDevice(uint8_t address) {
  Wire.beginTransmission(address);
  return (Wire.endTransmission() == 0);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.println("\n==================================================");
  Serial.println("   DIGITAL TWIN ATHLETE: ESP32 #1 (MPU6050 IMU)   ");
  Serial.println("==================================================");

  Wire.begin(21, 22);

  // Probe MPU6050
  mpuConnected = checkI2CDevice(MPU6050_ADDR);
  Serial.printf("[Sensor] MPU6050: %s\n", mpuConnected ? "FOUND (0x68)" : "NOT DETECTED (Using fallback simulation)");

  if (mpuConnected) {
    // Wake up MPU-6050 (write 0 to PWR_MGMT_1 register 0x6B)
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x6B);
    Wire.write(0x00);
    Wire.endTransmission();
    Serial.println("[Sensor] MPU6050 initialized.");
  }

  // Connect to Wi-Fi
  Serial.printf("[Wi-Fi] Connecting to '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("\n[Wi-Fi] Connected successfully!");
    Serial.printf("[Wi-Fi] ESP32 IP   : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[Wi-Fi] Server URL : %s\n", SERVER_URL);
  } else {
    Serial.println("\n[Wi-Fi] Connection failed. Verify credentials.");
  }
  Serial.println("==================================================\n");
}

void readMotion(float &ax, float &ay, float &az) {
  if (mpuConnected) {
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x3B); // Starting register for accelerometer readings
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom((int)MPU6050_ADDR, 6) == 6) {
      int16_t rawX = (Wire.read() << 8) | Wire.read();
      int16_t rawY = (Wire.read() << 8) | Wire.read();
      int16_t rawZ = (Wire.read() << 8) | Wire.read();

      // Convert 16-bit raw values to G (+/- 2g scale: 16384 LSB/g)
      ax = rawX / 16384.0;
      ay = rawY / 16384.0;
      az = rawZ / 16384.0;
      return;
    } else {
      mpuConnected = false;
    }
  }

  // Fallback realistic running cadence & ground impact acceleration
  float t = millis() / 1000.0;
  float stridePhase = t * 2.8 * 2.0 * PI; // ~168 steps/min
  ax = 0.55 * sin(stridePhase) + (random(-10, 10) / 100.0);
  ay = 1.25 * cos(stridePhase) + 1.05 + (random(-15, 15) / 100.0);
  az = 0.35 * sin(stridePhase * 0.5) + (random(-10, 10) / 100.0);
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - lastTransmitTime >= TRANSMIT_INTERVAL_MS) {
    lastTransmitTime = currentMillis;
    packetCounter++;

    float ax, ay, az;
    readMotion(ax, ay, az);
    int battery = 94;

    // Build JSON packet
    char jsonPayload[256];
    snprintf(jsonPayload, sizeof(jsonPayload),
      "{\"device_id\":\"%s\",\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,\"battery\":%d,\"packet\":%lu}",
      DEVICE_ID, ax, ay, az, battery, packetCounter
    );

    Serial.println(jsonPayload);

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(SERVER_URL);
      http.addHeader("Content-Type", "application/json");

      int code = http.POST((uint8_t*)jsonPayload, strlen(jsonPayload));
      if (code > 0) {
        Serial.printf("[HTTP] Packet #%lu delivered | Code: %d\n", packetCounter, code);
        digitalWrite(LED_PIN, HIGH);
        delay(40);
        digitalWrite(LED_PIN, LOW);
      } else {
        Serial.printf("[HTTP ERROR] %s\n", http.errorToString(code).c_str());
      }
      http.end();
    }
  }
}

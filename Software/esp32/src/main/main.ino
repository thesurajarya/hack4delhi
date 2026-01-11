#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <driver/i2s.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <QMC5883LCompass.h>

// ===============================
// 1. NETWORK CONFIGURATION
// ===============================
const char* ssid = "One Plus Nord 3";        // <--- UPDATE THIS
const char* password = "hp97omltp";    // <--- UPDATE THIS
const char* mqtt_server = "broker.hivemq.com"; 
const char* node_id = "TRACK_SEC_42";

WiFiClient espClient;
PubSubClient client(espClient);

// ===============================
// 2. SENSOR PINS & OBJECTS
// ===============================

// I2C PINS (ADXL345 & QMC5883L)
#define SDA_PIN 21
#define SCL_PIN 22

// I2S MIC PINS (INMP441)
#define I2S_WS   26
#define I2S_SD   34
#define I2S_SCK  25
#define I2S_PORT I2S_NUM_0

// TILT SENSOR
#define TILT_PIN 35

// OBJECTS
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);
QMC5883LCompass compass;

// ===============================
// 3. I2S CONFIGURATION
// ===============================
void initINMP441() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000, // Good balance for vibration noise
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S_MSB,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT);
}

// ===============================
// 4. SETUP
// ===============================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // --- SENSOR INIT ---
  Wire.begin(SDA_PIN, SCL_PIN);
  pinMode(TILT_PIN, INPUT);

  Serial.println("Initializing Sensors...");

  if (!accel.begin()) {
    Serial.println("❌ ADXL345 Error");
    // In production, we might restart here, but for now continue
  }
  accel.setRange(ADXL345_RANGE_16_G);

  compass.init();
  compass.setMode(0x01, 0x0D, 0x00, 0x00); // Continuous measurement

  initINMP441();

  // --- WIFI INIT ---
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected");

  // --- MQTT INIT ---
  client.setServer(mqtt_server, 1883);
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    // Create a random client ID
    String clientId = "RailGuardClient-";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// ===============================
// 5. MAIN LOOP
// ===============================
void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  // --- 1. READ ACCELEROMETER ---
  sensors_event_t event;
  accel.getEvent(&event);
  
  float ax = event.acceleration.x;
  float ay = event.acceleration.y;
  float az = event.acceleration.z;
  
  // Calculate Magnitude & Pseudo-RMS
  // Note: Subtracting gravity (9.8) approx for Z is common, but raw mag is fine for AI
  float accel_mag = sqrt(ax*ax + ay*ay + az*az);
  float accel_roll_rms = accel_mag * 0.707; // Approximation for dashboard

  // --- 2. READ MAGNETOMETER ---
  compass.read();
  float mx = compass.getX();
  float my = compass.getY();
  float mz = compass.getZ();
  float mag_norm = sqrt(mx*mx + my*my + mz*mz);

  // --- 3. READ TILT ---
  int tilt_status = digitalRead(TILT_PIN); // LOW often means 'tilted' or 'vibration' depending on sensor

  // --- 4. READ MICROPHONE (Average Volume) ---
  int32_t mic_sample = 0;
  size_t bytes_read = 0;
  // Read a small batch to get average noise level
  int32_t sample_buffer[64]; 
  i2s_read(I2S_PORT, &sample_buffer, sizeof(sample_buffer), &bytes_read, 100);
  
  long mic_sum = 0;
  for(int i=0; i<64; i++) {
     mic_sum += abs(sample_buffer[i] >> 14); // Reduce sensitivity/bit-depth for noise level
  }
  float mic_noise_level = mic_sum / 64.0;

  // --- 5. PREPARE JSON PACKET ---
  StaticJsonDocument<512> doc;
  
  doc["node_id"] = node_id;
  doc["timestamp"] = millis();

  // Primary Features for AI
  doc["accel_mag"] = accel_mag;
  doc["accel_roll_rms"] = accel_roll_rms;
  doc["mag_norm"] = mag_norm;
  doc["mic_level"] = mic_noise_level;
  doc["tilt_alert"] = (tilt_status == LOW); // Boolean flag

  // Simulated Env Data (Since you don't have BME280)
  // We keep this to ensure the dashboard graphs don't crash
  doc["temperature"] = 28.5; 
  doc["humidity"] = 60.0;
  doc["pressure"] = 1013.0;

  // GPS (Fixed for this node)
  doc["latitude"] = 28.6139;
  doc["longitude"] = 77.2090;

  // Serialize & Send
  char buffer[512];
  size_t n = serializeJson(doc, buffer);

  client.publish("railway/sensor/1", buffer, n);

  // Debug Print
  Serial.print("Sent -> Vib: "); Serial.print(accel_mag);
  Serial.print(" | Mag: "); Serial.print(mag_norm);
  Serial.print(" | Mic: "); Serial.println(mic_noise_level);

  delay(500); // 2Hz Transmission
}
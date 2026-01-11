const axios = require('axios');
const config = require('../config/config');

async function getPrediction(sensorData) {
    try {
        const payload = {
            node_id: sensorData.node_id || "UNKNOWN",
            timestamp: sensorData.timestamp || Date.now(),
            
            // GPS
            latitude: sensorData.latitude || 0.0,
            longitude: sensorData.longitude || 0.0,
            
            // Raw Sensors
            accel_x: sensorData.accel_x || 0.0,
            accel_y: sensorData.accel_y || 0.0,
            accel_z: sensorData.accel_z || 0.0,
            mag_x: sensorData.mag_x || 0.0,
            mag_y: sensorData.mag_y || 0.0,
            mag_z: sensorData.mag_z || 0.0,
            
            // New Fields
            heading: sensorData.heading || 0.0,
            tilt: sensorData.tilt !== undefined ? sensorData.tilt : 1,
            tilt_alert: sensorData.tilt_alert || false,
            
            // Computed Features
            accel_mag: sensorData.accel_mag || 0.0,
            accel_roll_rms: sensorData.accel_roll_rms || 0.0,
            mag_norm: sensorData.mag_norm || 0.0,
            mic_level: sensorData.mic_level || 0.0,
            
            // Environment
            temperature: sensorData.temperature || 0.0,
            humidity: sensorData.humidity || 0.0,
            pressure: sensorData.pressure || 0.0
        };

        // --- ADDING TIMEOUT (Prevents Server Freeze) ---
        const response = await axios.post(config.ai.url, payload, { timeout: 2000 }); 
        return response.data;

    } catch (error) {
        // Log but don't crash
        // console.error("⚠️ AI Skipped:", error.message);
        
        // Return safe fallback so dashboard still gets raw data
        return { 
            is_anomaly: false, 
            severity: "LOW", 
            anomaly_score: 0,
            ai_decision: { note: "AI Timeout/Error" }
        };
    }
}

module.exports = { getPrediction };
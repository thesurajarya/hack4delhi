const mqtt = require('mqtt');
const config = require('../config/config');
const aiService = require('../ai/aiService');
const { broadcastUpdate } = require('../socket/socket');
const { sendCriticalAlert } = require('../services/alertService');

const connectMQTT = (onAnomalyCallback) => {
    // Robust connection options
    const client = mqtt.connect(config.mqtt.brokerUrl, {
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        keepalive: 60
    });

    client.on('connect', () => {
        console.log('✅ Connected to MQTT Broker');
        client.subscribe(config.mqtt.topic, (err) => {
            if (!err) console.log(`📡 Listening on: ${config.mqtt.topic}`);
        });
    });

    client.on('error', (err) => console.error("⚠️ MQTT Error:", err.message));
    client.on('offline', () => console.warn("🔌 MQTT Offline"));

    client.on('message', async (topic, message) => {
        try {
            // --- DEBUG: Print exactly what arrived ---
            const msgString = message.toString();
            
            // 1. Safety Check: Is it empty?
            if (!msgString || msgString.trim().length === 0) {
                console.warn("⚠️ Received EMPTY message. Ignoring.");
                return;
            }

            // 2. Parse Data
            let rawData;
            try {
                rawData = JSON.parse(msgString);
            } catch (jsonErr) {
                console.error("❌ JSON Parse Failed. Received:", msgString);
                return; // Stop here if it's not valid JSON
            }
            
            // 3. BROADCAST RAW DATA IMMEDIATELY
            broadcastUpdate({ ...rawData, is_anomaly: false, processing: true });

            // 4. Get AI Prediction (Async)
            const aiResult = await aiService.getPrediction(rawData);
            
            // 5. Merge & Broadcast Final Result
            const enrichedData = {
                ...rawData,
                ...aiResult,
                processed_at: new Date().toISOString()
            };
            
            // Update Dashboard again
            broadcastUpdate(enrichedData);

            // 6. Handle Alerts
            if(enrichedData.is_anomaly) {
                console.log(`🚨 ANOMALY: ${enrichedData.node_id} | Score: ${enrichedData.anomaly_score}`);
                sendCriticalAlert(enrichedData).catch(e => console.error("Email Error:", e.message));

                const alertPacket = {
                    id: Date.now(),
                    nodeId: enrichedData.node_id,
                    severity: enrichedData.severity || 'HIGH',
                    timestamp: enrichedData.timestamp || Date.now(),
                    lat: enrichedData.latitude, 
                    lng: enrichedData.longitude,
                    status: 'OPEN',
                    isConstruction: false,
                    anomaly_score: enrichedData.anomaly_score
                };
                
                if (onAnomalyCallback) onAnomalyCallback(alertPacket);
            }
        } catch (err) {
            console.error("❌ Message Loop Error:", err.message);
        }
    });

    return client;
};

module.exports = { connectMQTT };
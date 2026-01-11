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
            // 1. Parse Data
            const rawData = JSON.parse(message.toString());
            
            // --- CRITICAL FIX: BROADCAST RAW DATA IMMEDIATELY ---
            // This ensures the graph NEVER freezes, even if AI is slow.
            // We send a temporary packet first.
            broadcastUpdate({ ...rawData, is_anomaly: false, processing: true });

            // 2. Get AI Prediction (Async)
            const aiResult = await aiService.getPrediction(rawData);
            
            // 3. Merge & Broadcast Final Result
            const enrichedData = {
                ...rawData,
                ...aiResult,
                processed_at: new Date().toISOString()
            };
            
            // Update Dashboard again with Anomaly Info
            broadcastUpdate(enrichedData);

            // 4. Handle Alerts (Non-Blocking)
            if(enrichedData.is_anomaly) {
                console.log(`🚨 ANOMALY: ${enrichedData.node_id} | Score: ${enrichedData.anomaly_score}`);
                
                // Fire Email (don't await - let it run in background)
                sendCriticalAlert(enrichedData).catch(e => console.error("Email Error:", e.message));

                // Format for Alert Feed
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
                
                // Trigger Frontend Alert (Sound/Red Marker)
                if (onAnomalyCallback) {
                    try {
                        onAnomalyCallback(alertPacket);
                    } catch (cbErr) {
                        console.error("Callback Error:", cbErr.message);
                    }
                }
            }
        } catch (err) {
            console.error("❌ Message Loop Error:", err.message);
        }
    });

    return client;
};

module.exports = { connectMQTT };
const mqtt = require('mqtt');
const config = require('../config/config');
const aiService = require('../ai/aiService');
const { broadcastUpdate } = require('../socket/socket');
const { sendCriticalAlert } = require('../services/alertService');

// Cooldown to prevent database spam (5 seconds)
const ALERT_COOLDOWN = 5000; 
let lastAlertTime = 0;

const connectMQTT = (onAnomalyCallback) => {
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

    client.on('message', async (topic, message) => {
        try {
            const msgString = message.toString();
            if (!msgString || msgString.trim().length === 0) return;

            // 1. Parse Data
            const rawData = JSON.parse(msgString);
            
            // 2. Broadcast Raw Data (Live Graph) - ALWAYS do this
            broadcastUpdate({ ...rawData, is_anomaly: false, processing: true });

            // 3. Get AI Prediction
            const aiResult = await aiService.getPrediction(rawData);
            
            // 4. Merge Data
            const enrichedData = {
                ...rawData,
                ...aiResult,
                processed_at: new Date().toISOString()
            };
            
            // 5. Update Dashboard with new Score - ALWAYS do this
            broadcastUpdate(enrichedData);

            // 6. Handle Alerts (WITH COOLDOWN FIX)
            if(enrichedData.is_anomaly) {
                const now = Date.now();
                
                // --- THE CRITICAL FIX IS HERE ---
                if (now - lastAlertTime > ALERT_COOLDOWN) {
                    
                    // A. Update Timer
                    lastAlertTime = now;

                    // B. Log & Process
                    console.log(`🚨 ANOMALY: ${enrichedData.node_id} | Score: ${enrichedData.anomaly_score}`);
                    
                    // C. Trigger Database Save & Frontend Alert (ONLY HERE)
                    if (onAnomalyCallback) {
                        onAnomalyCallback(enrichedData);
                    }

                    // D. Send Email (Non-blocking)
                    sendCriticalAlert(enrichedData).catch(e => console.error("Email Error:", e.message));

                } else {
                    // E. Suppress
                    console.log(`⏳ Alert suppressed for ${enrichedData.node_id} (Cooldown active)`);
                }
            }
        } catch (err) {
            console.error("❌ Message Loop Error:", err.message);
        }
    });

    return client;
};

module.exports = { connectMQTT };
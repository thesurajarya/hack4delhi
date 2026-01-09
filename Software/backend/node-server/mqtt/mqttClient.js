const mqtt = require('mqtt');
const config = require('../config/config');
const aiService = require('../ai/aiService');
const { broadcastUpdate } = require('../socket/socket');

const connectMQTT = (onAnomalyCallback) => {
    const client = mqtt.connect(config.mqtt.brokerUrl);

    client.on('connect', () => {
        console.log('✅ Connected to MQTT Broker');
        client.subscribe(config.mqtt.topic);
    });

    client.on('message', async (topic, message) => {
        try {
            const rawData = JSON.parse(message.toString());
            
            // 1. Get AI Decision
            const aiResult = await aiService.getPrediction(rawData);
            
            // 2. Merge Data
            const enrichedData = {
                ...rawData,
                ...aiResult,
                processed_at: new Date().toISOString()
            };

            // 3. Push to Frontend (Live Graph)
            broadcastUpdate(enrichedData);

            // 4. Handle Anomaly Logic
            if(enrichedData.is_anomaly) {
                console.log(`⚠️ ALERT: Tampering at ${rawData.node_id}`);
                
                // FIX: Execute the callback so index.js can save to JSON
                if (onAnomalyCallback) {
                    onAnomalyCallback(enrichedData);
                }
            }
        } catch (err) {
            console.error("Error processing MQTT message:", err.message);
        }
    });

    return client;
};

module.exports = { connectMQTT };
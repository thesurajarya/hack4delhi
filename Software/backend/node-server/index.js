const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser'); 
const { initSocket } = require('./socket/socket');
const { connectMQTT } = require('./mqtt/mqttClient');
const dataController = require('./controllers/dataController');

const app = express();
app.use(cors());
app.use(bodyParser.json()); 

const server = http.createServer(app);
// Initialize Socket.io (Must be done before MQTT)
const io = initSocket(server);

// --- API ROUTES ---

// 1. Get all historical alerts (for map load)
app.get('/api/alerts', (req, res) => {
    res.json(dataController.readAlerts());
});

// 2. Mark as Construction
app.post('/api/alerts/mark-construction', (req, res) => {
    const { id } = req.body;
    const updated = dataController.markConstruction(id);
    if(updated) {
        io.emit('alert_update', updated); // Notify frontend immediately
        res.json({ success: true, alert: updated });
    } else {
        res.status(404).json({ error: "Alert not found" });
    }
});

// --- START SYSTEM ---

// Connect to MQTT and pass the "Anomaly Handler" callback
const mqttClient = connectMQTT((data) => {
    // FIX: Normalize the Node ID (Handle both 'nodeId' and 'node_id')
    const targetNodeId = data.nodeId || data.node_id;

    if (targetNodeId) {
        console.log(`Registering Incident: ${targetNodeId}`);
        
        // Use the severity calculated by Python (or fallback to MEDIUM)
        const severity = data.severity || "MEDIUM"; 
        
        // 1. Save to Database (JSON file)
        const savedAlert = dataController.addAlert(targetNodeId, severity);
        
        // 2. MERGE Data for Frontend
        // We must combine the Database ID with the Sensor Data (Lat/Lng) 
        // otherwise the map marker and table row won't appear.
        const broadcastPacket = {
            ...savedAlert,                 // Contains DB ID and Timestamp
            lat: data.lat || data.latitude || 28.6139, // Ensure Location exists
            lng: data.lng || data.longitude || 77.2090,
            anomaly_score: data.anomaly_score || 1.0,
            nodeId: targetNodeId           // Ensure Frontend gets 'nodeId'
        };
        
        // 3. Broadcast FULL alert object to Frontend
        io.emit('new_alert', broadcastPacket);
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`RailGuard Backend Active`);
    console.log(`API:    http://localhost:${PORT}`);
    console.log(`Socket: Enabled`);
    console.log(`==================================================\n`);
});
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
    // This runs ONLY when an anomaly is confirmed
    if (data.is_anomaly) {
        console.log(`📝 Registering Incident: ${data.node_id}`);
        
        // Use the severity calculated by Python (or fallback to MEDIUM)
        const severity = data.severity || "MEDIUM"; 
        
        // Save to Database (JSON file)
        const savedAlert = dataController.addAlert(data.node_id, severity);
        
        // Broadcast FULL alert object to Frontend (Shows Red Marker / Table Row)
        io.emit('new_alert', savedAlert);
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 RailGuard Backend Active`);
    console.log(`👉 API:    http://localhost:${PORT}`);
    console.log(`👉 Socket: Enabled`);
    console.log(`==================================================\n`);
});
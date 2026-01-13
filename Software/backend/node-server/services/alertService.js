require('dotenv').config(); // Load environment variables
const nodemailer = require('nodemailer');

// 1. Configure Email Transporter using .env variables
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // <--- Securely loaded
        pass: process.env.EMAIL_PASS  // <--- Securely loaded
    }
});

// 2. Anti-Spam Mechanism (Rate Limiting)
const alertCooldowns = new Map();
const COOLDOWN_TIME = 60 * 1000; // 1 Minute

const sendCriticalAlert = async (data) => {
    const nodeId = data.node_id;
    const now = Date.now();

    // Check cooldown
    if (alertCooldowns.has(nodeId)) {
        const lastAlertTime = alertCooldowns.get(nodeId);
        if (now - lastAlertTime < COOLDOWN_TIME) {
            console.log(`⏳ Alert suppressed for ${nodeId} (Cooldown active)`);
            return;
        }
    }

    // Update cooldown
    alertCooldowns.set(nodeId, now);

    // 3. Compose Email
    const mailOptions = {
        from: `"RailGuard System" <${process.env.EMAIL_USER}>`,
        to: process.env.ALERT_RECEIVER, // <--- Loaded from .env
        subject: `CRITICAL ALERT: Tampering Detected at ${nodeId}`,
        html: `
            <div style="font-family: Arial; border: 2px solid red; padding: 20px;">
                <h2 style="color: red;">⚠️ ANOMALY DETECTED</h2>
                <p><strong>Node ID:</strong> ${nodeId}</p>
                <p><strong>Severity:</strong> ${data.severity}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Location:</strong> <a href="http://maps.google.com/?q=${data.latitude},${data.longitude}">View on Map</a></p>
                <hr />
                <h3>Telemetry Snapshot:</h3>
                <ul>
                    <li>Vibration (Accel): ${data.accel_mag?.toFixed(3)} g</li>
                    <li>Magnetic Field: ${data.mag_norm?.toFixed(2)} µT</li>
                    <li>AI Confidence Score: ${data.anomaly_score?.toFixed(3)}</li>
                </ul>
                <br />
                <a href="http://localhost:5173" style="background: red; color: white; padding: 10px 20px; text-decoration: none;">OPEN DASHBOARD</a>
            </div>
        `
    };

    // 4. Send
    try {
        await transporter.sendMail(mailOptions);
        console.log(`==> Email Alert sent for ${nodeId}`);
    } catch (error) {
        console.error('==> Failed to send email:', error);
    }
};

module.exports = { sendCriticalAlert };
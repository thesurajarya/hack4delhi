module.exports = {
    mqtt: {
        brokerUrl: 'test.mosquitto.org', 
        topic: 'railway/sensor/+'
    },
    ai: {
        // CHANGED: Port 8000 -> 5000 (Matches your Python main.py)
        url: 'http://127.0.0.1:5000/predict'
    },
    server: {
        port: 3000
    },
    frontend: {
        origin: '*' // Allow all for hackathon simplicity
    }
};
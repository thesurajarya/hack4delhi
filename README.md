<div align="center">

  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/4/45/Indian_Railways_logo.svg/1200px-Indian_Railways_logo.svg.png" alt="Indian Railways" width="100" />
  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Emblem_of_India.svg/240px-Emblem_of_India.svg.png" alt="GOI" width="60" style="margin-left: 20px; margin-right: 20px;"/>
  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/1/1d/Make_In_India.png/800px-Make_In_India.png" alt="Make in India" width="120" />

<br/><br/>

# 🚆 RailGuard Command Center

### AI-Powered Real-Time Railway Sabotage Detection System

  <p>
    <a href="#-problem-statement">Problem</a> •
    <a href="#-system-architecture">Architecture</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-installation--setup">Setup</a> •
    <a href="#-how-to-run">Run</a>
  </p>

  <img src="https://img.shields.io/badge/Status-Prototype-orange?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/IoT-ESP32-blue?style=for-the-badge&logo=espressif" alt="ESP32" />
  <img src="https://img.shields.io/badge/AI-Isolation%20Forest-yellow?style=for-the-badge&logo=python" alt="AI" />
  <img src="https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Backend-Node.js-339933?style=for-the-badge&logo=nodedotjs" alt="Node" />

</div>

---

## 🚀 Problem Statement

Railway safety is critical, yet infrastructure is often compromised by sabotage, theft, or tampering. Traditional inspection methods are reactive and intermittent. **RailGuard** provides a **proactive** solution to:

- 🔍 **Detect** physical tampering (sawing, hammering, removal) in real-time.
- 🧠 **Analyze** multi-sensor data using Edge AI and Cloud AI.
- 🚨 **Alert** operators instantly via a geospatial dashboard.

---

## 🔄 System Architecture

The system follows a linear data pipeline from the physical edge to the operator dashboard.

```mermaid
graph LR
    A[ESP32 Node 📡] -->|MQTT| B(HiveMQ Broker ☁️)
    B -->|Subscribe| C{Node.js Backend ⚙️}
    C -->|HTTP Post| D[Python AI Service 🧠]
    D -->|Prediction| C
    C -->|Socket.io| E[React Dashboard 🖥️]
```

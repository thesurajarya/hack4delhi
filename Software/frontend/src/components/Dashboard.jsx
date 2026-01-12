import React, { useEffect, useState, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import L from "leaflet";
import io from "socket.io-client";
import axios from "axios";
import "leaflet/dist/leaflet.css";

// --- ICONS & ASSETS ---
const getIcon = (color) =>
  new L.DivIcon({
    className: "custom-marker",
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${
        color === "green" ? "#22c55e" : color === "yellow" ? "#eab308" : color === "red" ? "#ef4444" : "#64748b"
      }" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); width: 36px; height: 36px;">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="#ffffff"></circle>
      </svg>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });

const icons = {
  green: getIcon("green"),
  yellow: getIcon("yellow"),
  red: getIcon("red"),
  grey: getIcon("grey"),
};

// --- SOCKET CONFIGURATION ---
// IMPORTANT: If running Dashboard on a different laptop, replace 'localhost' with the Backend IP (e.g., '192.168.1.15')
const SOCKET_URL = "http://localhost:3000"; 
const API_URL = "http://localhost:3000/api/alerts";

// Initialize socket outside to maintain instance
const socket = io(SOCKET_URL, { 
    autoConnect: false,
    reconnection: true,        // Enable auto-reconnect
    reconnectionAttempts: 20,  // Keep trying
    reconnectionDelay: 1000    // Retry every 1s
});

export default function Dashboard() {
  // --- STATE ---
  const [mode, setMode] = useState("LIVE"); 
  const [nodes, setNodes] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());

  // UX State
  const [activeTab, setActiveTab] = useState("telemetry");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(50);

  // Logging State
  const [systemLogs, setSystemLogs] = useState([
    { id: 0, time: new Date().toLocaleTimeString(), type: "info", msg: "System Interface Loaded." },
  ]);

  const addLog = (msg, type = "info") => {
    setSystemLogs((prev) =>
      [{ id: Date.now(), time: new Date().toLocaleTimeString(), type, msg }, ...prev].slice(0, 50)
    );
  };

  // --- EFFECT: SOCKET & DATA HANDLING ---
  useEffect(() => {
    // 1. Reset Data on Mode Switch
    setNodes({});
    setAlerts([]);
    setTelemetry([]);
    setSystemLogs([]);
    addLog(`Switched to ${mode} MODE`, "warning");

    if (mode === "LIVE") {
      if (!socket.connected) socket.connect();
      fetchAlerts();

      // --- LISTENERS ---
      
      socket.on("connect", () => addLog("✅ Connected to Backend Stream", "success"));
      
      socket.on("disconnect", () => addLog("⚠️ Disconnected from Backend", "error"));
      
      socket.on("reconnect", () => addLog("🔄 Connection Restored", "success"));

      // A. LIVE SENSOR STREAM
      socket.on("sensor_update", (data) => {
        setLastHeartbeat(Date.now());
        
        // Update Node Status
        setNodes((prev) => ({
          ...prev,
          [data.node_id]: {
            lat: data.lat || data.latitude || 28.6139,
            lng: data.lng || data.longitude || 77.2090,
            lastSeen: data.timestamp,
            // Only change status if it's not already red (to prevent flickering)
            status: prev[data.node_id]?.status === 'red' ? 'red' : 'green',
            battery: 98, // Mock or add to packet if available
            rssi: -45,   // Mock or add to packet
          },
        }));

        // Update Graph Telemetry
        setTelemetry((prev) => {
          const newPoint = {
            time: new Date(data.timestamp).toLocaleTimeString(),
            node_id: data.node_id,
            accel_mag: data.accel_mag,
            accel_roll_rms: data.accel_roll_rms,
            mag_norm: data.mag_norm,
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressure,
            mic_level: data.mic_level,
            anomaly_score: data.anomaly_score,
          };
          return [...prev, newPoint].slice(-50); // Keep last 50 points
        });
      });

      // B. ALERTS (ANOMALY DETECTED)
      socket.on("new_alert", (newAlert) => {
        console.log("🔔 RECEIVED ALERT:", newAlert); // Debugging Log

        // 1. Play Sound (Browser needs user interaction first, but we try)
        try {
          const audio = new Audio("/alert.mp3");
          audio.play().catch((e) => console.log("Audio block (Click page to enable):", e));
        } catch (err) { console.error(err); }

        // 2. Normalize Data (Fix nodeId vs node_id mismatch)
        const normalizedAlert = {
            ...newAlert,
            id: newAlert.id || Date.now(),
            nodeId: newAlert.nodeId || newAlert.node_id || "UNKNOWN",
            lat: newAlert.lat || newAlert.latitude || 28.6139,
            lng: newAlert.lng || newAlert.longitude || 77.2090,
            status: newAlert.status || 'OPEN'
        };

        // 3. Update Table Data
        setAlerts((prev) => {
            // Avoid duplicates
            if (prev.find(a => a.id === normalizedAlert.id)) return prev;
            return [normalizedAlert, ...prev];
        });

        // 4. Update Map Marker Status
        setNodes((prev) => ({
          ...prev,
          [normalizedAlert.nodeId]: {
            ...prev[normalizedAlert.nodeId],
            status: normalizedAlert.severity === "HIGH" ? "red" : "yellow",
            lat: normalizedAlert.lat,
            lng: normalizedAlert.lng
          },
        }));

        addLog(`🚨 ANOMALY: Node ${normalizedAlert.nodeId} | Severity: ${normalizedAlert.severity}`, "error");
      });

      socket.on("alert_update", (updatedAlert) => {
        setAlerts((prev) => prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a)));
        if (updatedAlert.isConstruction) addLog(`Update: Alert ${updatedAlert.id} verified as CONSTRUCTION.`, "warning");
      });

    } else {
      // --- TEST MODE SIMULATION ---
      socket.disconnect();
      setNodes({
        "TEST-NODE-01": { lat: 28.6139, lng: 77.209, status: "green", battery: 98, rssi: -45 },
        "TEST-NODE-03": { lat: 28.612, lng: 77.208, status: "yellow", battery: 40, rssi: -80 },
      });
      addLog("Test Mode Initialized.", "info");
    }

    // Cleanup Listeners on Unmount or Mode Change
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("reconnect");
      socket.off("sensor_update");
      socket.off("new_alert");
      socket.off("alert_update");
    };
  }, [mode]);

  // --- EFFECT: TEST SIMULATION ---
  useEffect(() => {
    if (mode !== "TEST") return;
    const interval = setInterval(() => {
        const t = Date.now();
        const fakeData = {
            node_id: "TEST-NODE-01",
            timestamp: t,
            lat: 28.6139, lng: 77.209,
            accel_mag: Math.random() * 0.5,
            mag_norm: 45 + Math.cos(t/1000) * 5,
            temperature: 28, humidity: 60, pressure: 1013
        };
        // Reuse the same update logic manually for test mode
        setTelemetry(prev => [...prev, { time: new Date(t).toLocaleTimeString(), ...fakeData }].slice(-50));
    }, 500);
    return () => clearInterval(interval);
  }, [mode]);

  // --- ACTIONS ---
  const fetchAlerts = async () => {
    if (mode === "TEST") return;
    try {
      const res = await axios.get(API_URL);
      const mappedAlerts = res.data.map((a) => ({
        ...a,
        status: a.isConstruction ? "CONSTRUCTION" : a.status || "OPEN",
      }));
      setAlerts(mappedAlerts);
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    }
  };

  const handleResolutionChange = async (alertId, resolution) => {
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, status: resolution, isConstruction: resolution === "CONSTRUCTION" } : a));
    addLog(`User Action: Marking alert ${alertId} as ${resolution}`, "info");
    if (mode === "TEST") return;
    try {
      if (resolution === "CONSTRUCTION") await axios.post(`${API_URL}/mark-construction`, { id: alertId });
    } catch (err) { addLog(`Error syncing with backend`, "error"); }
  };

  const handleDispatch = (alertId) => {
    addLog(`DISPATCH: Team Alpha sent to Site ID: ${alertId}`, "success");
  };

  // --- DATA PROCESSING ---
  const filteredAlerts = useMemo(() => {
    if (filterStatus === "ALL") return alerts;
    if (filterStatus === "HIGH") return alerts.filter((a) => a.severity === "HIGH");
    if (filterStatus === "CONSTRUCTION") return alerts.filter((a) => a.status === "CONSTRUCTION");
    if (filterStatus === "CLOSED") return alerts.filter((a) => a.status === "CLOSED");
    return alerts;
  }, [alerts, filterStatus]);

  const displayTelemetry = useMemo(() => {
    let data = selectedNode ? telemetry.filter((t) => t.node_id === selectedNode) : telemetry;
    if (replayMode) {
      const endIndex = Math.floor((replayIndex / 100) * data.length);
      const startIndex = Math.max(0, endIndex - 20);
      return data.slice(startIndex, endIndex);
    }
    return data.slice(-20);
  }, [telemetry, selectedNode, replayMode, replayIndex]);

  const latestEnv = displayTelemetry.length > 0 ? displayTelemetry[displayTelemetry.length - 1] : {};
  const currentNode = selectedNode ? nodes[selectedNode] : null;

  // --- STYLES ---
  const styles = {
    container: { display: "flex", flexDirection: "column", height: "100vh", width: "100%", overflow: "hidden", fontFamily: "'Inter', sans-serif", backgroundColor: "#f8fafc" },
    header: { height: "60px", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", zIndex: 50 },
    statusBadge: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "20px" },
    body: { display: "flex", flex: 1, height: "calc(100vh - 60px)", overflow: "hidden", width: "100%" },
    leftPanel: { flex: "0 0 35%", height: "100%", position: "relative", borderRight: "1px solid #e2e8f0", zIndex: 10 },
    rightPanel: { flex: 1, display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#f1f5f9", overflowY: "auto", minWidth: 0 },
    kpiRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", padding: "16px 16px 0 16px" },
    kpiCard: { background: "white", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
    kpiLabel: { fontSize: "0.7rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" },
    kpiValue: { fontSize: "1.25rem", fontWeight: "bold", color: "#0f172a", marginTop: "4px" },
    alertSection: { margin: "16px", display: "flex", flexDirection: "column", backgroundColor: "white", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", overflow: "hidden", flexShrink: 0, maxHeight: "40%" },
    alertHeader: { padding: "12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", position: "sticky", top: 0, zIndex: 20 },
    filterPill: (active) => ({ padding: "4px 10px", borderRadius: "15px", fontSize: "0.7rem", fontWeight: "600", cursor: "pointer", background: active ? "#e0f2fe" : "#f1f5f9", color: active ? "#0284c7" : "#64748b", border: "none", marginRight: "8px" }),
    graphSection: { padding: "0 16px 20px 16px", display: "flex", flexDirection: "column", flex: 1 },
    tabHeader: { display: "flex", gap: "20px", borderBottom: "1px solid #e2e8f0", marginBottom: "15px", paddingBottom: "5px" },
    tab: (active) => ({ padding: "5px 0", cursor: "pointer", fontSize: "0.9rem", fontWeight: "600", color: active ? "#3b82f6" : "#94a3b8", borderBottom: active ? "2px solid #3b82f6" : "none" }),
    gridContainer: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
    chartCard: { background: "white", borderRadius: "12px", padding: "16px", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", height: "260px", display: "flex", flexDirection: "column" },
    footer: { height: "140px", backgroundColor: "#0f172a", color: "#e2e8f0", display: "flex", flexDirection: "column", borderTop: "4px solid #334155", flexShrink: 0, fontFamily: "'Courier New', monospace", zIndex: 60 },
    consoleBody: { flex: 1, overflowY: "auto", padding: "10px 15px", fontSize: "0.8rem", lineHeight: "1.6" },
    modeSelect: { padding: "6px 12px", borderRadius: "6px", border: "1px solid #475569", background: "#1e293b", color: "white", fontWeight: "bold", cursor: "pointer" },
    statusSelect: { padding: "4px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.75rem", color: "#475569", cursor: "pointer", background: "white" },
  };

  return (
    <div style={styles.container}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .status-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.7); } 70% { box-shadow: 0 0 0 6px rgba(74,222,128,0); } 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); } }
        .leaflet-container { background: #cbd5e1; }
        .btn-action { padding: 4px 8px; border: 1px solid #cbd5e1; background: white; border-radius: 4px; font-size: 0.7rem; color: #475569; cursor: pointer; transition: all 0.2s; }
        .btn-action:hover { background: #f1f5f9; color: #1e293b; border-color: #94a3b8; }
        .btn-dispatch { background: #fee2e2; color: #b91c1c; border-color: #fecaca; margin-left: 5px; }
        .btn-dispatch:hover { background: #fecaca; }
        input[type=range] { width: 100%; cursor: pointer; accent-color: #3b82f6; }
        .custom-marker { background: transparent; border: none; }
      `}</style>

      {/* HEADER */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "1.5rem" }}>🚄</span>
          <div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: "700" }}>RailGuard Command</h1>
            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Professional Operator Interface</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <select style={styles.modeSelect} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="LIVE">LIVE SENSORS</option>
            <option value="TEST">TEST MODE (SIM)</option>
          </select>
          <div style={styles.statusBadge}>
            <div className="status-dot" style={{ background: mode === "LIVE" ? "#4ade80" : "#f59e0b" }}></div>
            <span style={{ fontSize: "0.8rem", color: mode === "LIVE" ? "#4ade80" : "#f59e0b", fontWeight: "600" }}>
              {mode === "LIVE" ? "SYSTEM ACTIVE" : "SIMULATION"}
            </span>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div style={styles.body}>
        {/* LEFT: MAP */}
        <div style={styles.leftPanel}>
          <MapContainer center={[28.6139, 77.209]} zoom={13} zoomControl={false} style={{ height: "100%" }}>
            <TileLayer url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png" attribution="&copy; OpenRailwayMap" maxZoom={19} />
            {filteredAlerts.map((alert) => (
              <Marker key={`alert-${alert.id}`} position={[alert.lat || 0, alert.lng || 0]} icon={icons.red}>
                <Popup>
                  <div style={{ fontFamily: "Inter, sans-serif" }}>
                    <b style={{ color: "#ef4444" }}>🚨 ALERT</b><br />
                    Node: {alert.nodeId}<br />
                    Severity: {alert.severity}<br />
                    <hr style={{ margin: "8px 0", borderTop: "1px solid #e2e8f0" }} />
                    {alert.status === "CONSTRUCTION" ? (
                      <div style={{ background: "#fef3c7", padding: "5px", borderRadius: "4px", color: "#92400e", fontSize: "0.75rem", textAlign: "center" }}>🚧 Construction Verified</div>
                    ) : alert.status === "CLOSED" ? (
                      <div style={{ background: "#dcfce7", padding: "5px", borderRadius: "4px", color: "#166534", fontSize: "0.75rem", textAlign: "center" }}>✅ Resolved / Closed</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        <label style={{ fontSize: "0.7rem", color: "#64748b" }}>Take Action:</label>
                        <select style={{ padding: "5px", borderRadius: "4px", border: "1px solid #cbd5e1", cursor: "pointer" }} onChange={(e) => handleResolutionChange(alert.id, e.target.value)} defaultValue="">
                          <option value="" disabled>Select Action...</option>
                          <option value="CONSTRUCTION">🚧 Verify Construction</option>
                          <option value="CLOSED">✅ Close / False Alarm</option>
                        </select>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
            {Object.entries(nodes).map(([id, node]) => (
              <Marker key={id} position={[node.lat || 0, node.lng || 0]} icon={icons[node.status] || icons.green} eventHandlers={{ click: () => setSelectedNode(id) }} />
            ))}
          </MapContainer>
        </div>

        {/* RIGHT: DATA */}
        <div style={styles.rightPanel}>
          {/* 1. KPI CARDS */}
          <div style={styles.kpiRow}>
            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>System Uptime</div>
              <div style={styles.kpiValue} style={{ color: "#16a34a" }}>99.98%</div>
            </div>
            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Active Nodes</div>
              <div style={styles.kpiValue} style={{ color: "#3b82f6" }}>{Object.keys(nodes).length} / {Object.keys(nodes).length + 2}</div>
            </div>
            <div style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Avg Vibration</div>
              <div style={styles.kpiValue}>
                  {latestEnv.accel_mag ? latestEnv.accel_mag.toFixed(3) : "0.00"}g
              </div>
            </div>
          </div>

          {/* 2. ALERTS */}
          <div style={styles.alertSection}>
            <div style={styles.alertHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontWeight: "600" }}>Incident Feed</span>
                <span style={{ background: "#fee2e2", color: "#ef4444", fontSize: "0.7rem", padding: "2px 8px", borderRadius: "10px", fontWeight: "700" }}>{filteredAlerts.length} Active</span>
              </div>
              <div>
                {["ALL", "HIGH", "CONSTRUCTION", "CLOSED"].map((filter) => (
                  <button key={filter} style={styles.filterPill(filterStatus === filter)} onClick={() => setFilterStatus(filter)}>{filter}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "10px 15px", fontSize: "0.75rem", color: "#64748b" }}>TIME</th>
                    <th style={{ textAlign: "left", padding: "10px 15px", fontSize: "0.75rem", color: "#64748b" }}>NODE</th>
                    <th style={{ textAlign: "left", padding: "10px 15px", fontSize: "0.75rem", color: "#64748b" }}>LOC</th>
                    <th style={{ textAlign: "left", padding: "10px 15px", fontSize: "0.75rem", color: "#64748b" }}>SEVERITY</th>
                    <th style={{ textAlign: "right", padding: "10px 15px", fontSize: "0.75rem", color: "#64748b" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9", background: alert.status === "CONSTRUCTION" ? "#fffbeb" : alert.status === "CLOSED" ? "#f0fdf4" : "white" }}>
                      <td style={{ padding: "10px 15px", fontSize: "0.8rem" }}>{new Date(alert.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: "10px 15px", fontSize: "0.8rem", fontWeight: "600" }}>{alert.nodeId}</td>
                      <td style={{ padding: "10px 15px", fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>{Number(alert.lat).toFixed(3)}, {Number(alert.lng).toFixed(3)}</td>
                      <td style={{ padding: "10px 15px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: "bold", background: alert.severity === "HIGH" ? "#fee2e2" : "#fef9c3", color: alert.severity === "HIGH" ? "#991b1b" : "#854d0e" }}>{alert.severity}</span>
                      </td>
                      <td style={{ padding: "10px 15px", textAlign: "right" }}>
                        {alert.status === "CONSTRUCTION" ? (<span style={{ fontSize: "0.75rem", color: "#b45309" }}>🚧 Verified</span>) : alert.status === "CLOSED" ? (<span style={{ fontSize: "0.75rem", color: "#15803d" }}>✅ Closed</span>) : (
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "5px" }}>
                            <select style={styles.statusSelect} onChange={(e) => handleResolutionChange(alert.id, e.target.value)} defaultValue=""><option value="" disabled>Action ▼</option><option value="CONSTRUCTION">🚧 Verify Construction</option><option value="CLOSED">✅ Close Alert</option></select>
                            <button className="btn-action btn-dispatch" onClick={() => handleDispatch(alert.id)}>Dispatch</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. TABS & GRAPHS */}
          <div style={styles.graphSection}>
            <div style={styles.tabHeader}>
              <span style={styles.tab(activeTab === "telemetry")} onClick={() => setActiveTab("telemetry")}>Telemetry</span>
              <span style={styles.tab(activeTab === "health")} onClick={() => setActiveTab("health")}>Node Health</span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>REPLAY MODE:</span>
                <input type="checkbox" checked={replayMode} onChange={(e) => setReplayMode(e.target.checked)} />
                {replayMode && (<input type="range" min="0" max="100" value={replayIndex} onChange={(e) => setReplayIndex(e.target.value)} style={{ width: "100px" }} />)}
              </div>
            </div>

            {activeTab === "telemetry" ? (
              <div style={styles.gridContainer}>
                <div style={styles.chartCard}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", marginBottom: "10px" }}>VIBRATION</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayTelemetry}>
                      <CartesianGrid stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <YAxis width={30} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }} />
                      <Line type="monotone" dataKey="accel_mag" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={styles.chartCard}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", marginBottom: "10px" }}>MAGNETIC (µT)</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayTelemetry}>
                      <CartesianGrid stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <YAxis width={30} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }} />
                      <Line type="monotone" dataKey="mag_norm" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div style={styles.gridContainer}>
                <div style={styles.chartCard}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", marginBottom: "10px" }}>TRACK STRESS (TEMP)</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[latestEnv]} layout="vertical">
                      <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" domain={[0, 60]} hide />
                      <YAxis type="category" dataKey="temperature" width={1} hide />
                      <Tooltip cursor={{ fill: "transparent" }} />
                      <Bar dataKey="temperature" barSize={40} radius={[0, 4, 4, 0]}>
                        {[latestEnv].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.temperature > 45 ? "#ef4444" : "#22c55e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ textAlign: "center", marginTop: "10px", fontSize: "0.9rem" }}>Current: <b>{latestEnv.temperature?.toFixed(1)}°C</b> <span style={{ color: "#64748b" }}>(Crit: 45°C)</span></div>
                </div>
                <div style={styles.chartCard}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#64748b", marginBottom: "10px" }}>NODE STATUS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "10px" }}>
                    <div><div style={{ fontSize: "0.8rem", color: "#475569", marginBottom: "5px" }}>Battery Level</div><div style={{ width: "100%", height: "10px", background: "#e2e8f0", borderRadius: "5px" }}><div style={{ width: `${currentNode?.battery || 85}%`, height: "100%", background: "#22c55e", borderRadius: "5px" }}></div></div></div>
                    <div><div style={{ fontSize: "0.8rem", color: "#475569", marginBottom: "5px" }}>Signal Strength (RSSI)</div><div style={{ width: "100%", height: "10px", background: "#e2e8f0", borderRadius: "5px" }}><div style={{ width: "70%", height: "100%", background: "#3b82f6", borderRadius: "5px" }}></div></div></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div style={{ padding: "5px 15px", background: "#1e293b", fontSize: "0.75rem", fontWeight: "bold", color: "#94a3b8", borderBottom: "1px solid #334155" }}>
          {">"}_ SYSTEM CONSOLE <span style={{ float: "right", color: "#4ade80" }}>● ONLINE | LAST DATA: {new Date(lastHeartbeat).toLocaleTimeString()}</span>
        </div>
        <div style={styles.consoleBody} className="console-logs">
          {systemLogs.map((log) => (
            <div key={log.id} style={{ marginBottom: "4px", display: "flex", gap: "10px" }}>
              <span style={{ color: "#64748b" }}>[{log.time}]</span>
              <span style={{ color: log.type === "error" ? "#ef4444" : log.type === "warning" ? "#f59e0b" : log.type === "success" ? "#4ade80" : "#e2e8f0" }}>{log.msg}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib

app = FastAPI()

# -----------------------------
# Load trained model & scaler
# -----------------------------
model = joblib.load("isolation_forest.pkl")
scaler = joblib.load("scaler.pkl")

FEATURE_COLUMNS = [
    "accel_mag",
    "delta_accel_mag",
    "accel_roll_mean",
    "accel_roll_std",
    "accel_roll_rms",
    "accel_roll_range",
    "mag_norm",
    "delta_mag_norm",
    "TEMPERATURE",
    "HUMIDITY",
    "PRESSURE"
]

# rolling buffer for real-time vibration context
ROLL_BUFFER = []
WINDOW = 40

# -----------------------------
# Input schema (JSON from ESP)
# -----------------------------
class SensorInput(BaseModel):
    accel_x: float
    accel_y: float
    accel_z: float

    mag_x: float
    mag_y: float
    mag_z: float

    temperature: float
    humidity: float
    pressure: float

    latitude: float
    longitude: float

# -----------------------------
# Prediction API
# -----------------------------
@app.post("/predict")
def predict(data: SensorInput):
    global ROLL_BUFFER

    # -----------------------------
    # VIBRATION ANALYSIS
    # -----------------------------
    accel_mag = np.sqrt(
        data.accel_x**2 +
        data.accel_y**2 +
        data.accel_z**2
    )

    ROLL_BUFFER.append(accel_mag)
    if len(ROLL_BUFFER) > WINDOW:
        ROLL_BUFFER.pop(0)

    accel_roll_mean = float(np.mean(ROLL_BUFFER))
    accel_roll_std  = float(np.std(ROLL_BUFFER))
    accel_roll_rms  = float(np.sqrt(np.mean(np.square(ROLL_BUFFER))))
    accel_roll_range = float(max(ROLL_BUFFER) - min(ROLL_BUFFER))

    # -----------------------------
    # MAGNETIC FIELD ANALYSIS
    # -----------------------------
    mag_norm = np.sqrt(
        data.mag_x**2 +
        data.mag_y**2 +
        data.mag_z**2
    )

    # -----------------------------
    # ML FEATURE VECTOR
    # -----------------------------
    feature_row = pd.DataFrame([{
        "accel_mag": accel_mag,
        "delta_accel_mag": 0,
        "accel_roll_mean": accel_roll_mean,
        "accel_roll_std": accel_roll_std,
        "accel_roll_rms": accel_roll_rms,
        "accel_roll_range": accel_roll_range,
        "mag_norm": mag_norm,
        "delta_mag_norm": 0,
        "TEMPERATURE": data.temperature,
        "HUMIDITY": data.humidity,
        "PRESSURE": data.pressure
    }])

    X_scaled = scaler.transform(feature_row[FEATURE_COLUMNS])

    anomaly_score = model.decision_function(X_scaled)[0]
    prediction = model.predict(X_scaled)[0]  # -1 anomaly, +1 normal

    # -----------------------------
    # RESPONSE FOR DASHBOARD
    # -----------------------------
    return {
        "location": {
            "latitude": data.latitude,
            "longitude": data.longitude
        },

        "anomaly": {
            "is_anomaly": bool(prediction == -1),
            "anomaly_score": float(anomaly_score)
        },

        "vibration_analysis": {
            "instant_accel_magnitude": round(accel_mag, 3),
            "rolling_mean": round(accel_roll_mean, 3),
            "rolling_std": round(accel_roll_std, 3),
            "rolling_rms": round(accel_roll_rms, 3),
            "rolling_range": round(accel_roll_range, 3)
        },

        "magnetic_field": {
            "mag_x": data.mag_x,
            "mag_y": data.mag_y,
            "mag_z": data.mag_z,
            "field_strength": round(mag_norm, 3)
        },

        "environment": {
            "temperature_c": data.temperature,
            "humidity_percent": data.humidity,
            "pressure_pa": data.pressure
        }
    }

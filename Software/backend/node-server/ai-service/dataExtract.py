# ===============================
# Railway Tampering Detection
# Complete Hackathon Pipeline
# ===============================

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy.fft import fft
from sklearn.ensemble import IsolationForest

# -------- LOAD DATA --------

df = pd.read_csv("rail_data.csv", low_memory=False)

# Convert numeric columns to float, handling any non-numeric values
df['x'] = pd.to_numeric(df['x'], errors='coerce')
df['y'] = pd.to_numeric(df['y'], errors='coerce')
df['z'] = pd.to_numeric(df['z'], errors='coerce')

# Drop rows with NaN values
df = df.dropna()

print("Dataset loaded:", df.shape)

# -------- WINDOWING --------

WINDOW = 200
STEP = 200

segments = []
timestamps = []

for i in range(0, len(df)-WINDOW, STEP):
    win = df.iloc[i:i+WINDOW]
    segments.append(win)
    timestamps.append(win['time'].iloc[0])

print("Total windows:", len(segments))

# -------- FEATURE EXTRACTION --------

def extract_features(win):

    x = win['x'].values
    y = win['y'].values
    z = win['z'].values
    
    mag = np.sqrt(x**2 + y**2 + z**2)

    f1 = np.sqrt(np.mean(mag**2))         # RMS
    f2 = np.max(np.abs(fft(mag)))         # FFT peak
    f3 = np.var(mag)                      # Variance
    f4 = np.abs(np.mean(z)-np.mean(x))    # Tilt change
    f5 = np.sum(mag**2)                   # Energy
    f6 = np.std(mag)                      # Deviation

    return [f1,f2,f3,f4,f5,f6]

rows = []

for i,win in enumerate(segments):
    feats = extract_features(win)

    rows.append({
        "id": i+1,
        "node_id": 1,
        "timestamp": timestamps[i],
        "feature_1": feats[0],
        "feature_2": feats[1],
        "feature_3": feats[2],
        "feature_4": feats[3],
        "feature_5": feats[4],
        "feature_6": feats[5]
    })

feat_df = pd.DataFrame(rows)

print("Feature table created!")

# -------- TRAIN MODEL --------

X = feat_df[[f"feature_{i}" for i in range(1,7)]]

model = IsolationForest(
    n_estimators=200,
    contamination=0.05,
    random_state=42
)

model.fit(X)

print("Model trained!")

# -------- PREDICTION --------

scores = model.decision_function(X)
preds = model.predict(X)

feat_df["anomaly_score"] = scores
feat_df["is_anomaly"] = preds == -1

print("Anomalies detected!")

# -------- SAVE OUTPUT --------

feat_df.to_csv("trained_sensor_output.csv", index=False)
print("FINAL FILE SAVED: trained_sensor_output.csv")

# -------- OPTIONAL VISUALIZATION --------

plt.figure(figsize=(12,5))
plt.plot(feat_df["anomaly_score"], label="Anomaly Score")
threshold = feat_df["anomaly_score"].quantile(0.05)
plt.axhline(threshold, linestyle="--", label="Threshold")
plt.legend()
plt.title("Railway Tampering Detection")
plt.xlabel("Window Index")
plt.ylabel("Score")
plt.show()
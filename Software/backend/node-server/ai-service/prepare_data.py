import pandas as pd
import numpy as np

INPUT_CSV  = "vibration_raw.csv"
OUTPUT_CSV = "training_features.csv"

df = pd.read_csv(INPUT_CSV)

# -------------------------------
# Basic magnitudes
# -------------------------------
df["accel_mag"] = np.sqrt(
    df["ACCEL_X"]**2 + df["ACCEL_Y"]**2 + df["ACCEL_Z"]**2
)

df["mag_norm"] = np.sqrt(
    df["MAG_X"]**2 + df["MAG_Y"]**2 + df["MAG_Z"]**2
)

# -------------------------------
# Delta features (row-wise)
# -------------------------------
df["delta_accel_mag"] = df["accel_mag"].diff().fillna(0)
df["delta_mag_norm"]  = df["mag_norm"].diff().fillna(0)

# -------------------------------
# Rolling features (NO resampling)
# -------------------------------
WINDOW = 40   # ~1 sec at ~40Hz

df["accel_roll_mean"] = df["accel_mag"].rolling(WINDOW, min_periods=1).mean()
df["accel_roll_std"]  = df["accel_mag"].rolling(WINDOW, min_periods=1).std().fillna(0)
df["accel_roll_rms"]  = np.sqrt(
    df["accel_mag"].rolling(WINDOW, min_periods=1).apply(lambda x: np.mean(x**2))
)
df["accel_roll_range"] = (
    df["accel_mag"].rolling(WINDOW, min_periods=1).max()
    - df["accel_mag"].rolling(WINDOW, min_periods=1).min()
)

# -------------------------------
# Final selection
# -------------------------------
final_cols = [
    "LATITUDE","LONGITUDE",
    "accel_mag","delta_accel_mag",
    "accel_roll_mean","accel_roll_std",
    "accel_roll_rms","accel_roll_range",
    "mag_norm","delta_mag_norm",
    "TEMPERATURE","HUMIDITY","PRESSURE",
    "is_anomaly"
]

df_final = df[final_cols].dropna()
df_final.to_csv(OUTPUT_CSV, index=False)

print("✅ Training feature file saved:", df_final.shape)

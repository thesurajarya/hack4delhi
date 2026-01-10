import pandas as pd
import numpy as np
import joblib

from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix
)

MODEL_FILE = "isolation_forest.pkl"
SCALER_FILE = "scaler.pkl"

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

def train():
    # --------------------------------------------------
    # 1) LOAD FEATURE DATA
    # --------------------------------------------------
    df = pd.read_csv("training_features.csv")

    X = df[FEATURE_COLUMNS].fillna(0)
    y = df["is_anomaly"].astype(int)  # 1 = anomaly, 0 = normal

    # --------------------------------------------------
    # 2) TRAIN / TEST SPLIT (80–20)
    # --------------------------------------------------
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y
    )

    # --------------------------------------------------
    # 3) SCALE (FIT ONLY ON TRAIN → NO LEAKAGE)
    # --------------------------------------------------
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    # --------------------------------------------------
    # 4) TRAIN ISOLATION FOREST (ONLY ON TRAIN DATA)
    # --------------------------------------------------
    model = IsolationForest(
        n_estimators=300,
        contamination=y_train.mean(),  # smart contamination
        random_state=42
    )

    model.fit(X_train_scaled)

    # --------------------------------------------------
    # 5) EVALUATE ON TEST DATA
    # --------------------------------------------------
    # Isolation Forest outputs:
    #  -1 → anomaly
    #   1 → normal
    y_pred_raw = model.predict(X_test_scaled)

    # Convert to 1 = anomaly, 0 = normal
    y_pred = np.where(y_pred_raw == -1, 1, 0)

    print("\n📊 MODEL EVALUATION (TEST SET)")
    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    print("\nMetrics:")
    print("Accuracy :", round(accuracy_score(y_test, y_pred), 4))
    print("Precision:", round(precision_score(y_test, y_pred), 4))
    print("Recall   :", round(recall_score(y_test, y_pred), 4))
    print("F1-score :", round(f1_score(y_test, y_pred), 4))

    # --------------------------------------------------
    # 6) SAVE MODEL & SCALER
    # --------------------------------------------------
    joblib.dump(model, MODEL_FILE)
    joblib.dump(scaler, SCALER_FILE)

    print("\n✅ Model saved as:", MODEL_FILE)
    print("✅ Scaler saved as:", SCALER_FILE)


if __name__ == "__main__":
    train()

# app.py
import os
import requests
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from tensorflow.keras.models import load_model
from PIL import Image
import numpy as np
import io

# ─── Configuration ─────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR  = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

MODEL_FILE  = "updatedCNN.h5"
MODEL_PATH  = os.path.join(MODELS_DIR, MODEL_FILE)
MODEL_URL   = os.environ.get("MODEL_URL", "").strip()
IMG_SIZE    = (224, 224)
CLASS_LABELS = ["Bad Posture", "Good Posture"]

# ─── Always download (and overwrite) model at startup ─────────────────────────
if not MODEL_URL:
    raise RuntimeError("Missing MODEL_URL environment variable")

print(f"Downloading model from {MODEL_URL} …", flush=True)
resp = requests.get(MODEL_URL, stream=True, timeout=60)
resp.raise_for_status()
with open(MODEL_PATH, "wb") as f:
    for chunk in resp.iter_content(chunk_size=1_048_576):
        f.write(chunk)
print("Download complete.", flush=True)

# ─── Flask App Setup ──────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "docs"),
    static_url_path=""
)
CORS(app)

# ─── Load Model ───────────────────────────────────────────────────────────────
print(f"Loading model from {MODEL_PATH} …", flush=True)
model = load_model(MODEL_PATH, compile=False)
print("Model loaded.", flush=True)

# ─── Helpers ──────────────────────────────────────────────────────────────────
def preprocess_image(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img = img.resize(IMG_SIZE)
    arr = np.array(img, dtype="float32") / 255.0
    return np.expand_dims(arr, axis=0)

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/ping")
def ping():
    return "pong", 200

@app.route("/predict", methods=["OPTIONS", "POST"])
def predict():
    if request.method == "OPTIONS":
        return make_response("", 204)

    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    img_bytes = request.files["image"].read()
    tensor    = preprocess_image(img_bytes)
    preds     = model.predict(tensor, verbose=0)[0]
    idx       = int(np.argmax(preds))
    conf      = float(np.max(preds))

    return jsonify({
        "class":      idx,
        "confidence": round(conf, 4),
        "label":      CLASS_LABELS[idx]
    })

# ─── Run Server ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

import os
import io
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from tensorflow.keras.models import load_model
from PIL import Image
import numpy as np

# ─── Configuration ────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR  = os.path.join(BASE_DIR, "models")
MODEL_PATH  = os.path.join(MODELS_DIR, "updatedCNN.h5")
MODEL_URL   = os.environ.get("MODEL_URL", "").strip()
IMG_SIZE    = (224, 224)
CLASS_LABELS = ["Bad Posture", "Good Posture"]

# ─── Always download the real model at startup ───────────────────────────────
if not MODEL_URL:
    raise RuntimeError("MODEL_URL environment variable is not set")

os.makedirs(MODELS_DIR, exist_ok=True)
print(f"Downloading model from {MODEL_URL}…")
resp = requests.get(MODEL_URL, stream=True)
resp.raise_for_status()
with open(MODEL_PATH, "wb") as f:
    for chunk in resp.iter_content(chunk_size=4_194_304):
        f.write(chunk)
print("Download complete.")

# ─── Flask App Setup ─────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "docs"),  # serve files from docs/
    static_url_path=""                              # at root URL
)
CORS(app)

# ─── Load Model ──────────────────────────────────────────────────────────────
print(f"Loading model from {MODEL_PATH}…")
model = load_model(MODEL_PATH, compile=False)
print("Model loaded.")

# ─── Helpers ─────────────────────────────────────────────────────────────────
def preprocess_image(image_bytes):
    """Load image bytes, resize, normalize, and return a batch tensor."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMG_SIZE)
    arr = np.array(img).astype("float32") / 255.0
    return np.expand_dims(arr, axis=0)

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    img_bytes = request.files["image"].read()
    tensor = preprocess_image(img_bytes)
    preds = model.predict(tensor, verbose=0)[0]
    idx  = int(np.argmax(preds))
    conf = float(np.max(preds))

    return jsonify({
        "class":      idx,
        "confidence": round(conf, 4),
        "label":      CLASS_LABELS[idx]
    })

# ─── Run Server ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)

import os
import requests
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from tensorflow.keras.models import load_model
from PIL import Image
import numpy as np
import io

# ─── Configuration ─────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR  = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "updatedCNN.h5")
MODEL_URL  = os.environ.get("MODEL_URL")   # set this in Railway→Variables
IMG_SIZE   = (224, 224)
CLASS_LABELS = ["Bad Posture", "Good Posture"]

# ─── Download model at startup if running on Railway ──────────────────────────
if MODEL_URL:
    os.makedirs(MODEL_DIR, exist_ok=True)
    print(f"Downloading model from {MODEL_URL}…")
    resp = requests.get(MODEL_URL)
    resp.raise_for_status()
    with open(MODEL_PATH, "wb") as f:
        f.write(resp.content)
    print("Download complete.")

# ─── Flask App Setup ──────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "docs"),
    static_url_path=""
)
CORS(app)

# ─── Always add CORS headers ───────────────────────────────────────────────────
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

# ─── Load the Keras model ─────────────────────────────────────────────────────
print(f"Loading model from {MODEL_PATH}…")
model = load_model(MODEL_PATH, compile=False)
print("Model loaded.")

# ─── Image preprocessing helper ────────────────────────────────────────────────
def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMG_SIZE)
    arr = np.array(img).astype("float32") / 255.0
    return np.expand_dims(arr, axis=0)

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/predict", methods=["OPTIONS", "POST"])
def predict():
    if request.method == "OPTIONS":
        # preflight response
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

# ─── Run server ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)

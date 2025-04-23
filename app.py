import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from keras.models import load_model
from PIL import Image
import numpy as np
import io

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH   = os.path.join(BASE_DIR, "models", "updatedCNN.keras")
IMG_SIZE     = (224, 224)
CLASS_LABELS = ["Bad Posture", "Good Posture"]

app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "web_frontend"),
    static_url_path=""
)
CORS(app)

model = load_model(MODEL_PATH, compile=False)

def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMG_SIZE)
    arr = np.array(img).astype("float32") / 255.0
    return np.expand_dims(arr, axis=0)

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
    idx = int(np.argmax(preds))
    conf = float(np.max(preds))
    return jsonify({
        "class": idx,
        "confidence": round(conf, 4),
        "label": CLASS_LABELS[idx]
    })

if __name__ == "__main__":
    app.run(debug=True)

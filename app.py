import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import tensorflow as tf
from PIL import Image
import numpy as np
import io

app = Flask(__name__)
CORS(app)

MODEL_FILE = 'updatedCNN.h5'
MODEL_PATH = f'/app/models/{MODEL_FILE}'
MODEL_URL = os.environ.get('MODEL_URL', '').strip()
IMG_SIZE = (224, 224)  
CLASS_LABELS = ["Bad Posture", "Good Posture"]

if MODEL_URL and not os.path.exists(MODEL_PATH):
    os.makedirs('/app/models', exist_ok=True)
    print(f"Downloading model from {MODEL_URL} ...")
    r = requests.get(MODEL_URL, stream=True)
    r.raise_for_status()
    with open(MODEL_PATH, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192): 
            f.write(chunk)
    print("Model downloaded.")

model = tf.keras.models.load_model(MODEL_PATH)

def preprocess(img_bytes):
    img = Image.open(io.BytesIO(img_bytes))
    img = img.resize(IMG_SIZE)
    img_arr = np.array(img) / 255.0
    return np.expand_dims(img_arr, 0)

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'no image'}), 400
    
    img_bytes = request.files['image'].read()
    tensor = preprocess(img_bytes)
    preds = model.predict(tensor)[0]
    
    return jsonify({
        'class': int(preds.argmax()), 
        'confidence': float(preds.max()),
        'label': CLASS_LABELS[preds.argmax()]  
    })

if __name__ == '__main__':
    app.run()
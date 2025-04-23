const video = document.getElementById("video");
const cameraSelect = document.getElementById("cameraSelect");
const statusEl = document.getElementById("status");
const lockout = document.getElementById("lockoutOverlay");
const alertSound = document.getElementById("alertSound");
const snap = document.getElementById("snap");
const ctx = snap.getContext("2d");

let currentStream = null,
    badStart      = null,
    lockoutActive = false;
const LOCK_MS = 10000;
const API_BASE = "https://web-production-7239.up.railway.app";

async function startCamera() {
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({video: true});
    video.srcObject = currentStream;
  } catch (err) {
    console.error("Error accessing camera", err);
    statusEl.textContent = "Failed to access camera";
  }
}

async function predict() {
  if (!currentStream) return;
  
  ctx.drawImage(video, 0, 0, snap.width, snap.height);
  const blob = await new Promise(res => snap.toBlob(res, "image/jpeg"));
  const formData = new FormData();
  formData.append('image', blob, 'frame.jpg');

  try {
    const resp = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      body: formData
    });
    
    if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
    
    const pred = await resp.json();
    console.log(pred);
    statusEl.textContent = pred.label;

    if (pred.class === 0) { // bad posture 
      if (!badStart) badStart = Date.now();
      else if (!lockoutActive && Date.now() - badStart > LOCK_MS) {
        lockoutActive = true;
        engageLockout();
      }
    } else {
      badStart = null;
      lockoutActive = false;
      disengageLockout(); 
    }
  } catch (err) {
    console.error("Prediction error", err);
    statusEl.textContent = "Prediction error";
  }
}

function engageLockout() {
  lockout.style.visibility = "visible";
  alertSound.play();
}

function disengageLockout() {
  lockout.style.visibility = "hidden";
  alertSound.pause();
  alertSound.currentTime = 0;
}

cameraSelect.addEventListener('change', startCamera);

document.addEventListener("DOMContentLoaded", () => {
  startCamera();
  setInterval(predict, 1000);
});
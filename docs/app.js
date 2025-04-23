// docs/app.js

console.log("🚀 app.js loaded");
window.onerror = (msg, url, line, col, err) => {
  console.error("🔴 Global error:", msg, "at", url, line, col, err);
};

// ─── Configuration ───────────────────────────────────────────────────────────
const API_BASE = "https://web-production-7239.up.railway.app";

const video        = document.getElementById("video");
const cameraSelect = document.getElementById("cameraSelect");
const statusEl     = document.getElementById("status");
const lockout      = document.getElementById("lockoutOverlay");
const alertSound   = document.getElementById("alertSound");
const snap         = document.getElementById("snap");
const ctx          = snap.getContext("2d");

let currentStream  = null;
let badStart       = null;
let lockoutActive  = false;
const LOCK_MS      = 10 * 1000; // 10 seconds

// ─── STEP 1: ASK FOR CAMERA PERMISSION ────────────────────────────────────────
async function ensurePermission() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  stream.getTracks().forEach(t => t.stop());
}

// ─── STEP 2: ENUMERATE CAMERAS ─────────────────────────────────────────────────
async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  devices
    .filter(d => d.kind === "videoinput")
    .forEach((d, i) => {
      const label = d.label || `Camera ${i+1}`;
      cameraSelect.insertAdjacentHTML(
        "beforeend",
        `<option value="${d.deviceId}">${label}</option>`
      );
    });
}

// ─── STEP 3: START A STREAM ───────────────────────────────────────────────────
async function startStream(deviceId) {
  if (currentStream) currentStream.getTracks().forEach(t => t.stop());
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
  } catch {
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
  }
  video.srcObject = currentStream;
}

cameraSelect.onchange = () => startStream(cameraSelect.value);

// ─── PREDICTION LOOP ─────────────────────────────────────────────────────────
async function predict() {
  ctx.drawImage(video, 0, 0, snap.width, snap.height);
  const blob = await new Promise(res => snap.toBlob(res, "image/jpeg"));

  const fd = new FormData();
  fd.append("image", blob, "frame.jpg");

  let json;
  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      body: fd
    });
    json = await res.json();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Connection error";
    statusEl.style.color = "gray";
    return;
  }

  statusEl.textContent = json.label;
  statusEl.style.color   = (json.class === 1 ? "white" : "red");

  if (json.class === 0) {
    if (!badStart) badStart = Date.now();
    else if (!lockoutActive && Date.now() - badStart > LOCK_MS) {
      lockoutActive = true;
      engageLockout();
    }
  } else {
    badStart = null;
    if (lockoutActive) {
      lockoutActive = false;
      disengageLockout();
    }
  }
}

// ─── LOCKOUT ──────────────────────────────────────────────────────────────────
async function engageLockout() {
  if (document.fullscreenEnabled) {
    try { await document.documentElement.requestFullscreen(); } catch {}
  }
  alertSound.loop = true;
  alertSound.play().catch(() => {});
  video.classList.add("lockout-pulse");
  lockout.style.visibility = "visible";
}

async function disengageLockout() {
  lockout.style.visibility = "hidden";
  alertSound.loop   = false;
  alertSound.pause();
  alertSound.currentTime = 0;
  video.classList.remove("lockout-pulse");
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch {}
  }
}

// ─── STARTUP ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📥 DOMContentLoaded fired");
  try {
    console.log("…requesting camera permission");
    await ensurePermission();
    console.log("✅ camera permission granted");

    console.log("…enumerating cameras");
    await getCameras();
    console.log("✅ cameras listed:", cameraSelect.options.length);

    console.log("…starting stream");
    await startStream(cameraSelect.value);
    console.log("✅ stream started");

    console.log("…starting predict loop");
    setInterval(() => {
      console.log("🔁 predict()");
      predict();
    }, 1000);

  } catch (err) {
    console.error("❌ initialization error:", err);
    statusEl.textContent = "Startup error – see console";
  }
});

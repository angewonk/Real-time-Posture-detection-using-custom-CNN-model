// docs/app.js

// ─── Configuration ─────────────────────────────────────────────────────────────
// Change this to your Railway URL (no trailing slash):
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

// ─── STEP 0: OPTIONAL PING ─────────────────────────────────────────────────────
// Quick check that the API is up before starting the prediction loop.
async function pingServer() {
  try {
    const res = await fetch(`${API_BASE}/ping`);
    if (!res.ok) throw new Error("ping failed");
    console.log("✅ Server ping successful");
  } catch (err) {
    console.error("❌ Server ping error:", err);
    statusEl.textContent = "API unavailable";
    statusEl.style.color = "gray";
    throw err;
  }
}

// ─── STEP 1: ASK FOR CAMERA PERMISSION ────────────────────────────────────────
async function ensurePermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    console.log("✅ camera permission granted");
  } catch (err) {
    console.warn("Camera access denied", err);
    statusEl.textContent = "Camera access denied";
    statusEl.style.color = "gray";
    throw err;
  }
}

// ─── STEP 2: ENUMERATE CAMERAS ─────────────────────────────────────────────────
async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === "videoinput");
  cams.forEach((d, i) => {
    const label = d.label || `Camera ${i+1}`;
    cameraSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${d.deviceId}">${label}</option>`
    );
  });
  console.log(`✅ cameras listed: ${cams.length}`);
}

// ─── STEP 3: START A STREAM ───────────────────────────────────────────────────
async function startStream(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
  }
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
    });
  } catch (_) {
    console.warn("Exact camera not available, falling back to default");
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
  }
  video.srcObject = currentStream;
  console.log("✅ stream started");
}

cameraSelect.onchange = () => startStream(cameraSelect.value);

// ─── PREDICTION LOOP ─────────────────────────────────────────────────────────
async function predict() {
  ctx.drawImage(video, 0, 0, snap.width, snap.height);
  const blob = await new Promise((res) => snap.toBlob(res, "image/jpeg"));

  const fd = new FormData();
  fd.append("image", blob, "frame.jpg");

  let json;
  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      body: fd
    });
    if (!res.ok) {
      console.error("Bad response from /predict:", res.status);
      statusEl.textContent = "Server error";
      statusEl.style.color = "gray";
      return;
    }
    json = await res.json();
  } catch (err) {
    console.error("Connection error:", err);
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
    try { await document.documentElement.requestFullscreen(); }
    catch (e) { console.warn("Fullscreen request failed:", e); }
  }
  alertSound.loop = true;
  alertSound.play().catch(() => {});
  video.classList.add("lockout-pulse");
  lockout.style.visibility = "visible";
}

async function disengageLockout() {
  lockout.style.visibility = "hidden";
  alertSound.loop = false;
  alertSound.pause();
  alertSound.currentTime = 0;
  video.classList.remove("lockout-pulse");
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); }
    catch (e) { console.warn("Exiting fullscreen failed:", e); }
  }
}

// ─── STARTUP ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await pingServer();
    await ensurePermission();
    await getCameras();

    if (cameraSelect.options.length > 0) {
      await startStream(cameraSelect.value);
      console.log("…starting predict loop");
      setInterval(predict, 1000);
    } else {
      statusEl.textContent = "No camera found";
      statusEl.style.color = "gray";
    }
  } catch (e) {
    // any startup error already shown in UI
  }
});

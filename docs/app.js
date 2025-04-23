// docs/app.js

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

// ── STEP 1: ASK FOR GENERIC CAMERA PERMISSION ────────────────────────────────
async function ensurePermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // immediately stop it, we only needed permission
    stream.getTracks().forEach(t => t.stop());
  } catch (err) {
    statusEl.textContent = "Camera access denied";
    statusEl.style.color = "gray";
    throw err;
  }
}

// ── STEP 2: ENUMERATE AVAILABLE CAMERAS ──────────────────────────────────────
async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  devices
    .filter(d => d.kind === "videoinput")
    .forEach((d, i) => {
      const label = d.label || `Camera ${i + 1}`;
      cameraSelect.insertAdjacentHTML(
        "beforeend",
        `<option value="${d.deviceId}">${label}</option>`
      );
    });
}

// ── STEP 3: START A STREAM FOR A GIVEN CAMERA ───────────────────────────────
async function startStream(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
  }
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
  } catch (e) {
    // fallback to default camera if specified one fails
    console.warn("Exact camera not available, falling back to default", e);
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
  }
  video.srcObject = currentStream;
}

cameraSelect.onchange = () => startStream(cameraSelect.value);

// ── MAIN PREDICTION LOOP ───────────────────────────────────────────────────
async function predict() {
  // capture frame
  ctx.drawImage(video, 0, 0, snap.width, snap.height);
  const blob = await new Promise(res => snap.toBlob(res, "image/jpeg"));

  // send to backend
  const fd = new FormData();
  fd.append("image", blob, "frame.jpg");

  let json;
  try {
    const res = await fetch("/predict", { method: "POST", body: fd });
    json = await res.json();
  } catch {
    statusEl.textContent = "Connection error";
    statusEl.style.color = "gray";
    return;
  }

  // update UI
  statusEl.textContent = json.label;
  statusEl.style.color = json.class === 1 ? "white" : "red";

  // lockout logic
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

// ── ENGAGE LOCKOUT ──────────────────────────────────────────────────────────
async function engageLockout() {
  // enter fullscreen
  if (document.fullscreenEnabled) {
    try {
      await document.documentElement.requestFullscreen();
    } catch (e) {
      console.warn("Fullscreen request failed:", e);
    }
  }

  // play looping alert
  alertSound.loop = true;
  alertSound.play().catch(() => {
    console.warn("Playback prevented until user interacts with page");
  });

  // pulsing border
  video.classList.add("lockout-pulse");
  // show overlay
  lockout.style.visibility = "visible";
}

// ── DISENGAGE LOCKOUT ───────────────────────────────────────────────────────
async function disengageLockout() {
  // hide overlay
  lockout.style.visibility = "hidden";

  // stop alert
  alertSound.loop = false;
  alertSound.pause();
  alertSound.currentTime = 0;

  // remove pulsing
  video.classList.remove("lockout-pulse");

  // exit fullscreen
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch (e) {
      console.warn("Exiting fullscreen failed:", e);
    }
  }
}

// ── INITIALIZATION ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await ensurePermission();   // ask for camera access
    await getCameras();         // populate dropdown

    if (cameraSelect.options.length > 0) {
      await startStream(cameraSelect.value);
      setInterval(predict, 1000);
    } else {
      statusEl.textContent = "No camera found";
      statusEl.style.color = "gray";
    }
  } catch {
    // permission denied or other failure
  }
});

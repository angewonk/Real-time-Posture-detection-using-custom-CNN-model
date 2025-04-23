// ─── Configuration ─────────────────────────────────────────────────────────────
// your Railway app URL (no trailing slash):
const API_BASE = "https://web-production-7239.up.railway.app";

const video        = document.getElementById("video");
const cameraSelect = document.getElementById("cameraSelect");
const statusEl     = document.getElementById("status");
const lockout      = document.getElementById("lockoutOverlay");
const alertSound   = document.getElementById("alertSound");
const snap         = document.getElementById("snap");
const ctx          = snap.getContext("2d");

let currentStream = null,
    badStart      = null,
    lockoutActive = false;
const LOCK_MS = 10_000; // 10s

async function ensurePermission() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach(t => t.stop());
    console.log("camera permission granted");
  } catch (e) {
    statusEl.textContent = "Camera access denied";
    throw e;
  }
}

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
  console.log(`cameras listed: ${cameraSelect.options.length}`);
}

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
  console.log("stream started");
}

cameraSelect.onchange = () => startStream(cameraSelect.value);

async function predict() {
  ctx.drawImage(video, 0, 0, snap.width, snap.height);
  const blob = await new Promise(res => snap.toBlob(res, "image/jpeg"));

  const fd = new FormData();
  fd.append("image", blob, "frame.jpg");

  let json;
  try {
    const res = await fetch(`${API_BASE}/predict`, { method: "POST", body: fd });
    json = await res.json();
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Connection error";
    return;
  }

  statusEl.textContent = json.label;
  statusEl.style.color = json.class === 1 ? "white" : "red";

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

async function engageLockout() {
  if (document.fullscreenEnabled) {
    try { await document.documentElement.requestFullscreen(); }
    catch {}
  }
  alertSound.loop = true;
  alertSound.play().catch(()=>{});
  lockout.style.visibility = "visible";
}

async function disengageLockout() {
  lockout.style.visibility = "hidden";
  alertSound.loop = false;
  alertSound.pause();
  alertSound.currentTime = 0;
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); }
    catch {}
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await ensurePermission();
  await getCameras();
  if (cameraSelect.options.length) {
    await startStream(cameraSelect.value);
    setInterval(predict, 1000);
    console.log("starting predict loop");
  } else {
    statusEl.textContent = "No camera found";
  }
});

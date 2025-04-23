// docs/app.js

// ─── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = "https://web-production-7239.up.railway.app"; // your Railway URL

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
const LOCK_MS = 10_000; // 10 seconds

async function ensurePermission() {
  const s = await navigator.mediaDevices.getUserMedia({ video: true });
  s.getTracks().forEach(t => t.stop());
}
async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  devices.filter(d => d.kind === "videoinput")
         .forEach((d,i) => {
           cameraSelect.insertAdjacentHTML(
             "beforeend",
             `<option value="${d.deviceId}">${d.label||"Camera "+(i+1)}</option>`
           );
         });
}
async function startStream(id) {
  if (currentStream) currentStream.getTracks().forEach(t=>t.stop());
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: id } }
    });
  } catch {
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
  }
  video.srcObject = currentStream;
}
cameraSelect.onchange = () => startStream(cameraSelect.value);

async function predict() {
  ctx.drawImage(video, 0, 0, snap.width, snap.height);
  const blob = await new Promise(r=>snap.toBlob(r,"image/jpeg"));
  const fd   = new FormData();
  fd.append("image", blob, "frame.jpg");

  try {
    const res = await fetch(`${API_BASE}/predict`, { method:"POST", body:fd });
    const json = await res.json();
    statusEl.textContent = json.label;
    statusEl.style.color   = json.class===1?"white":"red";

    if (json.class===0) {
      if (!badStart) badStart = Date.now();
      else if (!lockoutActive && Date.now()-badStart>LOCK_MS) {
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
  } catch {
    statusEl.textContent = "Connection error";
    statusEl.style.color = "gray";
  }
}

async function engageLockout() {
  if (document.fullscreenEnabled) document.documentElement.requestFullscreen().catch(()=>{});
  alertSound.loop = true;
  alertSound.play().catch(()=>{});
  lockout.style.visibility = "visible";
  video.classList.add("lockout-pulse");
}
async function disengageLockout() {
  lockout.style.visibility = "hidden";
  alertSound.loop = false;
  alertSound.pause();
  alertSound.currentTime = 0;
  video.classList.remove("lockout-pulse");
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await ensurePermission();
    await getCameras();
    if (cameraSelect.options.length > 0) {
      await startStream(cameraSelect.value);
      setInterval(predict, 1000);
    } else {
      statusEl.textContent = "No camera found";
      statusEl.style.color = "gray";
    }
  } catch (e) {
    statusEl.textContent = "Startup error";
    statusEl.style.color = "gray";
  }
});

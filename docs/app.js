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
const LOCK_MS      = 10 * 1000;

async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  devices.filter(d => d.kind === "videoinput")
         .forEach((d,i) => {
           const label = d.label || `Camera ${i+1}`;
           cameraSelect.insertAdjacentHTML(
             "beforeend",
             `<option value="${d.deviceId}">${label}</option>`
           );
         });
}

async function startStream(deviceId) {
  if (currentStream) currentStream.getTracks().forEach(t => t.stop());
  currentStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId } }
  });
  video.srcObject = currentStream;
}

cameraSelect.onchange = () => startStream(cameraSelect.value);

async function predict() {
  ctx.drawImage(video, 0, 0, snap.width, snap.height);
  const blob = await new Promise(res => snap.toBlob(res, "image/jpeg"));
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
    catch (e) { console.warn(e); }
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
    catch (e) { console.warn(e); }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await getCameras();
  if (cameraSelect.options.length > 0) {
    await startStream(cameraSelect.value);
    setInterval(predict, 1000);
  } else {
    statusEl.textContent = "No camera found";
    statusEl.style.color = "gray";
  }
});

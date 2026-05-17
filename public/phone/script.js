const socket = io();
const btnStart = document.getElementById('btn-start');
const screens = { start: document.getElementById('start-screen'), scan: document.getElementById('scan-screen'), result: document.getElementById('result-screen') };
const announcer = document.getElementById('announcer');
const instructionText = document.getElementById('instruction-text');
const arrowUI = document.getElementById('arrow-ui');
const resultText = document.getElementById('result-text');
const resultIconContainer = document.getElementById('result-icon-container');
const cameraFeed = document.getElementById('camera-feed');
const cameraOverride = document.getElementById('camera-override');
const debugInfo = document.getElementById('debug-info');
const fillClipRect = document.getElementById('fill-clip-rect');

let currentLang = 'pl';
let isScanning = false;
let currentPhase = 'left';
let rotationProgress = { left: 0, right: 0 };
let initialAlpha = null;
let targetAngle = 45;

let audioCtx = null;
let beepInterval = null;
let resultInterval = null;
let resultCount = 0;

const translations = {
    pl: { move: 'Poruszaj<br>urządzeniem', scanning: 'Skanuję...', safe: 'PRZEJŚCIE BEZPIECZNE', stop: 'STOP', approach: 'Stop, nadjeżdża pojazd', scan_left: 'Skanowanie... przesuwaj urządzenie w lewo...', scan_right: 'Skanowanie... przesuwaj urządzenie w prawo...', start_btn: 'SKANUJ' },
    en: { move: 'Move the<br>device', scanning: 'Scanning...', safe: 'SAFE TO CROSS', stop: 'STOP', approach: 'STOP, vehicle approaching', scan_left: 'Scanning... move device to the left...', scan_right: 'Scanning... move device to the right...', start_btn: 'SCAN' }
};

function announce(msg) { announcer.textContent = msg; }
function setLanguage(lang) {
    currentLang = lang;
    btnStart.innerText = translations[lang].start_btn;
    document.getElementById('scanning-label').innerText = translations[lang].scanning;
    if (isScanning) updateInstruction();
}
function updateInstruction() { instructionText.innerHTML = translations[currentLang].move; }
function showScreen(name) {
    Object.keys(screens).forEach(key => screens[key].classList.remove('active'));
    screens[name].classList.add('active');
}

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function startBeeping(side) {
    stopBeeping();
    const baseFreq = side === 'left' ? 440 : 660;
    beepInterval = setInterval(() => {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const progress = rotationProgress[currentPhase] / targetAngle;
        osc.frequency.setValueAtTime(baseFreq + (progress * 200), now);
        osc.type = 'sine';
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start();
        osc.stop(now + 0.1);
    }, Math.max(100, 500 - ( (rotationProgress[currentPhase] / targetAngle) * 400 )));
}

function stopBeeping() {
    if (beepInterval) clearInterval(beepInterval);
    if (resultInterval) clearInterval(resultInterval);
}

function startResultAudio(type) {
    stopBeeping();
    resultCount = 0;
    const maxReps = 5;
    if (type === 'stop') {
        resultInterval = setInterval(() => {
            if (resultCount >= maxReps) { clearInterval(resultInterval); return; }
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, now);
            g.gain.setValueAtTime(0.25, now);
            g.gain.linearRampToValueAtTime(0, now + 0.6);
            osc.connect(g);
            g.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.6);
            resultCount++;
        }, 1000);
    } else {
        resultInterval = setInterval(() => {
            if (resultCount >= maxReps * 2) { clearInterval(resultInterval); return; }
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            g.gain.setValueAtTime(0.15, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.connect(g);
            g.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.08);
            resultCount++;
        }, 150);
    }
}

function handleOrientation(event) {
    if (!isScanning) return;
    let alpha = event.alpha;
    if (event.webkitCompassHeading !== undefined) alpha = 360 - event.webkitCompassHeading;
    if (alpha === null || alpha === undefined) { debugInfo.innerText = "IMU: No Data"; return; }
    if (initialAlpha === null) { initialAlpha = alpha; return; }

    let diff = alpha - initialAlpha;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    debugInfo.innerText = `IMU: ${Math.round(alpha)} (diff: ${Math.round(diff)})`;

    if (currentPhase === 'left') {
        // Move left -> diff is negative
        let progress = Math.min(targetAngle, Math.max(0, -diff));
        rotationProgress.left = progress;
        updateUIProgress(progress);
        if (progress >= targetAngle) completePhase();
    } else {
        // Move right -> diff is positive
        let progress = Math.min(targetAngle, Math.max(0, diff));
        rotationProgress.right = progress;
        updateUIProgress(progress);
        if (progress >= targetAngle) completePhase();
    }
}

function updateUIProgress(val) {
    const percent = (val / targetAngle) * 100;
    if (fillClipRect) fillClipRect.setAttribute('width', percent);
}

function completePhase() {
    if (currentPhase === 'left') {
        currentPhase = 'right';
        initialAlpha = null;
        arrowUI.style.transform = 'scaleX(1)'; // Point right
        announce(translations[currentLang].scan_right);
        startBeeping('right');
    } else {
        finishScanning();
    }
}

function finishScanning() {
    isScanning = false;
    stopBeeping();
}

function triggerResult(type) {
    isScanning = false;
    stopBeeping();
    showScreen('result');
    screens.result.className = 'screen active ' + type;
    if (type === 'stop') {
        resultText.innerText = translations[currentLang].stop;
        resultIconContainer.innerHTML = `<svg viewBox="0 0 100 100" class="result-icon"><circle cx="50" cy="50" r="45" fill="white"/><path d="M30 30 L70 70 M70 30 L30 70" stroke="red" stroke-width="10" stroke-linecap="round"/></svg>`;
        announce(translations[currentLang].approach);
    } else {
        resultText.innerText = translations[currentLang].safe;
        resultIconContainer.innerHTML = `<svg viewBox="0 0 100 100" class="result-icon"><circle cx="50" cy="50" r="45" fill="white"/><path d="M50 20 L50 80 M30 50 L50 80 L70 50" stroke="green" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        announce(translations[currentLang].safe);
    }
    startResultAudio(type);
}

let pendingResult = null;
let manualInterval = null;

socket.on('command', (data) => {
    switch(data.type) {
        case 'trigger-stop': pendingResult = null; triggerResult('stop'); break;
        case 'trigger-safe':
            if (isScanning || screens.scan.classList.contains('active')) {
                pendingResult = 'safe';
                if (!isScanning) { triggerResult('safe'); pendingResult = null; }
            } else { triggerResult('safe'); }
            break;
        case 'reset': location.reload(); break;
        case 'imu-override-left':
            if (isScanning && currentPhase === 'left') {
                if (manualInterval) clearInterval(manualInterval);
                manualInterval = setInterval(() => {
                    rotationProgress.left += 1.2;
                    updateUIProgress(rotationProgress.left);
                    if (rotationProgress.left >= targetAngle) { clearInterval(manualInterval); completePhase(); }
                }, 30);
            }
            break;
        case 'imu-override-right':
            if (isScanning && currentPhase === 'right') {
                if (manualInterval) clearInterval(manualInterval);
                manualInterval = setInterval(() => {
                    rotationProgress.right += 1.2;
                    updateUIProgress(rotationProgress.right);
                    if (rotationProgress.right >= targetAngle) { clearInterval(manualInterval); completePhase(); }
                }, 30);
            }
            break;
        case 'toggle-camera-override': cameraOverride.style.display = cameraOverride.style.display === 'block' ? 'none' : 'block'; break;
        case 'toggle-language': setLanguage(currentLang === 'pl' ? 'en' : 'pl'); break;
    }
});

btnStart.addEventListener('click', async () => {
    initAudio();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraFeed.srcObject = stream;
    } catch (e) { console.error(e); }

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(permission => {
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
                debugInfo.innerText = "IMU: OK";
            } else { debugInfo.innerText = "IMU: Denied"; }
        }).catch(e => { debugInfo.innerText = "IMU: Error"; });
    } else {
        window.addEventListener('deviceorientation', handleOrientation, true);
        debugInfo.innerText = "IMU: Ready";
    }

    isScanning = true;
    currentPhase = 'left';
    rotationProgress = { left: 0, right: 0 };
    initialAlpha = null;
    updateUIProgress(0);
    arrowUI.style.transform = 'scaleX(-1)'; // Start pointing left
    showScreen('scan');
    announce(translations[currentLang].scan_left);
    startBeeping('left');
});

setInterval(() => { if (!isScanning && screens.scan.classList.contains('active') && pendingResult) { triggerResult(pendingResult); pendingResult = null; } }, 200);

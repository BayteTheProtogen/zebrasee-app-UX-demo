const socket = io();
const btnStart = document.getElementById('btn-start');
const screens = {
    start: document.getElementById('start-screen'),
    scan: document.getElementById('scan-screen'),
    result: document.getElementById('result-screen')
};
const announcer = document.getElementById('announcer');
const instructionText = document.getElementById('instruction-text');
const arrowFill = document.getElementById('arrow-path-fill');
const arrowUI = document.getElementById('arrow-ui');
const resultText = document.getElementById('result-text');
const resultIconContainer = document.getElementById('result-icon-container');
const cameraFeed = document.getElementById('camera-feed');
const cameraOverride = document.getElementById('camera-override');

let currentLang = 'pl';
let isScanning = false;
let currentPhase = 'left'; // 'left' or 'right'
let rotationProgress = { left: 0, right: 0 };
let initialAlpha = null;
let targetAngle = 45;

let audioCtx = null;
let beepInterval = null;
let resultInterval = null;

const translations = {
    pl: {
        move: 'Poruszaj<br>urządzeniem',
        scanning: 'Skanuję...',
        safe: 'PRZEJŚCIE BEZPIECZNE',
        stop: 'STOP',
        approach: 'Stop, nadjeżdża pojazd',
        scan_left: 'Skanowanie... przesuwaj urządzenie w lewo...',
        scan_right: 'Skanowanie... przesuwaj urządzenie w prawo...',
        start_btn: 'SKANUJ'
    },
    en: {
        move: 'Move the<br>device',
        scanning: 'Scanning...',
        safe: 'SAFE TO CROSS',
        stop: 'STOP',
        approach: 'STOP, vehicle approaching',
        scan_left: 'Scanning... move device to the left...',
        scan_right: 'Scanning... move device to the right...',
        start_btn: 'SCAN'
    }
};

function announce(msg) {
    announcer.textContent = msg;
}

function setLanguage(lang) {
    currentLang = lang;
    document.getElementById('btn-start').innerText = translations[lang].start_btn;
    document.getElementById('scanning-label').innerText = translations[lang].scanning;
    if (isScanning) {
        updateInstruction();
    }
}

function updateInstruction() {
    instructionText.innerHTML = translations[currentLang].move;
}

function showScreen(name) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.remove('active');
    });
    screens[name].classList.add('active');
}

// Audio Logic
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function startBeeping(side) {
    stopBeeping();
    const baseFreq = side === 'left' ? 400 : 800;

    beepInterval = setInterval(() => {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        const progress = rotationProgress[currentPhase] / targetAngle;
        osc.frequency.setValueAtTime(baseFreq + (progress * 300), now);
        osc.type = side === 'left' ? 'square' : 'triangle';

        g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(g);
        g.connect(audioCtx.destination);

        osc.start();
        osc.stop(now + 0.1);
    }, Math.max(80, 400 - ( (rotationProgress[currentPhase] / targetAngle) * 320 )));
}

function stopBeeping() {
    if (beepInterval) clearInterval(beepInterval);
    if (resultInterval) clearInterval(resultInterval);
}

// Result Audio
function startResultAudio(type) {
    stopBeeping();
    if (type === 'stop') {
        // Alarming low pulse
        resultInterval = setInterval(() => {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.3);
            g.gain.setValueAtTime(0.3, now);
            g.gain.linearRampToValueAtTime(0, now + 0.4);
            osc.connect(g);
            g.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.4);
        }, 500);
    } else {
        // Fast high-pitched ticking like crossing signal
        resultInterval = setInterval(() => {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            g.gain.setValueAtTime(0.2, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.connect(g);
            g.connect(audioCtx.destination);
            osc.start();
            osc.stop(now + 0.05);
        }, 150);
    }
}

// IMU Logic
function handleOrientation(event) {
    if (!isScanning) return;

    let alpha = event.alpha;
    if (initialAlpha === null) {
        initialAlpha = alpha;
        return;
    }

    let diff = alpha - initialAlpha;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    if (currentPhase === 'left') {
        let progress = Math.min(targetAngle, Math.max(0, -diff));
        rotationProgress.left = progress;
        updateUIProgress(progress);
        if (progress >= targetAngle) completePhase();
    } else {
        let progress = Math.min(targetAngle, Math.max(0, diff));
        rotationProgress.right = progress;
        updateUIProgress(progress);
        if (progress >= targetAngle) completePhase();
    }
}

function updateUIProgress(val) {
    const percent = (val / targetAngle) * 100;
    arrowFill.setAttribute('clip-path', `inset(0 ${100 - percent}% 0 0)`);
}

function completePhase() {
    if (currentPhase === 'left') {
        currentPhase = 'right';
        initialAlpha = null;
        arrowUI.style.transform = 'scaleX(-1)';
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
    const resScreen = screens.result;
    resScreen.className = 'screen result-screen active ' + type;

    if (type === 'stop') {
        resultText.innerText = translations[currentLang].stop;
        resultIconContainer.innerHTML = `<svg viewBox="0 0 100 100" class="result-icon"><circle cx="50" cy="50" r="45" fill="white"/><path d="M30 30 L70 70 M70 30 L30 70" stroke="red" stroke-width="10"/></svg>`;
        announce(translations[currentLang].approach);
    } else {
        resultText.innerText = translations[currentLang].safe;
        resultIconContainer.innerHTML = `<svg viewBox="0 0 100 100" class="result-icon"><circle cx="50" cy="50" r="45" fill="white"/><path d="M50 20 L50 80 M30 50 L50 80 L70 50" stroke="green" stroke-width="10" fill="none"/></svg>`;
        announce(translations[currentLang].safe);
    }
    startResultAudio(type);
}

// Controller Commands
let pendingResult = null;
let manualInterval = null;

socket.on('command', (data) => {
    console.log("Phone received command:", data.type);
    switch(data.type) {
        case 'trigger-stop':
            pendingResult = null;
            triggerResult('stop');
            break;
        case 'trigger-safe':
            if (isScanning || screens.scan.classList.contains('active')) {
                pendingResult = 'safe'; // Wait for scan to finish if scanning
                // If scanning is NOT active but we are on scan screen (finished but no result), trigger immediately
                if (!isScanning) {
                    triggerResult('safe');
                    pendingResult = null;
                }
            } else {
                triggerResult('safe');
            }
            break;
        case 'reset':
            location.reload();
            break;
        case 'imu-override-left':
            if (isScanning && currentPhase === 'left') {
                if (manualInterval) clearInterval(manualInterval);
                manualInterval = setInterval(() => {
                    rotationProgress.left += 2;
                    updateUIProgress(rotationProgress.left);
                    if (rotationProgress.left >= targetAngle) {
                        clearInterval(manualInterval);
                        completePhase();
                    }
                }, 50);
            }
            break;
        case 'imu-override-right':
            if (isScanning && currentPhase === 'right') {
                if (manualInterval) clearInterval(manualInterval);
                manualInterval = setInterval(() => {
                    rotationProgress.right += 2;
                    updateUIProgress(rotationProgress.right);
                    if (rotationProgress.right >= targetAngle) {
                        clearInterval(manualInterval);
                        completePhase();
                    }
                }, 50);
            }
            break;
        case 'toggle-camera-override':
            cameraOverride.style.display = cameraOverride.style.display === 'block' ? 'none' : 'block';
            break;
        case 'toggle-language':
            setLanguage(currentLang === 'pl' ? 'en' : 'pl');
            break;
    }
});

btnStart.addEventListener('click', async () => {
    initAudio();

    // Request Camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraFeed.srcObject = stream;
    } catch (e) { console.error("Camera access denied", e); }

    // Request IMU
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
    }

    isScanning = true;
    currentPhase = 'left';
    rotationProgress = { left: 0, right: 0 };
    initialAlpha = null;
    updateUIProgress(0);
    arrowUI.style.transform = 'scaleX(1)';
    showScreen('scan');
    announce(translations[currentLang].scan_left);
    startBeeping('left');
});

// Check for pending result
setInterval(() => {
    if (!isScanning && screens.scan.classList.contains('active') && pendingResult) {
        triggerResult(pendingResult);
        pendingResult = null;
    }
}, 200);

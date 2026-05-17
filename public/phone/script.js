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
let oscillator = null;
let gainNode = null;
let beepInterval = null;

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
}

function startBeeping(side) {
    stopBeeping();
    const frequency = side === 'left' ? 440 : 660; // Different pitch for left/right

    beepInterval = setInterval(() => {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        // Progress affects pitch and speed
        const progress = rotationProgress[currentPhase] / targetAngle;
        osc.frequency.setValueAtTime(frequency + (progress * 200), now);

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
}

// IMU Logic
function handleMotion(event) {
    if (!isScanning) return;

    let alpha = event.alpha; // Z-axis rotation [0, 360]
    if (initialAlpha === null) {
        initialAlpha = alpha;
        return;
    }

    let diff = alpha - initialAlpha;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    if (currentPhase === 'left') {
        // We want negative diff (rotating left)
        let progress = Math.min(targetAngle, Math.max(0, -diff));
        rotationProgress.left = progress;
        updateUIProgress(progress);
        if (progress >= targetAngle) {
            completePhase();
        }
    } else {
        // We want positive diff (rotating right)
        let progress = Math.min(targetAngle, Math.max(0, diff));
        rotationProgress.right = progress;
        updateUIProgress(progress);
        if (progress >= targetAngle) {
            completePhase();
        }
    }
}

function updateUIProgress(val) {
    const percent = (val / targetAngle) * 100;
    arrowFill.setAttribute('clip-path', `inset(0 ${100 - percent}% 0 0)`);
}

function completePhase() {
    if (currentPhase === 'left') {
        currentPhase = 'right';
        initialAlpha = null; // Reset reference
        arrowUI.style.transform = 'scaleX(-1)'; // Flip arrow for right
        announce(translations[currentLang].scan_right);
        startBeeping('right');
    } else {
        finishScanning();
    }
}

function finishScanning() {
    isScanning = false;
    stopBeeping();
    // Wait for controller decision
}

function triggerResult(type) {
    showScreen('result');
    const resScreen = screens.result;
    resScreen.className = 'screen result-screen active ' + type;

    if (type === 'stop') {
        resultText.innerText = translations[currentLang].stop;
        resultIconContainer.innerHTML = `<svg viewBox="0 0 100 100" class="result-icon"><circle cx="50" cy="50" r="45" fill="white"/><path d="M30 30 L70 70 M70 30 L30 70" stroke="red" stroke-width="10"/></svg>`; // Placeholder stop icon
        announce(translations[currentLang].approach);
        playResultAudio('stop');
    } else {
        resultText.innerText = translations[currentLang].safe;
        resultIconContainer.innerHTML = `<svg viewBox="0 0 100 100" class="result-icon"><circle cx="50" cy="50" r="45" fill="white"/><path d="M50 20 L50 80 M30 50 L50 80 L70 50" stroke="green" stroke-width="10" fill="none"/></svg>`; // Placeholder safe icon
        announce(translations[currentLang].safe);
        playResultAudio('safe');
    }
}

function playResultAudio(type) {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);

    if (type === 'stop') {
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
    } else {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.5);
    }
    g.gain.setValueAtTime(0.2, now);
    g.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.start();
    osc.stop(now + 0.5);
}

// Controller Commands
let pendingResult = null;

socket.on('command', (data) => {
    switch(data.type) {
        case 'trigger-stop':
            if (isScanning) {
                finishScanning();
                triggerResult('stop');
            } else if (screens.scan.classList.contains('active')) {
                triggerResult('stop');
            } else {
                pendingResult = 'stop';
            }
            break;
        case 'trigger-safe':
            if (!isScanning && screens.scan.classList.contains('active')) {
                triggerResult('safe');
            } else {
                pendingResult = 'safe';
            }
            break;
        case 'reset':
            location.reload();
            break;
        case 'imu-override-left':
            if (isScanning && currentPhase === 'left') {
                rotationProgress.left = targetAngle;
                completePhase();
            }
            break;
        case 'imu-override-right':
            if (isScanning && currentPhase === 'right') {
                rotationProgress.right = targetAngle;
                completePhase();
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
    } catch (e) {
        console.error("Camera access denied", e);
    }

    // Request IMU
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleMotion);
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('deviceorientation', handleMotion);
    }

    isScanning = true;
    currentPhase = 'left';
    rotationProgress = { left: 0, right: 0 };
    updateUIProgress(0);
    arrowUI.style.transform = 'scaleX(1)';
    showScreen('scan');
    announce(translations[currentLang].scan_left);
    startBeeping('left');
});

// Check if scan finished and result was already triggered
setInterval(() => {
    if (!isScanning && screens.scan.classList.contains('active') && pendingResult) {
        triggerResult(pendingResult);
        pendingResult = null;
    }
}, 500);

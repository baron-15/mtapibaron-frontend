var stationId = '640';
var previousStationId = '640';
var errorCount = 0;
var selectedNumber = 2;
var displayStationBlock = 0;
var displayServiceAlerts = true;
var displayBackgroundImage = true;
var boardWidth = 100;
var currentServiceAlerts = null;
var displayVersion = 'v2';
var stationData = [];
var hiddenRoutes = new Set();
var lastTrainData = [];
var lastFetchTime = null;
var currentStationStops = [];
var trainRotationIndex = 0;
var trainRotationContext = '';
var trainRotationNextAt = 0;
var trainRotationTimers = [];
var TRAIN_ROTATION_LIMIT = 5;
var TRAIN_ROTATION_HOLD_MS = 5000;
var TRAIN_ROTATION_TRANSITION_MS = 600;
var announcementEnabled = false;
var announcementInterval = null;
var stationMap = {};
var announcementPlaying = false;
var audioDir = 'audio8';
var noBoundDirections = ['Uptown', 'Downtown'];
var boundDirections = ['Brooklyn', 'Bronx', 'Queens', 'Manhattan'];
var audioCache = new Map();       // URL -> { audio: HTMLAudioElement, cachedAt: timestamp }
var audioCacheReady = false;
var audioUnlocked = false;
var playbackAudio = null;  // Single reusable Audio element - blessed by user gesture for Safari
var unlockPlayPromise = null;
var AUDIO_CACHE_TTL = 25 * 60 * 60 * 1000;  // 25 hours in ms
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
console.log('Browser detected:', isSafari ? 'Safari' : 'Chrome/Other', '(UA:', navigator.userAgent + ')');
var routeBackgroundColors = {
    A: '#0039a6',
    C: '#0039a6',
    E: '#0039a6',
    B: '#FF6319',
    D: '#FF6319',
    F: '#FF6319',
    M: '#FF6319',
    G: '#6CBE45',
    J: '#996633',
    Z: '#996633',
    L: '#A7A9AC',
    N: '#FCCC0A',
    Q: '#FCCC0A',
    R: '#FCCC0A',
    W: '#FCCC0A',
    S: '#808183',
    1: '#EE352E',
    2: '#EE352E',
    3: '#EE352E',
    4: '#00933C',
    5: '#00933C',
    6: '#00933C',
    7: '#B933AD'
}

async function init() {
    selectedNumber = parseInt(document.getElementById("noOfTrainsEntry").value);
    return;
}


async function loadSomeDisplay (stationId) {
    console.log("Loading display for stationID ", stationId);
    const API_URL = `https://mtapibaron.onrender.com/by-id/${stationId}`;
    if ((stationId.length > 3) || (isNaN(stationId[1])) || (isNaN(stationId[2])))
    {
        console.log(stationId, 'did not pass the eye test.');
        throw new Error("It did not pass the eye test.");
    }

    let response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        response = await fetch(API_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`Station API returned ${response.status}`);
    } finally {
        clearTimeout(timeoutId);
    }

    await response.json()
    .then(responseJson => {
        if (stationId !== globalThis.stationId) return;
        let currentDate = new Date();
        let options = { timeZone: 'America/New_York' };
        let currentDateTimeET = currentDate.toLocaleString('en-US', options);
        lastTrainData = responseJson.data[0].alltrains;
        currentServiceAlerts = responseJson.data[0].serviceAlerts || null;
        currentStationStops = Object.keys(responseJson.data[0].stops);
        lastFetchTime = currentDate;
        renderTrainRows();
        /*
        const mtaRouteText0 = document.getElementById('routeText0');
        const mtaTerminal0 = document.getElementById('terminal0');
        const mtaEta0 = document.getElementById('eta0');
        const mtaRouteText1 = document.getElementById('routeText1');
        const mtaTerminal1 = document.getElementById('terminal1');
        const mtaEta1 = document.getElementById('eta1');
        const mtaRoute0 = document.getElementById('route0');
        const mtaRoute1 = document.getElementById('route1');
        var noOfTrains = Object.keys(responseJson.data[0].alltrains).length;
        var svc0;
        console.log("Number of trains from API is: ", noOfTrains);
        if (noOfTrains >=1) {
            mtaRouteText0.innerHTML = responseJson.data[0].alltrains[0].route.charAt(0);
            mtaTerminal0.innerHTML = responseJson.data[0].alltrains[0].terminalName;
            mtaEta0.innerHTML = responseJson.data[0].alltrains[0].eta;
            mtaEta0.innerHTML += ' min';
            //for future use to display exp box
            svc0 = responseJson.data[0].alltrains[0].service;
            if (responseJson.data[0].alltrains[0].route.slice(-1) == "X")
            {
                mtaRoute0.classList.remove('circle');
                mtaRoute0.classList.add('diamond');
            }
            else
            {
                mtaRoute0.classList.remove('diamond');
                mtaRoute0.classList.add('circle');
            }
        }
        if (noOfTrains >=2) {
            mtaRouteText1.innerHTML = responseJson.data[0].alltrains[1].route.charAt(0);
            mtaTerminal1.innerHTML = responseJson.data[0].alltrains[1].terminalName;
            mtaEta1.innerHTML = responseJson.data[0].alltrains[1].eta;
            mtaEta1.innerHTML += ' min';
            svc1 = responseJson.data[0].alltrains[1].service;
            if (responseJson.data[0].alltrains[1].route.slice(-1) == "X")
            {
                mtaRoute1.classList.remove('circle');
                mtaRoute1.classList.add('diamond');
            }
            else
            {
                mtaRoute1.classList.remove('diamond');
                mtaRoute1.classList.add('circle');
            }
        }
        if (noOfTrains == 0) {
            mtaRouteText0.innerHTML = "";
            mtaTerminal0.innerHTML = "No upcoming train";
            mtaEta0.innerHTML = "";
            mtaRouteText1.innerHTML = "";
            mtaTerminal1.innerHTML = "No upcoming train";
            mtaEta1.innerHTML = "";
        }
        */
        previousStationId = stationId;
        saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
        document.querySelector('#datetime').textContent = 'ID: ' + stationId  + ' ... MTA API Data: ' + responseJson.updated + ' ... Browser Refresh Time: ' + currentDateTimeET + ' ET';
        
        const rawStationName = responseJson.data[0].stationName;
        const stationNameArr = rawStationName.split("|");
        document.querySelector('#stationName').textContent = stationNameArr[0] + ' Station';
        for (let i = 1; i < stationNameArr.length; i++) {
            let altNameBlock = document.createElement("div");
            altNameBlock.id = "stationNameAlt";
            altNameBlock.innerHTML = stationNameArr[i] + ' Station';
            document.querySelector('#stationName').appendChild(altNameBlock);
        }

        let rawRoutes = responseJson.data[0].routes;
        rawRoutes = routeOrderSort(rawRoutes);
        let noOfRoutes = rawRoutes.length;
        document.getElementById("allRoutes").innerHTML = "";

        if (noOfRoutes > 0) {
            document.getElementById("allRoutes").style.display = "grid"; 
          } else {
            document.getElementById("allRoutes").style.display = "none";
          }
          
        for (let k = 1; k <= noOfRoutes; k++) {
            let routeBlock = document.createElement("div");
            routeBlock.className = "route";
            routeBlock.id = "stationRouteText" + k;
            let routeTextBlock = document.createElement("div");
            routeTextBlock.className = "routeText";
            routeTextBlock.id = "routeText" + k;
            routeTextBlock.innerHTML = rawRoutes[k - 1].charAt(0);
            routeTextBlock.dataset.glyph = rawRoutes[k - 1].charAt(0);
            routeBlock.appendChild(routeTextBlock);
            if (rawRoutes[k-1].slice(-1) == "X")
                {
                    routeBlock.classList.remove('circle');
                    routeBlock.classList.add('diamond');
                }
                else
                {
                    routeBlock.classList.remove('diamond');
                    routeBlock.classList.add('circle');
                }
            document.getElementById("allRoutes").appendChild(routeBlock);
        }

        document.querySelectorAll('#allRoutes .route').forEach(block => {
            block.addEventListener('click', () => {
                const letter = block.querySelector('.routeText').innerText.charAt(0);
                toggleRouteFilter(letter);
            });
        });
        applyRouteFilter();
    })
}

function getDisplayTrains() {
    return lastTrainData.filter(train => !hiddenRoutes.has(train.route.charAt(0)) && !currentStationStops.includes(train.terminal.slice(0, -1)));
}

function clearTrainRotationTimers() {
    trainRotationTimers.forEach(timer => clearTimeout(timer));
    trainRotationTimers = [];
}

function scheduleTrainRotation() {
    trainRotationTimers.push(setTimeout(rotateBottomTrain, Math.max(0, trainRotationNextAt - Date.now())));
}

function renderTrainRows() {
    // A refresh may replace the DOM during a transition. Cancel callbacks for old rows,
    // but retain the rotation position and deadline across ordinary data refreshes.
    clearTrainRotationTimers();
    selectedNumber = Math.max(1, Math.min(9, parseInt(document.getElementById("noOfTrainsEntry").value) || 2));
    const filteredTrains = getDisplayTrains();
    const rotationCount = Math.min(TRAIN_ROTATION_LIMIT, filteredTrains.length);
    const canRotate = selectedNumber < rotationCount;
    const context = JSON.stringify([stationId, selectedNumber, displayVersion, [...hiddenRoutes].sort(), [...currentStationStops].sort()]);

    if (context !== trainRotationContext || trainRotationIndex < selectedNumber - 1 || trainRotationIndex >= rotationCount) {
        trainRotationIndex = selectedNumber - 1;
        trainRotationNextAt = 0;
    }
    trainRotationContext = context;
    if (!canRotate) {
        trainRotationIndex = selectedNumber - 1;
        trainRotationNextAt = 0;
    } else if (!trainRotationNextAt) {
        trainRotationNextAt = Date.now() + TRAIN_ROTATION_HOLD_MS;
    }

    const board = document.getElementById("trainBlock");
    board.innerHTML = "";
    for (let slot = 1; slot <= selectedNumber; slot++) {
        const rotating = canRotate && slot === selectedNumber;
        const trainIndex = rotating ? trainRotationIndex : slot - 1;
        const row = createTrainRow(slot, trainIndex + 1, filteredTrains[trainIndex]);
        if (rotating) {
            row.classList.add('rotating-row');
        }
        if (rotating && displayVersion === 'v2') {
            row.style.setProperty('--rotation-duration', TRAIN_ROTATION_TRANSITION_MS + 'ms');
            const number = row.children[0];
            number.textContent = '';
            number.setAttribute('aria-label', 'Train ' + (trainIndex + 1));
            const track = document.createElement('div');
            track.className = 'rotation-number-track';
            track.setAttribute('aria-hidden', 'true');
            for (let position = 1; position <= rotationCount; position++) {
                const value = document.createElement('div');
                value.className = 'rotation-number';
                value.textContent = String(position);
                track.appendChild(value);
            }
            track.style.transform = `translateY(-${trainIndex * 100}%)`;
            number.appendChild(track);
        }
        board.appendChild(row);
    }
    if (canRotate) scheduleTrainRotation();
}

function createTrainRow(slot, position, train) {
    const row = document.createElement('div');
    row.className = 'trainrow ' + displayVersion;
    row.id = 'trainrow' + slot;
    for (const className of ['num', 'route', 'terminal', 'eta']) {
        const element = document.createElement('div');
        element.className = className;
        element.id = className + slot;
        row.appendChild(element);
    }
    row.children[0].textContent = displayVersion === 'v1' ? position + '.' : String(position);
    const routeText = document.createElement('div');
    routeText.className = 'routeText';
    routeText.id = 'routeText' + slot;
    row.children[1].appendChild(routeText);
    populateTrainRow(row, train);
    return row;
}

function populateTrainRow(row, train) {
    const [, route, terminal, eta] = row.children;
    const routeText = route.children[0];
    terminal.textContent = '';
    route.classList.remove('circle', 'diamond');
    if (!train) {
        routeText.textContent = '';
        delete routeText.dataset.glyph;
        terminal.textContent = 'No scheduled';
        eta.textContent = '';
        delete eta.dataset.minutes;
        return;
    }

    routeText.textContent = train.route.charAt(0);
    routeText.dataset.glyph = train.route.charAt(0);
    route.classList.add(train.route.endsWith('X') ? 'diamond' : 'circle');
    if (displayVersion === 'v2') {
        renderV2Destination(terminal, train);
    } else {
        terminal.textContent = train.terminalName;
    }
    const minutes = timeDifference(lastFetchTime || new Date(), new Date(train.time));
    eta.dataset.minutes = minutes;
    if (displayVersion === 'v2') {
        eta.innerHTML = '<span class="eta-number"></span><span class="eta-unit">MIN</span>';
        eta.querySelector('.eta-number').textContent = minutes;
    } else {
        eta.textContent = minutes + ' Min';
    }
}

function rotateBottomTrain() {
    clearTrainRotationTimers();
    const filteredTrains = getDisplayTrains();
    const rotationCount = Math.min(TRAIN_ROTATION_LIMIT, filteredTrains.length);
    const row = document.getElementById('trainrow' + selectedNumber);
    if (selectedNumber >= rotationCount || !row || !row.classList.contains('rotating-row')) {
        renderTrainRows();
        arrivalUpdate();
        routeUpdate();
        return;
    }
    if (document.hidden) {
        trainRotationNextAt = Date.now() + TRAIN_ROTATION_HOLD_MS;
        scheduleTrainRotation();
        return;
    }

    trainRotationIndex = trainRotationIndex + 1 < rotationCount ? trainRotationIndex + 1 : selectedNumber - 1;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = displayVersion === 'v2' && !reduceMotion;
    const duration = animate ? TRAIN_ROTATION_TRANSITION_MS : 0;
    trainRotationNextAt = Date.now() + duration + TRAIN_ROTATION_HOLD_MS;
    if (displayVersion === 'v2') {
        row.querySelector('.rotation-number-track').style.transform = `translateY(-${trainRotationIndex * 100}%)`;
    }

    const swap = () => {
        populateTrainRow(row, filteredTrains[trainRotationIndex]);
        if (displayVersion === 'v2') {
            row.children[0].setAttribute('aria-label', 'Train ' + (trainRotationIndex + 1));
        } else {
            row.children[0].textContent = (trainRotationIndex + 1) + '.';
        }
        updateTrainArrival(row);
        updateRouteColor(row.children[1]);
        row.classList.remove('rotation-out');
    };
    if (animate) {
        row.classList.add('rotation-out');
        trainRotationTimers.push(setTimeout(swap, duration / 2));
    } else {
        swap();
    }
    scheduleTrainRotation();
}

function updateTrainCount() {
    renderTrainRows();
    arrivalUpdate();
    routeUpdate();
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
}

function renderV2Destination(terminalDiv, train) {
    // Older API responses can still supply a plain destination during rollout.
    const hasDisplayLabels = typeof train.terminalPrimary === 'string' && train.terminalPrimary.trim() !== '';
    const primaryText = hasDisplayLabels ? train.terminalPrimary : train.terminalName;
    const secondaryText = hasDisplayLabels ? train.terminalSecondary : null;

    const primaryDiv = document.createElement('div');
    primaryDiv.className = 'terminal-primary';
    primaryDiv.textContent = primaryText;
    terminalDiv.appendChild(primaryDiv);

    if (typeof secondaryText === 'string' && secondaryText.trim() !== '') {
        const secondaryDiv = document.createElement('div');
        secondaryDiv.className = 'terminal-secondary';
        secondaryDiv.textContent = secondaryText;
        terminalDiv.appendChild(secondaryDiv);
    }
}

function runJobOnce() {
    console.log("Running job");
    loadSomeDisplay(stationId).then(
        testBlinking => arrivalUpdate()).then(testColoring => routeUpdate()).catch((err) => {
    errorCount += 1;
    console.log("One error! " + err + " for station " + stationId );
    if (errorCount >= 20) {
        console.log("Too many errors. Abort. Delaying for 15s.");
        setTimeout(() => {
            console.log("Resetting to station 640.");
            stationId = '640';
            previousStationId = '640';
            preselectStation(stationId);
        }, 15000);
        throw new Error("Something went wrong repeatedly.");
    }
    stationId = previousStationId;
    runJobOnce();
    return false;
    });
}

function runJob() {
    runJobOnce();
    var intervalId = setInterval(function () {
        console.log("Running job from interval.");
        runJobOnce();
    }, 15000);
}

function arrivalUpdate () {
    document.querySelectorAll('.trainrow').forEach(updateTrainArrival);
}

function updateTrainArrival(trainrowElement) {
    let etaElement = trainrowElement.querySelector('.eta');
    var etaValue = etaElement.dataset.minutes || etaElement.innerText.split(' ')[0];
    trainrowElement.classList.remove('arrivalyellow', 'arrival-invert');
    etaElement.classList.remove('blink');

    if (etaValue === '0') {
        if (displayVersion === 'v2') {
            trainrowElement.classList.add('arrival-invert');
        } else {
            trainrowElement.classList.add('arrivalyellow');
            etaElement.classList.add('blink');
        }
    }
}

function routeUpdate () {
    document.querySelectorAll('.route').forEach(updateRouteColor);
    errorCount = 0;
}

function updateRouteColor(routeElement) {
    let routeValue = routeElement.innerText.charAt(0); 
    let routeBackgroundColor = routeBackgroundColors[routeValue] || '#808183';
    if (!routeValue) {
        routeBackgroundColor = '#000000';
    } 
    let routeTextColor = '#ffffff';
    if (routeValue === 'N' || routeValue === 'Q' || routeValue === 'R' || routeValue === 'W')
    {
        routeTextColor = '#000000'
    }
    
    routeElement.style.backgroundColor = `${routeBackgroundColor}`;
    routeElement.style.color = `${routeTextColor}`;
}

function toggleRouteFilter(routeLetter) {
    if (hiddenRoutes.has(routeLetter)) {
        hiddenRoutes.delete(routeLetter);
    } else {
        hiddenRoutes.add(routeLetter);
    }
    applyRouteFilter();
}

function applyRouteFilter() {
    document.querySelectorAll('#allRoutes .route').forEach(block => {
        const letter = block.querySelector('.routeText').innerText.charAt(0);
        if (hiddenRoutes.has(letter)) {
            block.classList.add('dimmed');
        } else {
            block.classList.remove('dimmed');
        }
    });

    renderTrainRows();
    arrivalUpdate();
    routeUpdate();
    updateServiceAlertsContext();
}

function updateServiceAlertsContext() {
    if (window.ServiceAlerts) {
        window.ServiceAlerts.setContext({
            stationId,
            trains: getDisplayTrains(),
            serviceAlerts: currentServiceAlerts
        });
    }
}

function toggleServiceAlerts() {
    displayServiceAlerts = document.getElementById('toggleServiceAlerts').checked;
    if (window.ServiceAlerts) window.ServiceAlerts.setEnabled(displayServiceAlerts);
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
}

function toggleBackgroundImage() {
    displayBackgroundImage = document.getElementById('toggleBackgroundImage').checked;
    applyBackgroundImage(displayBackgroundImage);
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
}

// Board width: the share of the screen the board takes, 10-100 percent. The board is sized in container units,
// so this scales its type and spacing too (see --board-width in styles.css).
function updateBoardWidth() {
    boardWidth = normalizeBoardWidth(document.getElementById('boardWidthEntry').value);
    applyBoardWidth(boardWidth);
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
}

function normalizeBoardWidth(value) {
    const width = parseInt(value, 10);
    if (Number.isNaN(width)) return 100;
    return Math.min(100, Math.max(10, width));
}

function applyBoardWidth(width) {
    const input = document.getElementById('boardWidthEntry');
    if (input) input.value = width;
    if (document.documentElement) document.documentElement.style.setProperty('--board-width', width);
}

// Full screen hides the browser or PWA title bar. It needs a user gesture each time, so it is a button, not a saved setting.
function toggleFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else if (root.requestFullscreen) {
        root.requestFullscreen({ navigationUI: 'hide' }).catch(error => console.log('Full screen unavailable:', error.message));
    }
}

function setUpFullscreenButton() {
    const button = document.getElementById('toggleFullscreen');
    if (!button || !document.documentElement || !document.documentElement.requestFullscreen) return;
    button.hidden = false;
    const label = () => { button.textContent = document.fullscreenElement ? 'Exit full screen' : 'Go full screen'; };
    document.addEventListener('fullscreenchange', label);
    label();
}

// Route bullet glyphs: measure each glyph's ink in the font the browser really renders and centre it in the
// bullet. Offsets are per glyph and per font, so they survive fallback (Helvetica Neue on Apple, Roboto on Android).
const ROUTE_GLYPHS = ['1', '2', '3', '4', '5', '6', '7', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'L', 'M', 'N', 'Q', 'R', 'S', 'W', 'Z', '!', 'SIR'];

function centerRouteGlyphs() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext && canvas.getContext('2d');
    const probe = document.createElement('div');
    if (!context || !document.body || !document.head) return;
    probe.className = 'route circle';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const size = 100;
    context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    probe.remove();
    const rules = ROUTE_GLYPHS.map(glyph => {
        const metrics = context.measureText(glyph);
        if (metrics.fontBoundingBoxAscent === undefined) return '';
        // The line box is 1em (line-height: 1) with the font's ascent+descent centred in it.
        const baseline = (size - (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent)) / 2 + metrics.fontBoundingBoxAscent;
        const inkCenterY = baseline - (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
        const inkCenterX = (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2;
        const dx = (metrics.width / 2 - inkCenterX) / size;
        const dy = (size / 2 - inkCenterY) / size;
        return `.routeText[data-glyph="${glyph}"] { --glyph-dx: ${dx.toFixed(4)}em; --glyph-dy: ${dy.toFixed(4)}em; }`;
    });
    let sheet = document.getElementById('routeGlyphOffsets');
    if (!sheet) {
        sheet = document.createElement('style');
        sheet.id = 'routeGlyphOffsets';
        document.head.appendChild(sheet);
    }
    sheet.textContent = rules.join('\n');
}

function applyBackgroundImage(visible) {
    document.getElementById('toggleBackgroundImage').checked = visible;
    if (document.body) document.body.classList.toggle('no-background-image', !visible);
}

function toOrdinal(n) {
    let num = parseInt(n);
    let lastTwo = num % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return n + 'th';
    switch (num % 10) {
        case 1: return n + 'st';
        case 2: return n + 'nd';
        case 3: return n + 'rd';
        default: return n + 'th';
    }
}

function pronounceStationName(name) {
    return name.replace(/(\d+)\s*St\b/g, (m, num) => toOrdinal(num) + ' Street')
               .replace(/(\d+)\s*Av\b/g, (m, num) => toOrdinal(num) + ' Avenue')
               .replace(/-/g, ',. ');
}

function unlockAudio() {
    if (audioUnlocked) return;
    try {
        // Unlock WebAudio API
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);

        // Create a single reusable Audio element and bless it within the user gesture.
        // Safari remembers this element as gesture-authorized for future .play() calls.
        // Use a programmatic silent WAV (iOS ignores volume=0, so a real file would be audible).
        playbackAudio = new Audio();
        var numSamples = 4410; // 0.1s at 44100Hz
        var dataSize = numSamples * 2;
        var wavBuf = new ArrayBuffer(44 + dataSize);
        var wav = new DataView(wavBuf);
        wav.setUint32(0, 0x52494646, false);  // "RIFF"
        wav.setUint32(4, 36 + dataSize, true); // file size - 8
        wav.setUint32(8, 0x57415645, false);  // "WAVE"
        wav.setUint32(12, 0x666D7420, false); // "fmt "
        wav.setUint32(16, 16, true);          // chunk size
        wav.setUint16(20, 1, true);           // PCM
        wav.setUint16(22, 1, true);           // mono
        wav.setUint32(24, 44100, true);       // sample rate
        wav.setUint32(28, 88200, true);       // byte rate
        wav.setUint16(32, 2, true);           // block align
        wav.setUint16(34, 16, true);          // bits per sample
        wav.setUint32(36, 0x64617461, false); // "data"
        wav.setUint32(40, dataSize, true);    // data size (samples are all 0 = silence)
        var silentBlob = new Blob([wavBuf], { type: 'audio/wav' });
        playbackAudio.src = URL.createObjectURL(silentBlob);
        unlockPlayPromise = playbackAudio.play().then(function() {
            playbackAudio.pause();
            console.log('Playback audio element unlocked');
        }).catch(function(e) {
            console.log('Audio unlock play failed:', e);
        });

        audioUnlocked = true;
    } catch (e) {
        console.log('Audio unlock error:', e);
    }
}

function getOrCreateAudio(url) {
    var now = Date.now();
    if (audioCache.has(url)) {
        var entry = audioCache.get(url);
        if (now - entry.cachedAt < AUDIO_CACHE_TTL) {
            // Still valid - renew the rolling TTL and reuse
            entry.cachedAt = now;
            return entry.audio;
        }
        // Expired - revoke old blob URL if any and remove
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
        audioCache.delete(url);
    }
    var audio = new Audio(url);
    audio.preload = 'auto';
    audioCache.set(url, { audio: audio, cachedAt: now, blobUrl: null });
    return audio;
}

// Fetch mp3 as blob and rebuild the cached Audio element from it (works on Safari)
async function fetchAndCacheAudio(url) {
    if (audioCache.has(url)) {
        var entry = audioCache.get(url);
        if (entry.blobUrl || entry.audio.readyState >= 4) return entry.audio;
    }
    try {
        var response = await fetch(url);
        var blob = await response.blob();
        var blobUrl = URL.createObjectURL(blob);
        var audio = new Audio(blobUrl);
        audio.preload = 'auto';
        var entry = audioCache.get(url) || {};
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
        audioCache.set(url, { audio: audio, cachedAt: Date.now(), blobUrl: blobUrl });
        console.log('Cached:', url, '(' + (blob.size / 1024).toFixed(1) + ' KB)');
        return audio;
    } catch (e) {
        console.log('Fetch audio failed for', url, ':', e);
        return getOrCreateAudio(url);
    }
}

function getAudioDuration(src) {
    return new Promise((resolve) => {
        var audio = getOrCreateAudio(src);
        if (audio.duration && !isNaN(audio.duration)) {
            resolve(audio.duration);
            return;
        }
        var resolved = false;
        function done(val) {
            if (resolved) return;
            resolved = true;
            resolve(val);
        }
        audio.addEventListener('loadedmetadata', function onMeta() {
            audio.removeEventListener('loadedmetadata', onMeta);
            done(audio.duration);
        });
        audio.addEventListener('error', function onErr() {
            audio.removeEventListener('error', onErr);
            done(0);
        });
        setTimeout(function() { done(0); }, 2000);
    });
}

async function prewarmAudioCache() {
    if (audioCacheReady) return;

    var files = [];

    // Phrases (7 files)
    ['there_is', 'a', 'an', 'approaching', 'approaching2', 'train', 'train_to'].forEach(function(f) {
        files.push(audioDir + '/phrases/' + f + '.mp3');
    });

    // Directions (7 files)
    ['bound', 'bronx_bound', 'brooklyn_bound', 'downtown', 'manhattan_bound', 'queens_bound', 'uptown'].forEach(function(f) {
        files.push(audioDir + '/directions/' + f + '.mp3');
    });

    // Services (2 files)
    ['express', 'local'].forEach(function(f) {
        files.push(audioDir + '/services/' + f + '.mp3');
    });

    // Routes (23 files)
    ['1','2','3','4','5','6','7','A','B','C','D','E','F','G','J','L','M','N','Q','R','S','W','Z'].forEach(function(f) {
        files.push(audioDir + '/routes/' + f + '.mp3');
    });

    // Minutes separate folder (1-20 numbers + minute/minutes/away = 23 files)
    for (var i = 1; i <= 20; i++) {
        files.push(audioDir + '/minutes/separate/' + i + '.mp3');
    }
    ['minute', 'minutes', 'away'].forEach(function(f) {
        files.push(audioDir + '/minutes/separate/' + f + '.mp3');
    });

    // Use fetch() to download mp3 data as blobs - works on Safari unlike preload='auto'
    await Promise.all(files.map(function(url) {
        return fetchAndCacheAudio(url);
    }));

    audioCacheReady = true;
    console.log('Audio cache pre-warmed:', files.length, 'files');
}

async function preloadClips(clips) {
    await Promise.all(clips.map(function(clipUrl) {
        return fetchAndCacheAudio(clipUrl);
    }));
}

async function playClipSequence(clips, gap) {
    gap = gap || 0;
    await preloadClips(clips);

    if (isSafari) {
        // Safari: single blessed element, no true overlap (just trim end of clips)
        console.log('Using Safari playback (single element, gap=' + gap + 'ms)');
        return await playClipSequenceSafari(clips, gap);
    } else {
        // Chrome/Chromium: multi-element with true overlap support
        console.log('Using Chrome playback (multi-element, gap=' + gap + 'ms)');
        return await playClipSequenceChrome(clips, gap);
    }
}

async function playClipSequenceSafari(clips, gap) {
    // Resolve all durations upfront
    var durations = await Promise.all(clips.map(function(url) {
        return getAudioDuration(url);
    }));

    var audio = playbackAudio || new Audio();

    for (let i = 0; i < clips.length; i++) {
        let entry = audioCache.get(clips[i]);
        let srcUrl = (entry && entry.blobUrl) ? entry.blobUrl : clips[i];
        audio.src = srcUrl;

        // Wait for source to be ready
        await new Promise(function(resolve) {
            if (audio.readyState >= 2) { resolve(); return; }
            function onReady() {
                audio.removeEventListener('canplay', onReady);
                audio.removeEventListener('error', onReady);
                resolve();
            }
            audio.addEventListener('canplay', onReady);
            audio.addEventListener('error', onReady);
            setTimeout(resolve, 2000);
        });

        let clipDone = false;
        let resolvePlay;
        let playPromise = new Promise(function(resolve) { resolvePlay = resolve; });

        let onEnded = function() {
            if (clipDone) return;
            clipDone = true;
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            resolvePlay();
        };
        let onError = function(e) {
            if (clipDone) return;
            clipDone = true;
            console.log('Audio error for', clips[i], ':', e);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            resolvePlay();
        };
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        try {
            await audio.play();
        } catch (e) {
            if (!clipDone) {
                clipDone = true;
                audio.removeEventListener('ended', onEnded);
                audio.removeEventListener('error', onError);
            }
            console.log('Play error for', clips[i], ':', e);
            continue;
        }

        if (gap < 0 && i < clips.length - 1) {
            let duration = durations[i] || 0;
            if (duration > 0) {
                let overlapStart = Math.max((duration * 1000) + gap, 100);
                await new Promise(function(r) { setTimeout(r, overlapStart); });
                if (!clipDone) {
                    clipDone = true;
                    audio.removeEventListener('ended', onEnded);
                    audio.removeEventListener('error', onError);
                }
            } else {
                await playPromise;
            }
        } else {
            await playPromise;
            if (i < clips.length - 1) {
                await new Promise(function(r) { setTimeout(r, gap > 0 ? gap : 45); });
            }
        }
    }
}

async function playClipSequenceChrome(clips, gap) {
    // Chrome: use separate Audio elements for each clip, allows true overlap
    for (let i = 0; i < clips.length; i++) {
        let audio = getOrCreateAudio(clips[i]);
        audio.currentTime = 0;

        let playPromise = new Promise(function(resolve) {
            function onEnded() {
                audio.removeEventListener('ended', onEnded);
                audio.removeEventListener('error', onError);
                resolve();
            }
            function onError(e) {
                console.log('Audio error for', audio.src, ':', e);
                audio.removeEventListener('ended', onEnded);
                audio.removeEventListener('error', onError);
                resolve();
            }
            audio.addEventListener('ended', onEnded);
            audio.addEventListener('error', onError);
        });

        try {
            await audio.play();
        } catch (e) {
            console.log('Play error for', clips[i], ':', e);
            continue;
        }

        if (gap < 0 && i < clips.length - 1) {
            // True overlap: next clip starts while current is still playing
            let duration = audio.duration || 0;
            if (!duration) duration = await getAudioDuration(clips[i]);
            let overlapStart = Math.max((duration * 1000) + gap, 100);
            await new Promise(function(r) { setTimeout(r, overlapStart); });
        } else {
            await playPromise;
            if (i < clips.length - 1) {
                await new Promise(function(r) { setTimeout(r, gap > 0 ? gap : 45); });
            }
        }
    }
}

function getStationFilename(terminalName) {
    if (stationMap[terminalName]) return stationMap[terminalName];
    return terminalName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().replace(/^_|_$/g, '');
}

async function announceNextTrain() {
    if (!announcementEnabled || lastTrainData.length === 0 || announcementPlaying) return;

    let filteredTrains = lastTrainData.filter(train => !hiddenRoutes.has(train.route.charAt(0)) && !currentStationStops.includes(train.terminal.slice(0, -1)));
    if (filteredTrains.length === 0) return;

    let train = filteredTrains[0];
    let currentDate = lastFetchTime || new Date();
    let eta = new Date(train.time);
    let minuteDifference = Math.round((eta.getTime() - currentDate.getTime()) / 60000);

    let clips = [];
    clips.push(audioDir + '/phrases/there_is.mp3');

    let alwaysLocalRoutes = ['S', 'SI', 'H', 'L', 'G'];
    let routeLetter = train.route.charAt(0);
    let serviceFile = alwaysLocalRoutes.includes(routeLetter) ? null
        : (train.service.toLowerCase() === 'expressdiamond' ? 'express' : train.service.toLowerCase());
    let hasDirection = noBoundDirections.includes(train.directionLabel) || boundDirections.includes(train.directionLabel);

    // Terminal-specific announcements now start with service (or the route when
    // service is omitted), so choose a/an from that spoken word, not the terminal.
    let nextWord = hasDirection ? train.directionLabel : (serviceFile || routeLetter);
    let needsAn = !hasDirection && !serviceFile
        ? ['H', 'L', 'S'].includes(routeLetter)
        : /^[AEIOU]/i.test(nextWord);
    clips.push(audioDir + '/phrases/' + (needsAn ? 'an' : 'a') + '.mp3');

    // Preserve Uptown/Downtown and borough-bound prefixes only.
    if (noBoundDirections.includes(train.directionLabel)) {
        // Rule 1: Uptown/Downtown - keep as-is
        clips.push(audioDir + '/directions/' + train.directionLabel.toLowerCase() + '.mp3');
    } else if (boundDirections.includes(train.directionLabel)) {
        // Rule 2: Brooklyn/Bronx/Queens/Manhattan - use direction_bound
        clips.push(audioDir + '/directions/' + train.directionLabel.toLowerCase() + '_bound.mp3');
    }

    // Service announcements
    if (serviceFile) {
        clips.push(audioDir + '/services/' + serviceFile + '.mp3');
    }
    clips.push(audioDir + '/routes/' + routeLetter + '.mp3');

    clips.push(audioDir + '/phrases/train_to.mp3');
    clips.push(audioDir + '/stations/' + getStationFilename(train.terminalName) + '.mp3');

    if (minuteDifference <= 0) {
        clips.push(audioDir + '/phrases/approaching.mp3');
    } else {
        let min = Math.min(Math.max(minuteDifference, 1), 99);
        if (min <= 20) {
            // Use separate files for 1-20 minutes
            clips.push(audioDir + '/minutes/separate/' + min + '.mp3');
            clips.push(audioDir + '/minutes/separate/' + (min === 1 ? 'minute' : 'minutes') + '.mp3');
            clips.push(audioDir + '/minutes/separate/away.mp3');
        } else {
            // Use single file for 21+ minutes
            clips.push(audioDir + '/minutes/' + min + '.mp3');
        }
    }

    announcementPlaying = true;
    try {
        // Preload all clips for smooth playback
        var gapVal = parseInt(document.getElementById("announcementGapEntry").value);
        if (isNaN(gapVal)) gapVal = 0;
        if (gapVal < -1000) gapVal = -1000;
        if (gapVal > 1000) gapVal = 1000;
        await playClipSequence(clips, gapVal);
    } catch (e) {
        console.log('Announcement clip error:', e);
    }
    announcementPlaying = false;
}

function getAnnouncementIntervalMs() {
    let val = parseInt(document.getElementById("announcementIntervalEntry").value);
    if (isNaN(val) || val < 30) val = 30;
    if (val > 1200) val = 1200;
    return val * 1000;
}

async function toggleAnnouncement() {
    var checkbox = document.getElementById("toggleAnnouncement");
    if (checkbox.checked) {
        announcementEnabled = true;
        // Safari: unlock audio session within user gesture
        if (isSafari) {
            console.log('Safari detected: unlocking audio with silent WAV');
            unlockAudio();
            if (unlockPlayPromise) await unlockPlayPromise;
        } else {
            console.log('Chrome detected: no unlock needed');
        }
        await prewarmAudioCache();
        announceNextTrain();
        announcementInterval = setInterval(announceNextTrain, getAnnouncementIntervalMs());
    } else {
        announcementEnabled = false;
        clearInterval(announcementInterval);
        announcementInterval = null;
        announcementPlaying = false;
    }
}

function updateAnnouncementInterval() {
    if (!announcementEnabled) return;
    clearInterval(announcementInterval);
    announcementInterval = setInterval(announceNextTrain, getAnnouncementIntervalMs());
}

var routeSelect = document.getElementById("routeSelect");
var stopSelect = document.getElementById("stopSelect");

routeSelect.addEventListener("change", onRouteChange);
stopSelect.addEventListener("change", onStopChange);

async function loadStationData() {
    const response = await fetch('MTA_Subway_Stations.csv');
    const text = await response.text();
    const lines = text.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const gtfsStopId = cols[0].trim();
        const stopName = cols[5].trim();
        const borough = cols[6].trim();
        const daytimeRoutes = cols[8].trim().split(' ');
        stationData.push({ gtfsStopId, stopName, borough, routes: daytimeRoutes });
    }
    populateRouteDropdown();
}

function populateRouteDropdown() {
    const allRoutes = new Set();
    stationData.forEach(s => s.routes.forEach(r => allRoutes.add(r)));

    const sorted = Array.from(allRoutes).sort((a, b) => {
        const aIsNum = /^\d$/.test(a);
        const bIsNum = /^\d$/.test(b);
        if (aIsNum && bIsNum) return a.localeCompare(b);
        if (aIsNum) return -1;
        if (bIsNum) return 1;
        if (a === 'SIR') return 1;
        if (b === 'SIR') return -1;
        return a.localeCompare(b);
    });

    sorted.forEach(route => {
        const option = document.createElement('option');
        option.value = route;
        option.textContent = route;
        routeSelect.appendChild(option);
    });
}

function onRouteChange() {
    const selectedRoute = routeSelect.value;
    stopSelect.innerHTML = '<option value="">-- Select --</option>';

    if (!selectedRoute) {
        stopSelect.disabled = true;
        return;
    }

    const remainingStations = new Map(stationData
        .filter(s => s.routes.includes(selectedRoute))
        .map(station => [station.gtfsStopId, station]));

    function appendStation(parent, station) {
        const option = document.createElement('option');
        option.value = station.gtfsStopId;
        option.textContent = station.stopName;
        parent.appendChild(option);
    }

    const groups = typeof routeStopOrder === 'undefined' ? [] : routeStopOrder[selectedRoute] || [];
    groups.forEach(group => {
        const stations = group.stops.map(id => remainingStations.get(id)).filter(Boolean);
        if (!stations.length) return;

        const parent = group.label ? document.createElement('optgroup') : stopSelect;
        if (group.label) {
            parent.label = group.label;
            stopSelect.appendChild(parent);
        }
        stations.forEach(station => {
            appendStation(parent, station);
            remainingStations.delete(station.gtfsStopId);
        });
    });

    // Keep newly added stations selectable until their route order is updated.
    Array.from(remainingStations.values())
        .sort((a, b) => a.stopName.localeCompare(b.stopName))
        .forEach(station => appendStation(stopSelect, station));

    stopSelect.disabled = false;
}

function onStopChange() {
    const selectedStopId = stopSelect.value;
    if (!selectedStopId) return;

    hiddenRoutes.clear();
    stationId = selectedStopId;
    currentServiceAlerts = null;
    if (window.ServiceAlerts) window.ServiceAlerts.setContext({ stationId, trains: [], serviceAlerts: null });
    runJobOnce();
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
}

function preselectStation(targetStopId) {
    const station = stationData.find(s => s.gtfsStopId === targetStopId);
    if (!station) return;

    routeSelect.value = station.routes[0];
    onRouteChange();
    stopSelect.value = targetStopId;
}

function saveUserSettings(cS, pS, sN, sB) {
    console.log("Saving user settings...");
    var userSettings = {
        cookieCurrentStation: cS,
        cookiePreviousStation: pS,
        cookieSelectedNo: sN,
        cookieDisplayStationBlock:sB,
        cookieDisplayVersion: displayVersion,
        cookieDisplayServiceAlerts: displayServiceAlerts,
        cookieDisplayBackgroundImage: displayBackgroundImage,
        cookieBoardWidth: boardWidth
    };

    var userSettingsJSON = JSON.stringify(userSettings);
    document.cookie = 'userSettings=' + encodeURIComponent(userSettingsJSON) + '; expires=' + new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString() + '; path=/';
}

function getUserSettings() {
    console.log("Getting user settings...");
    var cookies = document.cookie.split(';');
    var userSettingsCookie = cookies.find(cookie => cookie.trim().startsWith('userSettings='));

    if (userSettingsCookie) {
        var userSettingsJSON = decodeURIComponent(userSettingsCookie.split('=')[1]);
        var userSettings = JSON.parse(userSettingsJSON);
        let editSelectedNumber = document.getElementById("noOfTrainsEntry");
        stationId = userSettings.cookieCurrentStation;
        previousStationId = userSettings.cookiePreviousStation;
        selectedNumber = userSettings.cookieSelectedNo;
        displayStationBlock = userSettings.cookieDisplayStationBlock;
        displayVersion = userSettings.cookieDisplayVersion === 'v1' ? 'v1' : 'v2';
        displayServiceAlerts = userSettings.cookieDisplayServiceAlerts !== false;
        document.getElementById('toggleServiceAlerts').checked = displayServiceAlerts;
        if (window.ServiceAlerts) window.ServiceAlerts.setEnabled(displayServiceAlerts);
        displayBackgroundImage = userSettings.cookieDisplayBackgroundImage !== false;
        applyBackgroundImage(displayBackgroundImage);
        boardWidth = normalizeBoardWidth(userSettings.cookieBoardWidth);
        applyBoardWidth(boardWidth);
        applyStationBlockDisplay(Boolean(displayStationBlock));
        editSelectedNumber.value = selectedNumber;
        document.getElementById('displayVersion').value = displayVersion;
        console.log("Cookie found!", stationId, ", ", previousStationId, ", ", selectedNumber, ",", displayStationBlock);
    }
}

function updateDisplayVersion() {
    displayVersion = document.getElementById('displayVersion').value === 'v1' ? 'v1' : 'v2';
    renderTrainRows();
    arrivalUpdate();
    routeUpdate();
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
}

function toggleStationBlock() {
    let checkbox = document.getElementById("toggleStationBlock");
    displayStationBlock = checkbox.checked ? 1 : 0;
    applyStationBlockDisplay(checkbox.checked);
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
  }

// The station block and the logo/clock header take turns at the top of the board.
function applyStationBlockDisplay(visible) {
    let stationBlock = document.getElementById("stationBlock");
    let checkbox = document.getElementById("toggleStationBlock");
    let header = document.getElementById("boardHeader");
    stationBlock.style.display = visible ? "grid" : "none";
    checkbox.checked = visible;
    if (!header) return;
    header.hidden = visible;
    if (visible) stopBoardClock();
    else startBoardClock();
}

let boardClockTimer = null;
const boardClockFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
});

function startBoardClock() {
    if (boardClockTimer !== null) return;
    const tick = () => {
        const parts = {};
        boardClockFormat.formatToParts(new Date()).forEach(part => { parts[part.type] = part.value; });
        document.getElementById("boardClockMain").textContent = parts.hour + ':' + parts.minute;
        document.getElementById("boardClockSeconds").textContent = ':' + parts.second;
        // Wake just after the next second boundary, so the display never skips a second.
        boardClockTimer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    tick();
}

function stopBoardClock() {
    if (boardClockTimer === null) return;
    clearTimeout(boardClockTimer);
    boardClockTimer = null;
}

function loadURLandSetStationId() {
    /* let currentURL = window.location.href;
    let pathArray = window.location.pathname.split('/');
    if (pathArray[-1].length === 3 || pathArray[-1].length === 4) {
        stationId = pathArray[-1];
        console.log('Detected custom path: ', stationId);
        window.location.replace(pathArray[0]);
    }
    */
}

loadStationData().then(() => {
    return fetch(audioDir + '/station_map.json').then(r => r.json()).then(map => { stationMap = map; });
}).then(() => {
    centerRouteGlyphs();
    init();
    setUpFullscreenButton();
    getUserSettings();
    preselectStation(stationId);
    runJob();
    prewarmAudioCache();
});

// To mock the order of route display based on Times Square (ACENQRWS1237) and Grand Central (4567S) to blend S in middle
// I had to write two separate sort functions to run based on if a letter other S exists
// ChatGPT struggled to lump it into one function
// Unretired as it ran slower in Python backend using mtapi.py
function routeOrderSort(arr) {
    function customComparator1(a, b) {
        if (a[0].match(/[A-Za-z]/) && a[0] !== 'S') {
            if (b[0].match(/[A-Za-z]/) && b[0] !== 'S') {
                return a.localeCompare(b);
            } else {
                return -1;
            }
        } else if (a[0] === 'S') {
            if (b[0] === 'S') {
                return 0;
            } else if (b[0].match(/[A-Za-z]/)) {
                return 1;
            } else {
                return -1;
            }
        } else if (a[0].match(/\d/)) {
            if (b[0].match(/\d/)) {
                return a.localeCompare(b);
            } else {
                return 1;
            }
        } else if (b[0].match(/\d/)) {
            return -1;
        } else {
            return 1;
        }
    }

    function customComparator2(a, b) {
        if (a[0].match(/\d/) && b[0].match(/\d/)) {
            return a.localeCompare(b);
        } else if (a[0].match(/\d/)) {
            return -1;
        } else {
            return 1;
        }
    }

    function uniqueFirstCharacters(a) {
        let uniqueChars = new Set();
        a.forEach(str => {
          let firstChar = str.charAt(0);
          uniqueChars.add(firstChar);
        });
        return Array.from(uniqueChars);
    }

    arr = uniqueFirstCharacters(arr);

    if (arr.some(item => item[0].match(/[A-Za-z]/) && item[0] !== 'S')) {
        return arr.sort(customComparator1);
    }

    else {
        return arr.sort(customComparator2);
    }
}

function timeDifference (startTime, endTime) {
    const timeDifference = endTime.getTime() - startTime.getTime();
    const minuteDifference = Math.round(timeDifference / (1000 * 60));
    if (minuteDifference > 99){
        return "99+";
    }
    else if (minuteDifference == -1) {
        return "0";
    }
    else if (minuteDifference <= -2) {
        let options = { timeZone: 'America/New_York' };
        let startTimeET = startTime.toLocaleString('en-US', options);
        let endTimeET = endTime.toLocaleString('en-US', options);
        console.log("Bad minute difference: ", minuteDifference);
        console.log("Start time: ", startTimeET);
        console.log("End time: ", endTimeET);
        return "ERR";
    }
    else {
        return minuteDifference;
    }
}

/* Dynamic footer support */

let hideTimeout = null;
let footerHoverDismissed = false;
const footer = document.querySelector('.footer');
const swipeThreshold = 50; // Minimum pixels for swipe-up detection
let touchStartY = null;

// Show the footer immediately and cancel any pending hide timer.
function showFooter() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  footer.classList.add('visible');
}

function hideFooter() {
  clearTimeout(hideTimeout);
  hideTimeout = null;
  footer.classList.remove('visible');
}

function closeFooter() {
  footerHoverDismissed = true;
  touchStartY = null;
  hideFooter();
}

// Schedule the footer to hide after 4.5 seconds of inactivity.
function scheduleHideFooter() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  hideTimeout = setTimeout(hideFooter, 4000);
}

// Mouse events: Show footer if hovering near the bottom; otherwise, schedule a hide.
window.addEventListener('mousemove', (e) => {
  const bottomThreshold = window.innerHeight * 0.9;
  if (e.clientY >= bottomThreshold) {
    if (!footerHoverDismissed) {
      showFooter();
    }
  } else {
    // Re-arm hover opening once the pointer leaves the bottom edge.
    footerHoverDismissed = false;
    scheduleHideFooter();
  }
});

// Also hide the footer if the mouse leaves the window.
document.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) {
    scheduleHideFooter();
  }
});

// Touch events: Detect a swipe-up gesture starting in the bottom 10% of the screen.
document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const touchY = e.touches[0].clientY;
    const bottomThreshold = window.innerHeight * 0.9;
    if (touchY >= bottomThreshold) {
      touchStartY = touchY;
    }
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (touchStartY !== null && e.touches.length === 1) {
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY; // Positive when swiping up
    if (deltaY > swipeThreshold) {
      showFooter();
      touchStartY = null; // Prevent repeated triggers during the same swipe
    }
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  touchStartY = null;
  scheduleHideFooter();
});

// For touchscreen: Reset the hide timer when there is interaction with footer inputs.
const interactiveElements = document.querySelectorAll(
  '.footer input, .footer select, .footer button, .footer textarea'
);

interactiveElements.forEach((elem) => {
  // Touch interactions (for mobile)
  elem.addEventListener('touchstart', () => {
    scheduleHideFooter();
  }, { passive: true });

  // Mouse click interactions
  elem.addEventListener('click', () => {
    scheduleHideFooter();
  });

  // Keyboard interactions (e.g., typing in a text field)
  elem.addEventListener('keydown', () => {
    scheduleHideFooter();
  });
});

var stationId = '640';
var previousStationId = '640';
var errorCount = 0;
var selectedNumber = 2;
var displayStationBlock = 0;
var stationData = [];
var hiddenRoutes = new Set();
var lastTrainData = [];
var lastFetchTime = null;
var currentStationStops = [];
var announcementEnabled = false;
var announcementInterval = null;
var stationMap = {};
var announcementPlaying = false;
var audioDir = 'audio7';
var audioCache = new Map();       // URL -> { audio: HTMLAudioElement, cachedAt: timestamp }
var audioCacheReady = false;
var AUDIO_CACHE_TTL = 25 * 60 * 60 * 1000;  // 25 hours in ms
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
    //const API_URL = `https://mta-api-project.uc.r.appspot.com/by-id/${stationId}`;
    const API_URL = `https://mtapibaron.onrender.com/by-id/${stationId}`;
    //const API_URL = `http://127.0.0.1:5000/by-id/${stationId}`;
    if ((stationId.length > 3) || (isNaN(stationId[1])) || (isNaN(stationId[2])))
    {
        console.log(stationId, 'did not pass the eye test.');
        throw new Error("It did not pass the eye test.");
    }
    
    await fetch(API_URL)
    .then(response => response.json())
    .then(responseJson => {
        let currentDate = new Date();
        let options = { timeZone: 'America/New_York' };
        let currentDateTimeET = currentDate.toLocaleString('en-US', options);
        lastTrainData = responseJson.data[0].alltrains;
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

function renderTrainRows() {
    selectedNumber = parseInt(document.getElementById("noOfTrainsEntry").value);
    let filteredTrains = lastTrainData.filter(train => !hiddenRoutes.has(train.route.charAt(0)) && !currentStationStops.includes(train.terminal.slice(0, -1)));
    let currentDate = lastFetchTime || new Date();

    document.getElementById("trainBlock").innerHTML = "";
    for (let k = 1; k <= selectedNumber; k++) {
        let trainrowDiv = document.createElement("div");
        trainrowDiv.className = "trainrow";
        trainrowDiv.id = "trainrow" + k;

        let numDiv = document.createElement("div");
        numDiv.className = "num";
        numDiv.id = "num" + k;
        numDiv.innerHTML = k + ".";

        let routeDiv = document.createElement("div");
        routeDiv.className = "route";
        routeDiv.id = "route" + k;

        let routeTextDiv = document.createElement("div");
        routeTextDiv.className = "routeText";
        routeTextDiv.id = "routeText" + k;

        routeDiv.appendChild(routeTextDiv);

        let terminalDiv = document.createElement("div");
        terminalDiv.className = "terminal";
        terminalDiv.id = "terminal" + k;

        let etaDiv = document.createElement("div");
        etaDiv.className = "eta";
        etaDiv.id = "eta" + k;

        trainrowDiv.appendChild(numDiv);
        trainrowDiv.appendChild(routeDiv);
        trainrowDiv.appendChild(terminalDiv);
        trainrowDiv.appendChild(etaDiv);
        document.getElementById("trainBlock").appendChild(trainrowDiv);

        if (filteredTrains.length >= k) {
            routeTextDiv.innerHTML = filteredTrains[k - 1].route.charAt(0);
            terminalDiv.innerHTML = filteredTrains[k - 1].terminalName;
            let etaString = filteredTrains[k - 1].time;
            let eta = new Date(etaString);
            etaDiv.innerHTML = timeDifference(currentDate, eta);
            etaDiv.innerHTML += ' min';
            if (filteredTrains[k - 1].route.slice(-1) == "X") {
                routeDiv.classList.remove('circle');
                routeDiv.classList.add('diamond');
            } else {
                routeDiv.classList.remove('diamond');
                routeDiv.classList.add('circle');
            }
        } else {
            routeTextDiv.innerHTML = "";
            terminalDiv.innerHTML = "No scheduled";
            etaDiv.innerHTML = "";
        }
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
    let trainrowElements = document.querySelectorAll('.trainrow');
    trainrowElements.forEach(function(trainrowElement) {
        let etaElement = trainrowElement.querySelector('.eta');
        var etaValue = etaElement.innerText; 
        if (etaValue === '0 min') {
            trainrowElement.classList.add('arrivalyellow');
            etaElement.classList.add('blink');
        }

        else {
            trainrowElement.classList.remove('arrivalyellow');
            etaElement.classList.remove('blink');
        }
    })

}   

function routeUpdate () {
    let routeElements = document.querySelectorAll('.route');
    routeElements.forEach(function(routeElement) {
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
    })
    errorCount = 0;
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

function getOrCreateAudio(url) {
    var now = Date.now();
    if (audioCache.has(url)) {
        var entry = audioCache.get(url);
        if (now - entry.cachedAt < AUDIO_CACHE_TTL) {
            // Still valid - renew the rolling TTL and reuse
            entry.cachedAt = now;
            entry.audio.currentTime = 0;
            return entry.audio;
        }
        // Expired - remove and create fresh
        audioCache.delete(url);
    }
    var audio = new Audio(url);
    audio.preload = 'auto';
    audioCache.set(url, { audio: audio, cachedAt: now });
    return audio;
}

function getAudioDuration(src) {
    return new Promise((resolve) => {
        var audio = getOrCreateAudio(src);
        if (audio.duration && !isNaN(audio.duration)) {
            resolve(audio.duration);
            return;
        }
        audio.addEventListener('loadedmetadata', function onMeta() {
            audio.removeEventListener('loadedmetadata', onMeta);
            resolve(audio.duration);
        });
        audio.addEventListener('error', function onErr() {
            audio.removeEventListener('error', onErr);
            resolve(0);
        });
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

    // Minutes 1-10 (10 files)
    for (var i = 1; i <= 10; i++) {
        files.push(audioDir + '/minutes/' + i + '.mp3');
    }

    var loadPromises = files.map(function(url) {
        return new Promise(function(resolve) {
            var audio = getOrCreateAudio(url);
            if (audio.readyState >= 4) {
                resolve();
                return;
            }
            audio.addEventListener('canplaythrough', function onReady() {
                audio.removeEventListener('canplaythrough', onReady);
                resolve();
            });
            audio.addEventListener('error', function onErr() {
                audio.removeEventListener('error', onErr);
                resolve();
            });
            setTimeout(resolve, 3000);
        });
    });

    await Promise.all(loadPromises);
    audioCacheReady = true;
    console.log('Audio cache pre-warmed:', files.length, 'files');
}

async function preloadClips(clips) {
    var preloadPromises = clips.map(function(clipUrl) {
        return new Promise(function(resolve) {
            var audio = getOrCreateAudio(clipUrl);
            // Already fully loaded - skip
            if (audio.readyState >= 4) {
                resolve();
                return;
            }
            audio.addEventListener('canplaythrough', function onReady() {
                audio.removeEventListener('canplaythrough', onReady);
                resolve();
            });
            audio.addEventListener('error', function onErr() {
                audio.removeEventListener('error', onErr);
                resolve();
            });
            setTimeout(resolve, 2000);
        });
    });
    await Promise.all(preloadPromises);
}

async function playClipSequence(clips, gap) {
    gap = gap || 0;

    // Preload all clips first for smoother playback
    await preloadClips(clips);

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

    // Determine the next word for a/an check
    let alwaysLocalRoutes = ['S', 'SI', 'H', 'L', 'G'];
    let nextWord = '';

    // Check direction rules to determine what comes after a/an
    let noBoundDirections = ['Uptown', 'Downtown'];
    let boundDirections = ['Brooklyn', 'Bronx', 'Queens', 'Manhattan'];

    // Direction is always announced first, so check what direction will be said
    if (noBoundDirections.includes(train.directionLabel)) {
        // Uptown or Downtown
        nextWord = train.directionLabel;
    } else if (boundDirections.includes(train.directionLabel)) {
        // Brooklyn/Bronx/Queens/Manhattan bound
        nextWord = train.directionLabel;
    } else {
        // Everything else uses terminalName_bound
        let terminalForBound = train.terminalName;
        if (train.terminalName.includes('-')) {
            if (train.terminalName.includes('Van Cortlandt Park')) {
                // Use first part before dash for Van Cortlandt Park
                terminalForBound = train.terminalName.split('-')[0].trim();
            } else if (train.terminalName.includes('Astoria')) {
                // Use last part after dash for Astoria
                terminalForBound = train.terminalName.split('-').pop().trim();
            } else {
                // Use full name for everything else
                terminalForBound = train.terminalName;
            }
        }
        nextWord = terminalForBound;
    }

    // Add a/an based on the actual next word
    clips.push(/^[AEIOU]/i.test(nextWord) ? audioDir + '/phrases/an.mp3' : audioDir + '/phrases/a.mp3');

    // Direction logic with new rules
    let usedTerminalNameBound = false;
    if (noBoundDirections.includes(train.directionLabel)) {
        // Rule 1: Uptown/Downtown - keep as-is
        clips.push(audioDir + '/directions/' + train.directionLabel.toLowerCase() + '.mp3');
    } else if (boundDirections.includes(train.directionLabel)) {
        // Rule 2: Brooklyn/Bronx/Queens/Manhattan - use direction_bound
        clips.push(audioDir + '/directions/' + train.directionLabel.toLowerCase() + '_bound.mp3');
    } else {
        // Rule 3: Everything else - use terminalName_bound
        let terminalForBound = train.terminalName;
        if (train.terminalName.includes('-')) {
            if (train.terminalName.includes('Van Cortlandt Park')) {
                // Use first part before dash for Van Cortlandt Park
                terminalForBound = train.terminalName.split('-')[0].trim();
            } else if (train.terminalName.includes('Astoria')) {
                // Use last part after dash for Astoria
                terminalForBound = train.terminalName.split('-').pop().trim();
            } else {
                // Use full name for everything else
                terminalForBound = train.terminalName;
            }
        }
        clips.push(audioDir + '/stations/' + getStationFilename(terminalForBound) + '.mp3');
        clips.push(audioDir + '/directions/bound.mp3');
        usedTerminalNameBound = true;
    }

    // Service announcements
    if (!alwaysLocalRoutes.includes(train.route.charAt(0))) {
        let serviceFile = train.service.toLowerCase() === 'expressdiamond' ? 'express' : train.service.toLowerCase();
        clips.push(audioDir + '/services/' + serviceFile + '.mp3');
    }
    clips.push(audioDir + '/routes/' + train.route.charAt(0) + '.mp3');

    // If we already said terminalName_bound, just say "train", otherwise say "train to terminalName"
    if (usedTerminalNameBound) {
        clips.push(audioDir + '/phrases/train.mp3');
    } else {
        clips.push(audioDir + '/phrases/train_to.mp3');
        clips.push(audioDir + '/stations/' + getStationFilename(train.terminalName) + '.mp3');
    }

    if (minuteDifference <= 0) {
        clips.push(audioDir + '/phrases/approaching.mp3');
    } else {
        let min = Math.min(Math.max(minuteDifference, 1), 99);
        clips.push(audioDir + '/minutes/' + min + '.mp3');
    }

    announcementPlaying = true;
    try {
        // Preload all clips for smooth playback
        await playClipSequence(clips, -3);
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
        // Pre-warm common audio files on first toggle (within user gesture for iOS)
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
        const daytimeRoutes = cols[8].trim().split(' ');
        stationData.push({ gtfsStopId, stopName, routes: daytimeRoutes });
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

    const matchingStations = stationData
        .filter(s => s.routes.includes(selectedRoute))
        .sort((a, b) => a.stopName.localeCompare(b.stopName));

    matchingStations.forEach(station => {
        const option = document.createElement('option');
        option.value = station.gtfsStopId;
        option.textContent = station.stopName;
        stopSelect.appendChild(option);
    });

    stopSelect.disabled = false;
}

function onStopChange() {
    const selectedStopId = stopSelect.value;
    if (!selectedStopId) return;

    hiddenRoutes.clear();
    stationId = selectedStopId;
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
        cookieDisplayStationBlock:sB
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
        let stationBlock = document.getElementById("stationBlock");
        let checkbox = document.getElementById("toggleStationBlock");
        if (displayStationBlock) {
            stationBlock.style.display = "grid";
            checkbox.checked = true;
          } else {
            stationBlock.style.display = "none";
            checkbox.checked = false;
          }
        editSelectedNumber.value = selectedNumber;
        console.log("Cookie found!", stationId, ", ", previousStationId, ", ", selectedNumber, ",", displayStationBlock);
    }
}

function toggleStationBlock() {
    let stationBlock = document.getElementById("stationBlock");
    let checkbox = document.getElementById("toggleStationBlock");

    if (checkbox.checked) {
      stationBlock.style.display = "grid";
      displayStationBlock = 1;
    } else {
      stationBlock.style.display = "none";
      displayStationBlock = 0;
    }
    saveUserSettings(stationId, previousStationId, selectedNumber, displayStationBlock);
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
    init();
    getUserSettings();
    preselectStation(stationId);
    runJob();
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

// Schedule the footer to hide after 5 seconds of inactivity.
function scheduleHideFooter() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  hideTimeout = setTimeout(() => {
    footer.classList.remove('visible');
    hideTimeout = null;
  }, 5000);
}

// Mouse events: Show footer if hovering near the bottom; otherwise, schedule a hide.
window.addEventListener('mousemove', (e) => {
  const bottomThreshold = window.innerHeight * 0.9;
  if (e.clientY >= bottomThreshold) {
    showFooter();
  } else {
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

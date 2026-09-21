const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../javascript.js'), 'utf8');
const stations = readFileSync(join(__dirname, '../MTA_Subway_Stations.csv'), 'utf8');

async function loadApp() {
    const element = () => ({
        children: [],
        addEventListener() {},
        appendChild(child) { this.children.push(child); }
    });
    const app = vm.createContext({
        console: { log() {} },
        navigator: { userAgent: 'Test' },
        window: { addEventListener() {} },
        document: {
            getElementById: element,
            querySelector: element,
            querySelectorAll: () => [],
            createElement: element,
            addEventListener() {}
        },
        // Hold automatic startup so no network, audio, or polling runs in tests.
        fetch: () => new Promise(() => {})
    });
    vm.runInContext(source, app);
    app.fetch = async () => ({ text: async () => stations });
    app.populateRouteDropdown = () => {};
    await app.loadStationData();
    return app;
}

test('Manhattan directions add Brooklyn or Queens, and uptown adds The Bronx', async () => {
    const app = await loadApp();
    app.stationId = '127';
    for (const directionLabel of ['Uptown', 'Downtown']) {
        for (const [terminal, suffix] of [
            ['R45S', ' & Brooklyn'], ['G08N', ' & Queens'],
            ['A02N', '']
        ]) {
            assert.equal(app.getV2DirectionLabel({ directionLabel, terminal }), directionLabel + suffix);
        }
        for (const terminal of ['101N', '201N', '401N', '501N', '601N', 'D01N', '401']) {
            const expected = directionLabel === 'Uptown' ? 'Uptown & The Bronx' : directionLabel;
            assert.equal(app.getV2DirectionLabel({ directionLabel, terminal }), expected);
        }
    }
});

test('borough labels combine with a different eligible terminal borough', async () => {
    const app = await loadApp();
    const terminals = { Manhattan: 'R27S', Brooklyn: 'D43S', Queens: 'G08N' };
    for (const directionLabel of Object.keys(terminals)) {
        for (const [borough, terminal] of Object.entries(terminals)) {
            const expected = borough === directionLabel ? directionLabel : directionLabel + ' & ' + borough;
            assert.equal(app.getV2DirectionLabel({ directionLabel, terminal }), expected);
        }
        assert.equal(app.getV2DirectionLabel({ directionLabel, terminal: '401N' }), directionLabel);
    }
    assert.equal(app.getV2DirectionLabel({ directionLabel: 'Bronx', terminal: 'R27S' }), 'Bronx');
});

test('unknown stations, missing destinations, and non-Manhattan uptown labels fall back', async () => {
    const app = await loadApp();
    for (const stationId of ['R31', 'R01', '414', 'unknown']) {
        app.stationId = stationId;
        assert.equal(app.getV2DirectionLabel({ directionLabel: 'Uptown', terminal: 'G08N' }), 'Uptown');
        assert.equal(app.getV2DirectionLabel({ directionLabel: 'Uptown', terminal: '401N' }), 'Uptown');
    }
    app.stationId = '127';
    for (const terminal of [undefined, '', 'unknownN', 'S17S']) {
        assert.equal(app.getV2DirectionLabel({ directionLabel: 'Downtown', terminal }), 'Downtown');
    }
    assert.equal(app.getV2DirectionLabel({ directionLabel: 'Uptown', terminal: 'G08' }), 'Uptown & Queens');
});

test('v2 renders the combined headline with the complete terminal subtitle', async () => {
    const app = await loadApp();
    app.stationId = 'R01';
    const container = app.document.createElement('div');
    app.renderV2Destination(container, {
        directionLabel: 'Manhattan', terminal: 'D43S', terminalName: 'Coney Island-Stillwell Av'
    });
    assert.equal(container.children[0].textContent, 'Manhattan & Brooklyn');
    assert.equal(container.children[1].textContent, 'Coney Island-Stillwell Av');

    app.stationId = '127';
    const bronx = app.document.createElement('div');
    app.renderV2Destination(bronx, {
        directionLabel: 'Uptown', terminal: '401N', terminalName: 'Woodlawn'
    });
    assert.equal(bronx.children[0].textContent, 'Uptown & The Bronx');
    assert.equal(bronx.children[1].textContent, 'Woodlawn');

    const fallback = app.document.createElement('div');
    app.renderV2Destination(fallback, {
        directionLabel: 'Southbound', terminal: 'R45S', terminalName: 'Bay Ridge-95 St'
    });
    assert.equal(fallback.children[0].textContent, 'Bay Ridge-95 St');
    assert.equal(fallback.children.length, 1);
});

test('announcements still use the original direction rather than the v2 combination', async () => {
    const app = await loadApp();
    app.stationId = '127';
    app.announcementEnabled = true;
    app.lastFetchTime = new Date('2026-09-07T12:00:00Z');
    app.lastTrainData = [{
        route: 'R', service: 'local', directionLabel: 'Uptown',
        terminal: 'G08N', terminalName: 'Forest Hills-71 Av', time: '2026-09-07T12:05:00Z'
    }];
    let playedClips;
    app.playClipSequence = async clips => { playedClips = Array.from(clips); };
    await app.announceNextTrain();
    assert.ok(playedClips.includes('audio8/directions/uptown.mp3'));
    assert.ok(!playedClips.some(clip => clip.includes('queens_bound') || clip.includes('&')));
});

async function announcementClips(overrides) {
    const app = await loadApp();
    app.announcementEnabled = true;
    app.stationMap = JSON.parse(readFileSync(join(__dirname, '../audio8/station_map.json'), 'utf8'));
    app.lastFetchTime = new Date('2026-09-07T12:00:00Z');
    app.lastTrainData = [{
        route: '7', service: 'local', directionLabel: 'Flushing-Main St',
        terminal: '701N', terminalName: 'Flushing-Main St',
        time: '2026-09-07T12:05:00Z', ...overrides
    }];
    let result;
    app.playClipSequence = async clips => { result = Array.from(clips); };
    await app.announceNextTrain();
    for (const clip of result) {
        assert.ok(existsSync(join(__dirname, '..', clip)), `Missing audio: ${clip}`);
    }
    return result.map(clip => clip.replace('audio8/', ''));
}

test('terminal announcements say service and route before train to the full destination', async () => {
    for (const [route, service, terminalName, stationFile, article] of [
        ['7', 'local', 'Flushing-Main St', 'flushing_main_st', 'a'],
        ['7X', 'ExpressDiamond', 'Flushing-Main St', 'flushing_main_st', 'an'],
        ['7', 'express', 'Flushing-Main St', 'flushing_main_st', 'an'],
        ['N', 'local', 'Astoria-Ditmars Blvd', 'astoria_ditmars_blvd', 'a'],
        ['1', 'local', 'Van Cortlandt Park-242 St', 'van_cortlandt_park_242_st', 'a']
    ]) {
        const clips = await announcementClips({ route, service, terminalName });
        assert.deepEqual(clips, [
            'phrases/there_is.mp3', `phrases/${article}.mp3`,
            `services/${service.toLowerCase() === 'local' ? 'local' : 'express'}.mp3`,
            `routes/${route.charAt(0)}.mp3`, 'phrases/train_to.mp3', `stations/${stationFile}.mp3`,
            'minutes/separate/5.mp3', 'minutes/separate/minutes.mp3', 'minutes/separate/away.mp3'
        ]);
    }
});

test('Uptown, Downtown, and every borough-bound prefix retain their full clip order', async () => {
    for (const directionLabel of ['Uptown', 'Downtown', 'Brooklyn', 'Bronx', 'Queens', 'Manhattan']) {
        const suffix = ['Uptown', 'Downtown'].includes(directionLabel) ? '' : '_bound';
        assert.deepEqual(await announcementClips({ directionLabel }), [
            'phrases/there_is.mp3', `phrases/${directionLabel === 'Uptown' ? 'an' : 'a'}.mp3`,
            `directions/${directionLabel.toLowerCase()}${suffix}.mp3`,
            'services/local.mp3', 'routes/7.mp3', 'phrases/train_to.mp3',
            'stations/flushing_main_st.mp3', 'minutes/separate/5.mp3',
            'minutes/separate/minutes.mp3', 'minutes/separate/away.mp3'
        ]);
    }
});

test('terminal announcements retain service omission and approaching wording', async () => {
    for (const [route, article] of [['L', 'an'], ['G', 'a'], ['S', 'an']]) {
        assert.deepEqual(await announcementClips({ route, time: '2026-09-07T12:00:00Z' }), [
            'phrases/there_is.mp3', `phrases/${article}.mp3`, `routes/${route}.mp3`,
            'phrases/train_to.mp3', 'stations/flushing_main_st.mp3', 'phrases/approaching.mp3'
        ]);
    }
});

test('countdowns retain minute data, v1 Min text, and separate v2 units', async () => {
    const app = await loadApp();
    const makeElement = () => {
        const number = {};
        return {
            children: [], dataset: {},
            classList: { add() {}, remove() {} },
            appendChild(child) { this.children.push(child); },
            querySelector(selector) {
                assert.equal(selector, '.eta-number');
                return number;
            }
        };
    };
    for (const version of ['v1', 'v2']) {
        for (const minutes of [0, 2, 12]) {
            const board = makeElement();
            app.document.createElement = makeElement;
            app.document.getElementById = id => id === 'trainBlock' ? board : { value: '1' };
            app.displayVersion = version;
            app.lastFetchTime = new Date('2026-09-07T12:00:00Z');
            app.lastTrainData = [{
                route: '1', directionLabel: 'Downtown', terminal: '142S',
                terminalName: 'South Ferry',
                time: new Date(app.lastFetchTime.getTime() + minutes * 60000).toISOString()
            }];
            app.renderTrainRows();
            const row = board.children[0];
            assert.equal(row.className, 'trainrow ' + version);
            assert.equal(row.children[0].textContent, version === 'v1' ? '1.' : '1');
            const eta = row.children[3];
            assert.equal(Number(eta.dataset.minutes), minutes);
            if (version === 'v1') {
                assert.equal(eta.textContent, minutes + ' Min');
                assert.equal(eta.innerHTML, undefined);
            } else {
                assert.equal(Number(eta.querySelector('.eta-number').textContent), minutes);
                assert.ok(eta.innerHTML.includes('<span class="eta-unit">MIN</span>'));
            }
        }
    }
});

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

test('v2 renders backend primary and secondary labels verbatim for any line', async () => {
    const app = await loadApp();
    for (const [route, terminalPrimary, terminalSecondary] of [
        ['F', 'Manhattan', 'Coney Island-Stillwell Av via Roosevelt Island'],
        ['R', 'Manhattan', 'Forest Hills-71 Av'],
        ['4', 'Manhattan', 'Crown Hts-Utica Av'],
        ['A', 'Brooklyn', 'Rockaway Park-Beach 116 St'],
        ['4', 'Uptown & The Bronx', 'Woodlawn'],
        ['M', 'Uptown & Queens', 'Forest Hills-71 Av via Roosevelt Island'],
        ['F', 'Uptown & Queens', 'Jamaica-179 St via Roosevelt Island']
    ]) {
        const train = { route, terminalPrimary, terminalSecondary,
            directionLabel: 'Unused direction', terminalName: 'Raw audio destination' };
        const original = JSON.stringify(train);
        const container = app.document.createElement('div');
        app.renderV2Destination(container, train);
        assert.equal(container.children[0].className, 'terminal-primary');
        assert.equal(container.children[0].textContent, terminalPrimary);
        assert.equal(container.children[1].className, 'terminal-secondary');
        assert.equal(container.children[1].textContent, terminalSecondary);
        assert.equal(JSON.stringify(train), original, 'Rendering must preserve raw V1/audio fields');
    }
});

test('old or incomplete API responses fall back to one plain terminal line', async () => {
    const app = await loadApp();
    app.stationId = '127';
    for (const terminalPrimary of [undefined, null, '', '  ', 5, {}]) {
        const container = app.document.createElement('div');
        app.renderV2Destination(container, {
            terminalPrimary, terminalSecondary: 'Orphaned subtitle', directionLabel: 'Uptown',
            terminal: '401N', terminalName: 'Woodlawn'
        });
        assert.equal(container.children[0].textContent, 'Woodlawn');
        assert.equal(container.children.length, 1);
    }
});

test('null, empty, or missing subtitles do not create a secondary line', async () => {
    const app = await loadApp();
    for (const terminalSecondary of [undefined, null, '', '  ', 5, {}]) {
        const container = app.document.createElement('div');
        app.renderV2Destination(container, {
            terminalPrimary: 'Flushing-Main St', terminalSecondary,
            terminalName: 'Flushing-Main St', directionLabel: 'Queens'
        });
        assert.equal(container.children[0].textContent, 'Flushing-Main St');
        assert.equal(container.children.length, 1);
    }
});

test('backend labels render as text rather than HTML', async () => {
    const app = await loadApp();
    const container = app.document.createElement('div');
    const terminalPrimary = '<b>Uptown & Queens</b>';
    const terminalSecondary = '<img src=x onerror=alert(1)>';
    app.renderV2Destination(container, { terminalPrimary, terminalSecondary });
    assert.equal(container.children[0].textContent, terminalPrimary);
    assert.equal(container.children[1].textContent, terminalSecondary);
    assert.ok(container.children.every(child => child.innerHTML === undefined));
});

test('only standalone JFK words in secondary labels receive the airport marker', async () => {
    const app = await loadApp();
    for (const secondary of ['JFK', 'Jamaica Center/JFK', 'Far Rockaway-Mott Av/JFK via Roosevelt Island',
        'Howard Beach-JFK Airport', 'jfk', 'JFK / JFK', '<img src=x onerror=alert(1)>/JFK']) {
        const train = { terminalPrimary: 'JFK in primary stays plain', terminalSecondary: secondary,
            terminalName: 'Full audio destination' };
        const original = JSON.stringify(train);
        const container = app.document.createElement('div');
        app.renderV2Destination(container, train);
        const [primary, subtitle] = container.children;
        assert.equal(primary.textContent, train.terminalPrimary);
        assert.equal(primary.children.length, 0);
        assert.equal(subtitle.children.map(part => part.textContent).join(''), secondary);
        assert.equal(subtitle.children.filter(part => part.className === 'airport-destination').length,
            secondary.match(/\bJFK\b/gi).length);
        assert.ok(subtitle.children.every(part => part.innerHTML === undefined));
        assert.equal(JSON.stringify(train), original, 'The icon must not change API/audio text');
    }
    for (const terminalSecondary of ['Forest Hills', 'JFK2', 'NOTJFK']) {
        const container = app.document.createElement('div');
        app.renderV2Destination(container, { terminalPrimary: 'Howard Beach-JFK Airport', terminalSecondary });
        assert.equal(container.children[0].children.length, 0);
        assert.equal(container.children[1].children.length, 0);
        assert.equal(container.children[1].textContent, terminalSecondary);
    }
});

test('announcements still use the original direction rather than the v2 combination', async () => {
    const app = await loadApp();
    app.stationId = '127';
    app.announcementEnabled = true;
    app.lastFetchTime = new Date('2026-09-07T12:00:00Z');
    app.lastTrainData = [{
        route: 'R', service: 'local', directionLabel: 'Uptown',
        terminal: 'G08N', terminalName: 'Forest Hills-71 Av',
        terminalPrimary: 'Uptown & Queens', terminalSecondary: 'Forest Hills-71 Av via Roosevelt Island', time: '2026-09-07T12:05:00Z'
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

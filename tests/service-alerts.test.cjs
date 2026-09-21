const assert = require('node:assert/strict');
const { test } = require('node:test');
const { selectVisibleAlerts, normalizeRoute, pageAlerts, updatedLabel, createServiceAlerts } = require('../service-alerts.js');
const NOW = Date.parse('2026-09-20T12:00:00Z');
const alert = (id, routes = ['A'], overrides = {}) => ({
    id, routes, stationWide: false, text: '[A] trains are delayed.', type: 'Delays',
    planned: false, updatedAt: NOW / 1000 - 60, schedule: '', activeUntil: null, ...overrides
});
const payload = (alerts, overrides = {}) => ({ status: 'ok', updatedAt: NOW / 1000 - 1800, expiresAt: NOW / 1000 + 300, alerts, ...overrides });
const context = { stationId: '127', trains: [{ route: 'A' }, { route: '6X' }] };

test('only applies local route visibility to backend-selected alerts', () => {
    const data = payload([alert('a'), alert('6', ['6']), alert('b', ['B']), alert('station', [], { stationWide: true })]);
    assert.deepEqual(selectVisibleAlerts(data, context.trains, NOW).map(a => a.id), ['a', '6', 'station']);
    assert.deepEqual(selectVisibleAlerts(data, [{ route: '6X' }], NOW).map(a => a.id), ['6', 'station']);
    assert.deepEqual(selectVisibleAlerts(data, [], NOW), []);
    assert.equal(normalizeRoute('SIR'), 'SI');
    assert.notEqual(normalizeRoute('FS'), normalizeRoute('GS'));
});

test('uses backend expiry rather than rejecting an older MTA publication timestamp', () => {
    const data = payload([alert('a')]);
    assert.equal(selectVisibleAlerts(data, context.trains, NOW).length, 1);
    assert.equal(selectVisibleAlerts(data, context.trains, NOW + 300000).length, 0);
    assert.equal(selectVisibleAlerts(payload([alert('ended', ['A'], { activeUntil: NOW / 1000 })]), context.trains, NOW).length, 0);
    assert.deepEqual(selectVisibleAlerts(null, context.trains, NOW), []);
    assert.deepEqual(selectVisibleAlerts(payload([null, {}]), context.trains, NOW), []);
});

test('pairs do not duplicate the last odd item, and labels use alert update time', () => {
    assert.deepEqual(pageAlerts([1, 2, 3, 4, 5]), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(pageAlerts([]), []);
    assert.equal(updatedLabel(NOW / 1000 - 900, NOW), 'Updated 15 min ago');
});

function fixture({ alerts = [alert('a'), alert('b'), alert('c')], reducedMotion = false } = {}) {
    let clock = NOW, id = 0, model;
    const timers = new Map();
    const controller = createServiceAlerts({
        now: () => clock,
        setTimeout(callback, delay) { const timer = ++id; timers.set(timer, { at: clock + delay, callback }); return timer; },
        clearTimeout: timer => timers.delete(timer),
        render: value => { model = value; }, reducedMotion: () => reducedMotion, isHidden: () => false
    });
    const data = payload(alerts);
    return {
        controller, timers, data, get model() { return model; },
        start(extra = {}) { controller.setContext({ ...context, serviceAlerts: data, ...extra }); },
        tick(ms) {
            const end = clock + ms;
            let steps = 0;
            while (true) {
                const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                assert.ok(++steps < 1000);
                timers.delete(next[0]); clock = next[1].at; next[1].callback();
            }
            clock = end;
        }
    };
}

test('rotates pairs with a 300ms fade out and in without restarting on station refreshes', () => {
    const f = fixture(); f.start(); f.tick(9000); f.start(); f.tick(1000);
    assert.equal(f.model.fading, true); assert.equal(f.model.pageIndex, 0);
    f.tick(300);
    assert.equal(f.model.fading, false); assert.equal(f.model.pageIndex, 1);
    f.tick(10600); assert.equal(f.model.pageIndex, 0);
    assert.equal(f.timers.size, 2, 'Only rotation and expiry timers; no alert polling timer');
});

test('one or two alerts remain static and make no requests', () => {
    const f = fixture({ alerts: [alert('a'), alert('b')] }); f.start(); f.tick(45000);
    assert.equal(f.model.pageIndex, 0); assert.equal(f.model.fading, false);
    assert.equal(f.timers.size, 1, 'Only cache expiry is scheduled');
});

test('route filtering and station changes immediately replace the relevant alerts', () => {
    const f = fixture({ alerts: [alert('a'), alert('b', ['B'])] }); f.start();
    assert.deepEqual(f.model.alerts.map(a => a.id), ['a']);
    f.start({ trains: [{ route: 'B' }] });
    assert.deepEqual(f.model.alerts.map(a => a.id), ['b']);
    f.start({ stationId: 'other', trains: [], serviceAlerts: null });
    assert.deepEqual(f.model.alerts, []);
    assert.match(f.model.status, /No upcoming trains/);
});

test('hiding the panel cancels a pending fade and resumes with current station data', () => {
    const f = fixture(); f.start(); f.tick(10100); f.controller.setEnabled(false);
    assert.equal(f.model.enabled, false); assert.equal(f.timers.size, 0);
    f.start({ serviceAlerts: payload([alert('new')]) });
    assert.equal(f.timers.size, 0);
    f.controller.setEnabled(true);
    assert.equal(f.model.enabled, true); assert.equal(f.model.fading, false);
    assert.deepEqual(f.model.alerts.map(a => a.id), ['new']);
});

test('distinguishes backend loading, outage, old API, stale cache, and empty success', () => {
    const f = fixture();
    f.start({ serviceAlerts: { status: 'loading', alerts: [] } }); assert.match(f.model.status, /Checking/);
    f.start({ serviceAlerts: { status: 'unavailable', alerts: [] } }); assert.match(f.model.status, /temporarily unavailable/);
    f.start({ serviceAlerts: null }); assert.match(f.model.status, /temporarily unavailable/);
    f.start({ serviceAlerts: payload([alert('a')], { status: 'stale' }) });
    assert.match(f.model.status, /Updates delayed/); assert.equal(f.model.alerts.length, 1);
    f.start({ serviceAlerts: payload([]) }); assert.match(f.model.status, /No current alerts/);
});

test('cached data and ending work expire without another station response', () => {
    const f = fixture({ alerts: [alert('ending', ['A'], { activeUntil: NOW / 1000 + 10 })] }); f.start();
    f.tick(10000); assert.equal(f.model.alerts.length, 0);
    f.start({ serviceAlerts: payload([alert('other')]) });
    f.tick(290000); assert.equal(f.model.alerts.length, 0);
    assert.match(f.model.status, /temporarily unavailable/);
});

test('reduced motion retains pair rotation without fading', () => {
    const f = fixture({ reducedMotion: true }); f.start(); f.tick(10000);
    assert.equal(f.model.pageIndex, 1); assert.equal(f.model.fading, false);
});

test('the footer preference is saved, restored, and defaults on for older cookies', () => {
    const vm = require('node:vm');
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const source = readFileSync(join(__dirname, '../javascript.js'), 'utf8');
    const elements = new Map();
    const enabled = [];
    const element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, addEventListener() {}, appendChild() {} });
        return elements.get(id);
    };
    const document = {
        cookie: '', getElementById: element, querySelector: element, querySelectorAll: () => [],
        createElement: element, addEventListener() {}
    };
    const app = vm.createContext({
        console: { log() {} }, navigator: { userAgent: 'Test' }, document,
        window: { addEventListener() {}, ServiceAlerts: { setEnabled: value => enabled.push(value) } },
        fetch: () => new Promise(() => {}), setTimeout: () => 0, clearTimeout() {}
    });
    vm.runInContext(source, app);
    element('toggleServiceAlerts').checked = false;
    app.toggleServiceAlerts();
    const settings = JSON.parse(decodeURIComponent(document.cookie.split(';')[0].split('=')[1]));
    assert.equal(settings.cookieDisplayServiceAlerts, false);
    assert.equal(settings.cookieCurrentStation, '640');
    app.displayServiceAlerts = true;
    app.getUserSettings();
    assert.equal(app.displayServiceAlerts, false);
    assert.equal(element('toggleServiceAlerts').checked, false);
    assert.equal(enabled.at(-1), false);
    delete settings.cookieDisplayServiceAlerts;
    document.cookie = 'userSettings=' + encodeURIComponent(JSON.stringify(settings));
    app.getUserSettings();
    assert.equal(app.displayServiceAlerts, true);
    assert.equal(element('toggleServiceAlerts').checked, true);
    assert.equal(enabled.at(-1), true);
    // The background image preference follows the same pattern, including the default for older cookies.
    assert.equal(app.displayBackgroundImage, true);
    element('toggleBackgroundImage').checked = false;
    app.toggleBackgroundImage();
    const saved = JSON.parse(decodeURIComponent(document.cookie.split(';')[0].split('=')[1]));
    assert.equal(saved.cookieDisplayBackgroundImage, false);
    app.displayBackgroundImage = true;
    app.getUserSettings();
    assert.equal(app.displayBackgroundImage, false);
    assert.equal(element('toggleBackgroundImage').checked, false);
    delete saved.cookieDisplayBackgroundImage;
    document.cookie = 'userSettings=' + encodeURIComponent(JSON.stringify(saved));
    app.getUserSettings();
    assert.equal(app.displayBackgroundImage, true);
    assert.equal(element('toggleBackgroundImage').checked, true);
});

test('the board width preference is clamped, saved, restored, and defaults to full width for older cookies', () => {
    const vm = require('node:vm');
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const source = readFileSync(join(__dirname, '../javascript.js'), 'utf8');
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, addEventListener() {}, appendChild() {} });
        return elements.get(id);
    };
    const rootStyle = {};
    const document = {
        cookie: '', getElementById: element, querySelector: element, querySelectorAll: () => [],
        createElement: element, addEventListener() {},
        documentElement: { style: { setProperty(name, value) { rootStyle[name] = value; } } }
    };
    const app = vm.createContext({
        console: { log() {} }, navigator: { userAgent: 'Test' }, document,
        window: { addEventListener() {}, ServiceAlerts: { setEnabled() {} } },
        fetch: () => new Promise(() => {}), setTimeout: () => 0, clearTimeout() {}
    });
    vm.runInContext(source, app);
    const saved = () => JSON.parse(decodeURIComponent(document.cookie.split(';')[0].split('=')[1]));
    element('boardWidthEntry').value = '60';
    app.updateBoardWidth();
    assert.equal(app.boardWidth, 60);
    assert.equal(Number(rootStyle['--board-width']), 60);
    assert.equal(saved().cookieBoardWidth, 60);
    // Out-of-range, blank, and fractional entries are corrected in the field as well as in the setting.
    for (const [entered, applied] of [['5', 10], ['250', 100], ['', 100], ['42.6', 42]]) {
        element('boardWidthEntry').value = entered;
        app.updateBoardWidth();
        assert.equal(app.boardWidth, applied);
        assert.equal(Number(element('boardWidthEntry').value), applied);
        assert.equal(Number(rootStyle['--board-width']), applied);
    }
    const settings = saved();
    settings.cookieBoardWidth = 35;
    document.cookie = 'userSettings=' + encodeURIComponent(JSON.stringify(settings));
    app.getUserSettings();
    assert.equal(app.boardWidth, 35);
    assert.equal(Number(rootStyle['--board-width']), 35);
    assert.equal(Number(element('boardWidthEntry').value), 35);
    delete settings.cookieBoardWidth;
    document.cookie = 'userSettings=' + encodeURIComponent(JSON.stringify(settings));
    app.getUserSettings();
    assert.equal(app.boardWidth, 100);
    assert.equal(Number(rootStyle['--board-width']), 100);
});

test('one station response supplies labels and alerts, and late station responses are ignored', async () => {
    const vm = require('node:vm');
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const elements = new Map(), calls = [], contexts = [];
    const element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, addEventListener() {}, appendChild() {} });
        return elements.get(id);
    };
    const train = { route: 'F', direction: 'N', trip: 'test-F-trip', terminal: 'F01N',
        terminalName: 'Jamaica-179 St', time: '2026-09-20T12:00:00Z',
        terminalPrimary: 'Uptown & Queens', terminalSecondary: 'Jamaica-179 St via Roosevelt Island' };
    const current = { alltrains: [train], stops: { 'D20': {}, 'A32': {} },
        routes: [], stationName: 'Test station', serviceAlerts: payload([alert('a')]) };
    const data = { data: [current] };
    let finish;
    let apiFailure = null;
    let apiStatus = 200;
    let clearedTimeouts = 0;
    const app = vm.createContext({
        console: { log() {} }, navigator: { userAgent: 'Test' }, AbortController,
        setTimeout: () => 1, clearTimeout() { clearedTimeouts++; },
        document: { cookie: '', getElementById: element, querySelector: element, querySelectorAll: () => [], createElement: element, addEventListener() {} },
        window: { addEventListener() {}, ServiceAlerts: { setContext: value => contexts.push(value) } },
        fetch: url => {
            if (!url.includes('/by-id/')) return new Promise(() => {});
            calls.push(url);
            if (apiFailure) return Promise.reject(apiFailure);
            return new Promise(resolve => { finish = () => resolve({
                ok: apiStatus === 200, status: apiStatus, json: async () => data
            }); });
        }
    });
    vm.runInContext(readFileSync(join(__dirname, '../javascript.js'), 'utf8'), app);
    app.renderTrainRows = app.arrivalUpdate = app.routeUpdate = app.saveUserSettings = () => {};
    app.stationId = 'D20';
    let loading = app.loadSomeDisplay('D20'); finish(); await loading;
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith('/by-id/D20'));
    assert.equal(contexts.at(-1).serviceAlerts, data.data[0].serviceAlerts);
    assert.equal(contexts.at(-1).trains[0].route, 'F');
    assert.equal(app.lastTrainData[0].terminalPrimary, train.terminalPrimary);
    assert.equal(app.lastTrainData[0].terminalSecondary, train.terminalSecondary);

    loading = app.loadSomeDisplay('D20');
    app.lastTrainData = [];
    app.stationId = 'D16'; finish(); await loading;
    assert.equal(contexts.length, 1, 'Old station response must not overwrite the newly selected station');
    assert.equal(app.lastTrainData.length, 0, 'Old station labels must not replace the current arrivals');

    // Failed requests propagate to the existing retry/error display, with no second host.
    app.stationId = 'D20';
    apiFailure = new Error('Render unavailable');
    await assert.rejects(app.loadSomeDisplay('D20'), /Render unavailable/);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(url => url === 'https://mtapibaron.onrender.com/by-id/D20'));
    assert.equal(contexts.length, 1);

    apiFailure = null;
    apiStatus = 503;
    loading = app.loadSomeDisplay('D20'); finish();
    await assert.rejects(loading, /Station API returned 503/);
    assert.equal(calls.length, 4);
    assert.equal(contexts.length, 1);
    assert.equal(clearedTimeouts, 4, 'Every completed or failed request clears its timeout');
});

test('newlines in alert text become line breaks between the message runs', () => {
    // A minimal DOM: enough for the alerts view to build cards and for the test to read them back.
    const ids = new Map();
    const make = (tag, text = '') => {
        let content = text;
        const self = {
            tag, className: '', hidden: false, title: '', dataset: {}, style: {}, children: [],
            get textContent() { return self.children.length ? self.children.map(child => child.textContent).join('') : content; },
            set textContent(value) { content = value; self.children.length = 0; },
            appendChild(child) { self.children.push(child); return child; },
            setAttribute() {},
            classList: { add(name) { self.className += ' ' + name; }, toggle() {} },
            querySelectorAll(selector) {
                const found = [];
                (function walk(node) {
                    for (const child of node.children) {
                        if (child.className.split(' ').includes(selector.slice(1))) found.push(child);
                        walk(child);
                    }
                })(self);
                return found;
            }
        };
        return self;
    };
    const document = {
        getElementById: id => ids.get(id) || ids.set(id, make('div')).get(id),
        createElement: tag => make(tag), createTextNode: text => make('#text', text)
    };
    const controller = createServiceAlerts({
        document, now: () => NOW, setTimeout: () => 1, clearTimeout() {}, reducedMotion: () => false, isHidden: () => false
    });
    const runs = () => document.getElementById('serviceAlertPages').querySelectorAll('.alert-message')[0].children
        .map(child => child.tag === 'br' ? '<br>' : child.tag === 'span' ? '[' + child.textContent + ']' : child.textContent);
    const text = 'Uptown [A] trains are running on the local track from Euclid Av to Hoyt-Schermerhorn Sts. \n' +
        'At Nostrand Av, board uptown [A] trains on the [C] train platform.';
    controller.setContext({ ...context, serviceAlerts: payload([alert('a', ['A'], { text })]) });
    assert.deepEqual(runs(), ['Uptown ', '[A]', ' trains are running on the local track from Euclid Av to Hoyt-Schermerhorn Sts. ',
        '<br>', 'At Nostrand Av, board uptown ', '[A]', ' trains on the ', '[C]', ' train platform.']);
    // Windows line endings break the same way, and text without newlines gets no break.
    controller.setContext({ ...context, serviceAlerts: payload([alert('b', ['A'], { text: 'No [A] service.\r\nUse [C].' })]) });
    assert.deepEqual(runs(), ['No ', '[A]', ' service.', '<br>', 'Use ', '[C]', '.']);
    controller.setContext({ ...context, serviceAlerts: payload([alert('c', ['A'], { text: '[A] trains are delayed.' })]) });
    assert.deepEqual(runs(), ['', '[A]', ' trains are delayed.']);
});

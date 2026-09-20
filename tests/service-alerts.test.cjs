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
        fetch: () => new Promise(() => {})
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
});

test('the station response supplies alerts without an additional fetch, and late station responses are ignored', async () => {
    const vm = require('node:vm');
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const elements = new Map(), calls = [], contexts = [];
    const element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, addEventListener() {}, appendChild() {} });
        return elements.get(id);
    };
    const data = { data: [{ alltrains: [{ route: 'A', terminal: 'A02N' }], stops: { '640': {} },
        routes: [], stationName: 'Test station', serviceAlerts: payload([alert('a')]) }] };
    let finish;
    const app = vm.createContext({
        console: { log() {} }, navigator: { userAgent: 'Test' }, AbortController,
        setTimeout: () => 1, clearTimeout() {},
        document: { cookie: '', getElementById: element, querySelector: element, querySelectorAll: () => [], createElement: element, addEventListener() {} },
        window: { addEventListener() {}, ServiceAlerts: { setContext: value => contexts.push(value) } },
        fetch: url => {
            if (!url.includes('/by-id/')) return new Promise(() => {});
            calls.push(url);
            return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => data }); });
        }
    });
    vm.runInContext(readFileSync(join(__dirname, '../javascript.js'), 'utf8'), app);
    app.renderTrainRows = app.arrivalUpdate = app.routeUpdate = app.saveUserSettings = () => {};
    let loading = app.loadSomeDisplay('640'); finish(); await loading;
    assert.equal(calls.length, 1);
    assert.equal(contexts.at(-1).serviceAlerts, data.data[0].serviceAlerts);
    assert.equal(contexts.at(-1).trains[0].route, 'A');
    loading = app.loadSomeDisplay('640');
    app.stationId = 'D16'; finish(); await loading;
    assert.equal(contexts.length, 1, 'Old station response must not overwrite the newly selected station');
});

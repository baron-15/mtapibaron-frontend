const assert = require('node:assert/strict');
const { test } = require('node:test');
const { selectAlerts, isActive, normalizeRoute, englishText, pageAlerts, updatedLabel, createServiceAlerts, MTA_ALERTS_URL } = require('../service-alerts.js');

const NOW = Date.parse('2026-09-20T12:00:00Z');
const translated = text => ({ translation: [{ language: 'en', text }, { language: 'en-html', text: '<b>' + text + '</b>' }] });
function entity(id, routes, overrides = {}) {
    return { id, alert: {
        active_period: [{ start: NOW / 1000 - 60, end: NOW / 1000 + 3600 }],
        informed_entity: routes.map(route_id => ({ agency_id: 'MTASBWY', route_id })),
        header_text: translated('[' + routes[0] + '] trains are delayed.'),
        'transit_realtime.mercury_alert': { alert_type: 'Delays', updated_at: NOW / 1000 - 60 },
        ...overrides
    } };
}
const context = { stationId: '127', trains: [{ route: 'A' }, { route: '6X' }], stopIds: ['A27', '127'] };
const feed = entities => ({ header: { timestamp: NOW / 1000 }, entity: entities });

test('matches arriving routes, including express diamonds, without unrelated lines or agencies', () => {
    const data = feed([
        entity('A', ['A']), entity('6', ['6']), entity('6X', ['6X']), entity('B', ['B']),
        entity('bus', ['A'], { informed_entity: [{ agency_id: 'MTA NYCT', route_id: 'A' }] })
    ]);
    assert.deepEqual(selectAlerts(data, context, NOW).map(alert => alert.id), ['6', '6X', 'A']);
    assert.equal(normalizeRoute('SIR'), 'SI');
    assert.equal(normalizeRoute('FX'), 'F');
    assert.notEqual(normalizeRoute('FS'), normalizeRoute('GS'), 'Different shuttle lines must not be conflated');
});

test('active windows exclude future and expired work, including gaps between repeated work periods', () => {
    const seconds = NOW / 1000;
    assert.equal(isActive({}, seconds), true);
    assert.equal(isActive({ active_period: [{ start: seconds }] }, seconds), true);
    assert.equal(isActive({ active_period: [{ end: seconds }] }, seconds), false);
    assert.equal(isActive({ active_period: [{ start: seconds + 1 }] }, seconds), false);
    assert.equal(isActive({ active_period: [{ end: seconds - 1 }, { start: seconds + 1 }] }, seconds), false);
    assert.equal(isActive({ active_period: [{ start: seconds - 5, end: seconds + 5 }] }, seconds), true);
    const future = entity('future', ['A'], { active_period: [{ start: seconds + 1800 }] });
    future.alert['transit_realtime.mercury_alert'].display_before_active = 3600;
    assert.equal(selectAlerts(feed([future]), context, NOW).length, 0, 'Advance notices are not Happening now');
});

test('stop-only notices match the station complex; route notices apply along an arriving line', () => {
    const selectors = [
        { id: 'here', informed_entity: [{ agency_id: 'MTASBWY', stop_id: 'A27N' }] },
        { id: 'elsewhere', informed_entity: [{ agency_id: 'MTASBWY', stop_id: 'A02' }] },
        { id: 'along-line', informed_entity: [{ agency_id: 'MTASBWY', route_id: 'A', stop_id: 'A02' }] }
    ];
    const data = feed(selectors.map(({ id, ...overrides }) => entity(id, ['A'], overrides)));
    assert.deepEqual(selectAlerts(data, context, NOW).map(alert => alert.id), ['along-line', 'here']);
    assert.equal(selectAlerts(data, { ...context, trains: [] }, NOW).length, 0);
});

test('reads plain English and Mercury metadata, drops duplicates and deleted notices, prioritizes unplanned alerts', () => {
    const planned = entity('lmm:planned_work:1', ['A']);
    planned.alert['transit_realtime.mercury_alert'] = { alert_type: 'Planned - Stops Skipped', updated_at: NOW / 1000, human_readable_active_period: translated('This weekend') };
    const delay = entity('delay', ['A']);
    const deleted = { ...entity('deleted', ['A']), is_deleted: true };
    const selected = selectAlerts(feed([planned, delay, delay, deleted]), context, NOW);
    assert.deepEqual(selected.map(alert => alert.id), ['delay', 'lmm:planned_work:1']);
    assert.equal(selected[1].planned, true);
    assert.equal(selected[1].schedule, 'This weekend');
    assert.equal(selected[0].text, '[A] trains are delayed.');
    assert.equal(englishText({ translation: [{ language: 'en-html', text: '<script>alert(1)</script>' }] }), '');
    assert.equal(updatedLabel(NOW / 1000 - 900, NOW), 'Updated 15 min ago');
    assert.equal(updatedLabel(null, NOW), 'Happening now');
});

test('accepts documented camelCase fields and uses details only when the headline is missing', () => {
    const data = feed([{ id: 'camel', alert: {
        activePeriod: [{ start: NOW / 1000 - 1 }], informedEntity: [{ agencyId: 'MTASBWY', routeId: 'A' }],
        descriptionText: translated('Details'), '.mercuryAlert': { updatedAt: NOW / 1000, alertType: 'Boarding Change' }
    } }]);
    const result = selectAlerts(data, context, NOW)[0];
    assert.equal(result.text, 'Details');
    assert.equal(result.type, 'Boarding Change');
});

test('malformed entities do not break rendering or masquerade as active alerts', () => {
    const data = feed([null, {}, { alert: {} }, entity('bad-period', ['A'], { active_period: {} }), entity('bad-text', ['A'], { header_text: { translation: {} } }), entity('bad-selector', ['A'], { informed_entity: [null] })]);
    assert.deepEqual(selectAlerts(data, context, NOW), []);
});

test('pairs are complete, with a single alert on the final odd page and no duplicate padding', () => {
    assert.deepEqual(pageAlerts([1, 2, 3, 4, 5]), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(pageAlerts([]), []);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
function controllerFixture({ entities = [entity('a', ['A']), entity('b', ['A']), entity('c', ['A'])], fetch: fetchOverride, reducedMotion = false } = {}) {
    let clock = NOW, id = 0, model;
    const timers = new Map(), calls = [];
    let currentFeed = feed(entities);
    const controller = createServiceAlerts({
        now: () => clock,
        setTimeout(callback, delay) { const timer = ++id; timers.set(timer, { at: clock + delay, callback }); return timer; },
        clearTimeout: timer => timers.delete(timer),
        render: value => { model = value; },
        reducedMotion: () => reducedMotion,
        isHidden: () => false,
        fetch: async (url, options) => {
            calls.push(url);
            if (fetchOverride) return fetchOverride(url, options);
            return { ok: true, json: async () => currentFeed };
        }
    });
    return {
        controller, calls, timers,
        get model() { return model; },
        setFeed(value) { currentFeed = value; },
        async start(extra = {}) { controller.setContext({ ...context, ...extra }); await settle(); },
        async tick(ms) {
            const end = clock + ms;
            let steps = 0;
            while (true) {
                const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                assert.ok(++steps < 1000);
                timers.delete(next[0]); clock = next[1].at; next[1].callback(); await settle();
            }
            clock = end;
        }
    };
}

test('rotates pairs with a 300ms fade out and in, preserving position through unchanged arrival refreshes', async () => {
    const fixture = controllerFixture();
    await fixture.start();
    assert.equal(fixture.model.alerts.length, 3);
    await fixture.tick(9000);
    fixture.controller.setContext(context);
    await fixture.tick(1000);
    assert.equal(fixture.model.fading, true);
    assert.equal(fixture.model.pageIndex, 0);
    await fixture.tick(300);
    assert.equal(fixture.model.fading, false);
    assert.equal(fixture.model.pageIndex, 1);
    await fixture.tick(10600);
    assert.equal(fixture.model.pageIndex, 0);
    assert.equal(fixture.calls.length, 1, 'Arrival updates must not refetch alerts every 15 seconds');
});

test('one or two alerts remain static', async () => {
    const fixture = controllerFixture({ entities: [entity('a', ['A']), entity('b', ['A'])] });
    await fixture.start();
    await fixture.tick(45000);
    assert.equal(fixture.model.pageIndex, 0);
    assert.equal(fixture.model.fading, false);
    assert.equal(fixture.timers.size, 1, 'Only the feed refresh should be scheduled');
});

test('route filters, station changes, and empty arrivals immediately update alert relevance', async () => {
    const fixture = controllerFixture({ entities: [entity('a', ['A']), entity('b', ['B'])] });
    await fixture.start();
    assert.deepEqual(fixture.model.alerts.map(a => a.id), ['a']);
    fixture.controller.setContext({ stationId: 'other', trains: [{ route: 'B' }], stopIds: [] });
    assert.deepEqual(fixture.model.alerts.map(a => a.id), ['b']);
    fixture.controller.setContext({ stationId: 'other', trains: [], stopIds: [] });
    assert.deepEqual(fixture.model.alerts, []);
    assert.match(fixture.model.status, /No upcoming trains/);
    await fixture.tick(60000);
    await fixture.start();
    assert.deepEqual(fixture.model.alerts.map(a => a.id), ['a']);
    assert.equal(fixture.calls.length, 2, 'Polling restarts when arrivals return');
});

test('falls back to official MTA JSON when the backend endpoint is not deployed', async () => {
    const fixture = controllerFixture({ fetch: async url => url.includes('/service-alerts') ? { ok: false, status: 404 } : { ok: true, json: async () => feed([entity('a', ['A'])]) } });
    await fixture.start({ apiBase: 'https://example.test' });
    assert.deepEqual(fixture.calls, ['https://example.test/service-alerts', MTA_ALERTS_URL]);
    assert.equal(fixture.model.alerts.length, 1);
    await fixture.tick(60000);
    assert.equal(fixture.calls[2], MTA_ALERTS_URL, 'Do not retry a missing backend endpoint on every refresh');
});

test('disabled panel cancels refreshes and a pending fade, then resumes from cached data', async () => {
    const fixture = controllerFixture();
    await fixture.start();
    await fixture.tick(10100);
    fixture.controller.setEnabled(false);
    assert.equal(fixture.model.enabled, false);
    assert.equal(fixture.timers.size, 0);
    await fixture.tick(5000);
    fixture.controller.setEnabled(true);
    assert.equal(fixture.model.enabled, true);
    assert.equal(fixture.model.fading, false);
    assert.equal(fixture.model.pageIndex, 0);
    assert.equal(fixture.calls.length, 1);
});

test('a response arriving after disabling the panel cannot restart it', async () => {
    let resolve;
    const fixture = controllerFixture({ fetch: () => new Promise(done => { resolve = done; }) });
    fixture.controller.setContext(context);
    fixture.controller.setEnabled(false);
    resolve({ ok: true, json: async () => feed([entity('a', ['A'])]) });
    await settle();
    assert.equal(fixture.model.enabled, false);
    assert.equal(fixture.timers.size, 0);
});

test('failures are distinguished from an empty feed and cached alerts expire after five minutes', async () => {
    let offline = false;
    const fixture = controllerFixture({ fetch: async () => {
        if (offline) throw new Error('offline');
        return { ok: true, json: async () => feed([entity('a', ['A'])]) };
    } });
    await fixture.start();
    offline = true;
    await fixture.tick(60000);
    assert.match(fixture.model.status, /Updates delayed/);
    assert.equal(fixture.model.alerts.length, 1);
    await fixture.tick(300000);
    assert.equal(fixture.model.alerts.length, 0);
    assert.match(fixture.model.status, /temporarily unavailable/);
    const empty = controllerFixture({ entities: [] });
    await empty.start();
    assert.match(empty.model.status, /No current alerts/);
});

test('accepts MTA alert feeds up to ten minutes old, while rejecting older feed timestamps', async () => {
    const fixture = controllerFixture();
    fixture.setFeed({ ...feed([entity('a', ['A'])]), header: { timestamp: NOW / 1000 - 480 } });
    await fixture.start();
    assert.equal(fixture.model.alerts.length, 1, 'A successfully fetched eight-minute-old feed is valid');
    assert.equal(fixture.model.status, '');
    await fixture.tick(180000);
    assert.equal(fixture.model.alerts.length, 0, 'Repeated fetches must not extend an expired feed');
    assert.match(fixture.model.status, /temporarily unavailable/);
});

test('expired work disappears even between feed requests', async () => {
    const expiring = entity('expires', ['A'], { active_period: [{ start: NOW / 1000 - 1, end: NOW / 1000 + 10 }] });
    const fixture = controllerFixture({ entities: [expiring] });
    await fixture.start();
    await fixture.tick(11000);
    fixture.controller.setContext(context);
    assert.equal(fixture.model.alerts.length, 0);
});

test('reduced motion retains pagination without a fade phase', async () => {
    const fixture = controllerFixture({ reducedMotion: true });
    await fixture.start();
    await fixture.tick(10000);
    assert.equal(fixture.model.pageIndex, 1);
    assert.equal(fixture.model.fading, false);
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

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

async function loadPicker() {
    const element = tagName => ({
        tagName, children: [], value: '', disabled: false,
        addEventListener() {},
        appendChild(child) { this.children.push(child); },
        set innerHTML(value) { this.children = []; this.value = ''; }
    });
    const elements = new Map();
    const app = vm.createContext({
        console: { log() {} },
        navigator: { userAgent: 'Test' },
        window: { addEventListener() {} },
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, element('select'));
                return elements.get(id);
            },
            querySelector: () => element('div'),
            querySelectorAll: () => [],
            createElement: element,
            addEventListener() {}
        },
        // Prevent automatic startup, live requests, and announcements.
        fetch: () => new Promise(() => {})
    });
    for (const file of ['route-stop-order.js', 'javascript.js']) {
        vm.runInContext(readFileSync(join(__dirname, '..', file), 'utf8'), app);
    }
    app.fetch = async () => ({ text: async () => readFileSync(join(__dirname, '../MTA_Subway_Stations.csv'), 'utf8') });
    await app.loadStationData();
    return app;
}

function options(element) {
    return element.children.flatMap(child => child.tagName === 'optgroup' ? options(child) : [child]);
}

function selectRoute(app, route) {
    app.routeSelect.value = route;
    app.onRouteChange();
    return options(app.stopSelect).map(option => option.value);
}

test('every route orders all of its current stations exactly once with the original names and IDs', async () => {
    const app = await loadPicker();
    const routes = [...new Set(app.stationData.flatMap(station => Array.from(station.routes)))];
    assert.deepEqual(Object.keys(app.routeStopOrder).sort(), routes.sort());
    for (const route of routes) {
        const expected = new Map(Array.from(app.stationData)
            .filter(station => station.routes.includes(route))
            .map(station => [station.gtfsStopId, station.stopName]));
        const ordered = Array.from(app.routeStopOrder[route]).flatMap(group => Array.from(group.stops));
        assert.deepEqual([...ordered].sort(), [...expected.keys()].sort(), route + ' order coverage');
        const actual = selectRoute(app, route);
        assert.deepEqual(actual, ordered, route + ' dropdown order');
        for (const option of options(app.stopSelect)) {
            assert.equal(option.textContent, expected.get(option.value));
        }
        assert.equal(app.stopSelect.disabled, false);
    }
});

test('routes follow their terminals and physical interchange order across stop ID prefixes', async () => {
    const app = await loadPicker();
    const checkpoints = {
        '1': ['101', '112', '127', '137', '142'],
        '2': ['201', '222', '227', '120', '137', '228', '239', '247'],
        '7': ['701', '719', '723', '725', '726'],
        E: ['G05', 'G07', 'F05', 'G08', 'G21', 'F09', 'F12', 'D14', 'A25', 'A34', 'E01'],
        F: ['F01', 'G08', 'G21', 'F12', 'D15', 'D21', 'F18', 'A41', 'F20', 'F39', 'D42', 'D43'],
        G: ['G22', 'G36', 'A42', 'F20', 'F27'],
        L: ['L01', 'L03', 'L06', 'L10', 'L29'],
        M: ['G08', 'G20', 'B04', 'B10', 'D15', 'D21', 'M18', 'M11', 'M01'],
        N: ['R01', 'R09', 'R11', 'R20', 'Q01', 'R31', 'R41', 'N02', 'N10', 'D43'],
        Q: ['Q05', 'Q03', 'B08', 'R14', 'R20', 'Q01', 'R30', 'D24', 'D43'],
        R: ['G08', 'G21', 'R11', 'R27', 'R31', 'R45'],
        SIR: ['S31', 'S30', 'S19', 'S11', 'S09']
    };
    for (const [route, anchors] of Object.entries(checkpoints)) {
        const actual = selectRoute(app, route);
        assert.equal(actual[0], anchors[0], route + ' first terminal');
        assert.equal(actual.at(-1), anchors.at(-1), route + ' last terminal');
        assert.deepEqual(actual.filter(id => anchors.includes(id)), anchors, route + ' station sequence');
    }
});

test('branches and disconnected shuttles stay in labeled contiguous groups', async () => {
    const app = await loadPicker();
    for (const [route, expected] of Object.entries({
        A: [['A02', 'A61'], ['A63', 'A65'], ['H01', 'H04'], ['H06', 'H11'], ['H12', 'H15']],
        '5': [['501', '505'], ['204', '212'], ['213', '247']],
        S: [['902', '901'], ['S01', 'D26'], ['H04', 'H15']]
    })) {
        selectRoute(app, route);
        const groups = app.stopSelect.children;
        assert.equal(groups.length, expected.length);
        groups.forEach((group, index) => {
            assert.equal(group.tagName, 'optgroup');
            assert.ok(group.label);
            assert.deepEqual([group.children[0].value, group.children.at(-1).value], expected[index]);
        });
    }
});

test('route changes reset the list, saved stops remain selectable, and unknown stops are retained', async () => {
    const app = await loadPicker();
    app.preselectStation('M01');
    assert.equal(app.routeSelect.value, 'M');
    assert.equal(app.stopSelect.value, 'M01');
    assert.ok(options(app.stopSelect).some(option => option.value === 'M01'));
    app.preselectStation('H15');
    assert.ok(options(app.stopSelect).some(option => option.value === 'H15'));
    assert.equal(app.stopSelect.value, 'H15');

    app.stationData.push({ gtfsStopId: 'NEW', stopName: 'New stop', routes: ['1'] });
    assert.equal(selectRoute(app, '1').at(-1), 'NEW');
    assert.equal(app.stopSelect.value, '');
    assert.deepEqual(selectRoute(app, ''), []);
    assert.equal(app.stopSelect.disabled, true);
    selectRoute(app, 'S');
    const regular = selectRoute(app, '1');
    assert.equal(regular[0], '101');
    assert.equal(app.stopSelect.children.some(child => child.tagName === 'optgroup'), false);
});

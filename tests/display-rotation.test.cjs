const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../javascript.js'), 'utf8');

// A small DOM/timer fixture keeps these behavioral tests dependency-free. CSS
// motion and layout are exercised separately in display-rotation.html.
class Element {
    constructor() {
        this.children = [];
        this.className = '';
        this.attributes = {};
        this.style = { setProperty(name, value) { this[name] = value; } };
        this.dataset = new Proxy({}, { set(target, key, value) { target[key] = String(value); return true; } });
        this.classList = {
            contains: name => this.className.split(/\s+/).includes(name),
            add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
            remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); }
        };
        this.textContent = '';
    }
    set textContent(value) { this.children = []; this.text = String(value); }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    get innerText() { return this.textContent; }
    set innerHTML(value) {
        this.textContent = '';
        // The production renderer only inserts plain spans into countdowns.
        for (const match of value.matchAll(/<span class="([^"]+)">([^<]*)<\/span>/g)) {
            const child = new Element();
            child.className = match[1];
            child.textContent = match[2];
            this.appendChild(child);
        }
    }
    appendChild(child) { this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener() {}
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        const matches = [];
        for (const child of this.children) {
            if (selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.id === selector.slice(1)) matches.push(child);
            matches.push(...child.querySelectorAll(selector));
        }
        return matches;
    }
}

function loadBoard({ rows = 2, count = 6, version = 'v2', reducedMotion = false } = {}) {
    let now = Date.parse('2026-09-20T12:00:00Z');
    let timerId = 0;
    const timers = new Map();
    const root = new Element();
    for (const id of ['trainBlock', 'noOfTrainsEntry', 'displayVersion', 'routeSelect', 'stopSelect', 'allRoutes', 'stationName', 'datetime']) {
        const element = new Element();
        element.id = id;
        root.appendChild(element);
    }
    const footer = new Element();
    footer.className = 'footer';
    root.appendChild(footer);
    const document = {
        hidden: false,
        getElementById: id => root.querySelector('#' + id),
        querySelector: selector => root.querySelector(selector),
        querySelectorAll: selector => root.querySelectorAll(selector),
        createElement: () => new Element(),
        addEventListener() {}
    };
    document.getElementById('noOfTrainsEntry').value = String(rows);
    document.getElementById('displayVersion').value = version;
    const app = vm.createContext({
        document,
        console: { log() {} },
        navigator: { userAgent: 'Test' },
        window: { addEventListener() {}, matchMedia: () => ({ matches: reducedMotion }) },
        Date: class extends Date {
            constructor(...args) { super(...(args.length ? args : [now])); }
            static now() { return now; }
        },
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id),
        // Hold startup so tests never fetch live train data or audio.
        fetch: () => new Promise(() => {})
    });
    vm.runInContext(source, app);
    const trains = ['1', 'R', '7X', 'N', 'F', 'W', 'A', 'C', 'E'].map((route, index) => ({
        route, terminal: '10' + index + 'N', terminalName: 'Destination ' + (index + 1),
        directionLabel: 'Downtown', time: new Date(now + (index + 1) * 60000).toISOString()
    }));
    app.lastTrainData = trains.slice(0, count);
    app.lastFetchTime = new Date(now);
    app.displayVersion = version;
    const render = () => { app.renderTrainRows(); app.arrivalUpdate(); app.routeUpdate(); };
    render();
    const board = document.getElementById('trainBlock');
    return {
        app, document, board, trains, timers, render,
        tick(ms) {
            const end = now + ms;
            let steps = 0;
            while (true) {
                const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                assert.ok(++steps < 1000, 'Timer loop must make progress');
                const [id, timer] = next;
                timers.delete(id);
                now = timer.at;
                timer.callback();
            }
            now = end;
        }
    };
}

const routeOf = row => row.children[1].textContent;
const positionOf = row => Number(row.children[0].attributes['aria-label']?.replace('Train ', '') || row.children[0].textContent.replace('.', ''));

for (const version of ['v1', 'v2']) {
    test(`${version}: 1–4 rows rotate only the bottom row through the next five trains`, () => {
        for (let rows = 1; rows <= 4; rows++) {
            const { board, trains, tick } = loadBoard({ rows, version });
            const fixedRows = board.children.slice(0, rows - 1);
            const bottom = board.children[rows - 1];
            assert.equal(board.children.length, rows);
            assert.equal(positionOf(bottom), rows);
            const positions = Array.from({ length: 5 - rows }, (_, index) => rows + index + 1).concat(rows);
            for (const position of positions) {
                tick(5600);
                assert.equal(positionOf(bottom), position);
                assert.equal(routeOf(bottom), trains[position - 1].route.charAt(0));
                assert.match(bottom.children[2].textContent, new RegExp('Destination ' + position));
                assert.equal(bottom.querySelector('.eta').dataset.minutes, String(position));
                for (let index = 0; index < fixedRows.length; index++) {
                    assert.equal(board.children[index], fixedRows[index], 'Fixed rows must not be rebuilt during rotation');
                    assert.equal(positionOf(fixedRows[index]), index + 1);
                    assert.equal(routeOf(fixedRows[index]), trains[index].route.charAt(0));
                }
            }
        }
    });

    test(`${version}: colors, express diamonds, and arriving highlights follow the rotated train`, () => {
        const { app, board, tick } = loadBoard({ version });
        app.lastTrainData[2].time = app.lastFetchTime.toISOString();
        const bottom = board.children[1];
        tick(5600);
        assert.ok(bottom.children[1].classList.contains('diamond'));
        assert.equal(bottom.children[1].style.backgroundColor, '#B933AD');
        assert.equal(bottom.children[1].style.color, '#ffffff');
        assert.ok(bottom.classList.contains(version === 'v2' ? 'arrival-invert' : 'arrivalyellow'));
        assert.equal(bottom.children[3].classList.contains('blink'), version === 'v1');
        tick(5600);
        assert.ok(bottom.children[1].classList.contains('circle'));
        assert.equal(bottom.children[1].style.backgroundColor, '#FCCC0A');
        assert.equal(bottom.children[1].style.color, '#000000');
        assert.ok(!bottom.classList.contains('arrival-invert'));
        assert.ok(!bottom.classList.contains('arrivalyellow'));
        assert.ok(!bottom.children[3].classList.contains('blink'));
    });
}

test('the number moves up for increasing positions and down on wrap; content swaps halfway through the fade', () => {
    const { board, tick } = loadBoard();
    const bottom = board.children[1];
    const track = bottom.querySelector('.rotation-number-track');
    tick(4999);
    assert.equal(routeOf(bottom), 'R');
    assert.equal(track.style.transform, 'translateY(-100%)');
    tick(1);
    assert.equal(track.style.transform, 'translateY(-200%)');
    assert.ok(bottom.classList.contains('rotation-out'));
    tick(299);
    assert.equal(routeOf(bottom), 'R');
    tick(1);
    assert.equal(routeOf(bottom), '7');
    assert.ok(!bottom.classList.contains('rotation-out'));
    tick(5600 * 2);
    assert.equal(positionOf(bottom), 5);
    assert.equal(track.style.transform, 'translateY(-400%)');
    tick(5600);
    assert.equal(positionOf(bottom), 2);
    assert.equal(track.style.transform, 'translateY(-100%)');
});

test('5–9 rows remain static, including trains beyond the rotating horizon', () => {
    for (const version of ['v1', 'v2']) {
        for (let rows = 5; rows <= 9; rows++) {
            const { board, timers, tick } = loadBoard({ rows, count: 9, version });
            assert.equal(board.children.length, rows);
            assert.deepEqual(board.children.map(positionOf), Array.from({ length: rows }, (_, index) => index + 1));
            assert.equal(timers.size, 0);
            tick(60000);
            assert.equal(board.querySelectorAll('.rotating-row').length, 0);
        }
    }
});

test('short and empty lists rotate only available trains and retain empty-state rows', () => {
    for (let count = 0; count <= 5; count++) {
        for (let rows = 1; rows <= 4; rows++) {
            const { board, timers, tick } = loadBoard({ count, rows });
            const bottom = board.children[rows - 1];
            assert.equal(timers.size, count > rows ? 1 : 0);
            for (let cycle = 0; cycle < 6; cycle++) {
                tick(5600);
                if (count >= rows) {
                    assert.ok(positionOf(bottom) >= rows && positionOf(bottom) <= count);
                    assert.notEqual(routeOf(bottom), '');
                } else {
                    assert.equal(bottom.children[2].textContent, 'No scheduled');
                    assert.equal(bottom.children[3].textContent, '');
                }
            }
        }
    }
});

test('regular data refreshes retain the rotation position and original deadline', () => {
    const { app, board, tick, render, timers } = loadBoard();
    for (let second = 0; second < 4; second++) { tick(1000); render(); }
    tick(1300);
    assert.equal(positionOf(board.children[1]), 3);
    render();
    assert.equal(positionOf(board.children[1]), 3);
    assert.equal(timers.size, 1);
    assert.equal(app.trainRotationNextAt, app.Date.now() + 5300);
    tick(5600);
    assert.equal(positionOf(board.children[1]), 4);
});

test('a refresh during a fade cancels stale callbacks and uses fresh train details', () => {
    const { app, board, tick, render, timers } = loadBoard();
    const oldRow = board.children[1];
    tick(5100);
    app.lastTrainData = app.lastTrainData.map(train => ({ ...train, terminalName: 'Updated ' + train.terminalName }));
    render();
    const newRow = board.children[1];
    assert.notEqual(newRow, oldRow);
    assert.equal(positionOf(newRow), 3);
    assert.match(newRow.children[2].textContent, /Updated Destination 3/);
    tick(500);
    assert.equal(routeOf(oldRow), 'R', 'Canceled callback must not mutate the discarded row');
    assert.equal(routeOf(newRow), '7');
    assert.ok(!newRow.classList.contains('rotation-out'));
    assert.equal(timers.size, 1);
});

test('row count and display version changes cancel a pending fade immediately', () => {
    const { app, document, board, tick, timers } = loadBoard();
    tick(5100);
    document.getElementById('noOfTrainsEntry').value = '3';
    app.updateTrainCount();
    assert.equal(board.children.length, 3);
    assert.equal(positionOf(board.children[2]), 3);
    assert.equal(timers.size, 1);
    tick(5000);
    document.getElementById('displayVersion').value = 'v1';
    app.updateDisplayVersion();
    assert.equal(positionOf(board.children[2]), 3);
    assert.equal(board.children[0].children[0].textContent, '1.');
    tick(600);
    assert.equal(positionOf(board.children[2]), 3);
    document.getElementById('noOfTrainsEntry').value = '5';
    app.updateTrainCount();
    assert.equal(timers.size, 0);
    tick(60000);
    assert.deepEqual(board.children.map(positionOf), [1, 2, 3, 4, 5]);
});

test('filters and station changes restart with the next eligible arrival', () => {
    const { app, board, tick, render } = loadBoard();
    tick(5600);
    app.toggleRouteFilter('R');
    assert.equal(positionOf(board.children[1]), 2);
    assert.equal(routeOf(board.children[1]), '7');
    tick(5600);
    assert.equal(routeOf(board.children[1]), 'N');
    app.stationId = 'new-station';
    app.currentStationStops = ['102']; // The 7 terminates at this station.
    render();
    assert.equal(positionOf(board.children[1]), 2);
    assert.equal(routeOf(board.children[1]), 'N');
    tick(5600);
    assert.equal(routeOf(board.children[1]), 'F');
});

test('shrinking arrivals cancel rotation, and newly available arrivals start a fresh cycle', () => {
    const { app, board, trains, tick, render, timers } = loadBoard();
    tick(5600 * 3);
    assert.equal(positionOf(board.children[1]), 5);
    app.lastTrainData = trains.slice(0, 3);
    render();
    assert.equal(positionOf(board.children[1]), 2);
    app.lastTrainData = trains.slice(0, 2);
    render();
    assert.equal(timers.size, 0);
    app.lastTrainData = trains;
    render();
    tick(4999);
    assert.equal(positionOf(board.children[1]), 2);
    tick(601);
    assert.equal(positionOf(board.children[1]), 3);
});

test('reduced motion keeps cycling with an immediate coherent content change', () => {
    const { board, tick, timers } = loadBoard({ reducedMotion: true });
    tick(5000);
    const bottom = board.children[1];
    assert.equal(positionOf(bottom), 3);
    assert.equal(routeOf(bottom), '7');
    assert.ok(!bottom.classList.contains('rotation-out'));
    assert.equal(timers.size, 1);
});

test('a hidden page postpones rotation instead of running unseen transitions', () => {
    const { document, board, tick } = loadBoard();
    document.hidden = true;
    tick(15000);
    assert.equal(positionOf(board.children[1]), 2);
    document.hidden = false;
    tick(5600);
    assert.equal(positionOf(board.children[1]), 3);
});

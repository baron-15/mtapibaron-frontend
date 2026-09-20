(function (root) {
    'use strict';

    const MTA_ALERTS_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json';
    const REFRESH_MS = 60000;
    // Service-alert feeds can be older than train predictions. GTFS recommends
    // a ten-minute feed limit; connection failures only reuse our cache for five.
    const MAX_FEED_AGE_MS = 600000;
    const MAX_CACHE_AGE_MS = 300000;
    const HOLD_MS = 10000;
    const FADE_MS = 300;
    const ROUTES = new Set(['1', '2', '3', '4', '5', '6', '7', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'L', 'M', 'N', 'Q', 'R', 'W', 'Z', 'S', 'SI', 'FS', 'GS', 'H']);

    function normalizeRoute(value) {
        const route = String(value || '').toUpperCase().replace(/X$/, '');
        return route === 'SIR' ? 'SI' : route;
    }

    function englishText(value) {
        const translations = value && Array.isArray(value.translation) ? value.translation : [];
        const translation = translations.find(item => String(item.language).toLowerCase() === 'en') ||
            translations.find(item => !item.language);
        return translation && typeof translation.text === 'string' ? translation.text.trim() : '';
    }

    function field(object, snake, camel) {
        return object[snake] === undefined ? object[camel] : object[snake];
    }

    function isActive(alert, nowSeconds) {
        const periods = field(alert, 'active_period', 'activePeriod');
        if (!periods || Array.isArray(periods) && periods.length === 0) return true;
        if (!Array.isArray(periods)) return false;
        return periods.some(period =>
            period &&
            (period.start == null || Number(period.start) <= nowSeconds) &&
            (period.end == null || nowSeconds < Number(period.end)));
    }

    function selectAlerts(feed, context, nowMs) {
        if (!feed || !Array.isArray(feed.entity)) return [];
        const routes = new Set((context.trains || []).map(train => normalizeRoute(train.route)));
        if (!routes.size) return [];
        const stops = new Set((context.stopIds || []).map(stop => String(stop).replace(/[NS]$/, '')));
        const seen = new Set();
        const alerts = [];
        for (const entity of feed.entity) {
            if (!entity || typeof entity !== 'object') continue;
            const alert = entity.alert;
            if (!alert || entity.is_deleted || entity.isDeleted || !isActive(alert, nowMs / 1000)) continue;
            const selectors = field(alert, 'informed_entity', 'informedEntity');
            const matchedRoutes = new Set();
            let stationMatch = false;
            for (const selector of Array.isArray(selectors) ? selectors : []) {
                if (!selector) continue;
                const agency = field(selector, 'agency_id', 'agencyId');
                if (agency && agency !== 'MTASBWY') continue;
                const route = normalizeRoute(field(selector, 'route_id', 'routeId') || selector.trip && field(selector.trip, 'route_id', 'routeId'));
                const stop = field(selector, 'stop_id', 'stopId');
                // Route alerts can affect a rider elsewhere along the line. Only
                // stop-only notices are restricted to the selected station complex.
                if (route && routes.has(route)) matchedRoutes.add(route);
                else if (!route && stop && stops.has(String(stop).replace(/[NS]$/, ''))) stationMatch = true;
            }
            if (!matchedRoutes.size && !stationMatch) continue;
            const mercury = alert['transit_realtime.mercury_alert'] || alert['.mercuryAlert'] || {};
            const text = englishText(field(alert, 'header_text', 'headerText')) || englishText(field(alert, 'description_text', 'descriptionText'));
            if (!text) continue;
            const type = String(field(mercury, 'alert_type', 'alertType') || 'Service change');
            const planned = String(entity.id).includes('planned_work') || /^Planned\s*-/.test(type);
            const matched = [...matchedRoutes].sort();
            const identity = entity.id ? String(entity.id) : JSON.stringify([type, text, matched]);
            if (seen.has(identity)) continue;
            seen.add(identity);
            alerts.push({
                id: identity, routes: matched, text, type, planned,
                updatedAt: Number(field(mercury, 'updated_at', 'updatedAt')) || null,
                schedule: englishText(field(mercury, 'human_readable_active_period', 'humanReadableActivePeriod')),
                priority: planned ? 1 : 0
            });
        }
        return alerts.sort((a, b) => a.priority - b.priority || (b.updatedAt || 0) - (a.updatedAt || 0) || a.id.localeCompare(b.id));
    }

    function pageAlerts(alerts) {
        const pages = [];
        for (let index = 0; index < alerts.length; index += 2) pages.push(alerts.slice(index, index + 2));
        return pages;
    }

    function updatedLabel(timestamp, nowMs) {
        if (!timestamp) return 'Happening now';
        const minutes = Math.max(0, Math.floor((nowMs / 1000 - timestamp) / 60));
        if (minutes === 0) return 'Updated just now';
        if (minutes < 60) return 'Updated ' + minutes + ' min ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return 'Updated ' + hours + ' hr ago';
        return 'Updated ' + Math.floor(hours / 24) + ' days ago';
    }

    function createAlertsView(document) {
        const block = document.getElementById('serviceAlertsBlock');
        const pagesElement = document.getElementById('serviceAlertPages');
        const status = document.getElementById('serviceAlertsStatus');
        const counter = document.getElementById('serviceAlertsCounter');
        let signature = '';
        function element(tag, className, text) {
            const node = document.createElement(tag);
            node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        }
        function routeBadge(route) {
            const normalized = normalizeRoute(route);
            const badge = element('span', 'alert-route-badge', normalized === 'SI' ? 'SIR' : ['FS', 'GS', 'H'].includes(normalized) ? 'S' : normalized);
            const colorRoute = ['FS', 'GS', 'H', 'SI'].includes(normalized) ? 'S' : normalized;
            badge.style.backgroundColor = root.routeBackgroundColors && root.routeBackgroundColors[colorRoute] || '#808183';
            badge.style.color = ['N', 'Q', 'R', 'W'].includes(normalized) ? '#000000' : '#ffffff';
            badge.setAttribute('aria-label', normalized + ' train');
            if (normalized === 'SI') badge.classList.add('alert-route-wide');
            return badge;
        }
        function appendMessage(node, text) {
            // Only known bracketed route tokens become badges. Feed HTML is never inserted.
            for (const part of text.split(/(\[[A-Za-z0-9]+\])/g)) {
                const route = part.startsWith('[') && part.endsWith(']') ? normalizeRoute(part.slice(1, -1)) : '';
                node.appendChild(route && ROUTES.has(route) ? routeBadge(route) : document.createTextNode(part));
            }
        }
        return model => {
            if (!block) return;
            block.hidden = !model.enabled;
            if (!model.enabled) return;
            status.textContent = model.status;
            status.hidden = !model.status;
            const pages = pageAlerts(model.alerts);
            counter.textContent = pages.length > 1 ? `${model.pageIndex + 1} / ${pages.length}` : '';
            const nextSignature = JSON.stringify(model.alerts);
            if (signature !== nextSignature) {
                signature = nextSignature;
                pagesElement.textContent = '';
                pages.forEach(page => {
                    const pageElement = element('div', 'alert-page');
                    page.forEach(alert => {
                        const card = element('article', 'service-alert');
                        const meta = element('div', 'alert-meta');
                        const badges = element('div', 'alert-badges');
                        alert.routes.forEach(route => badges.appendChild(routeBadge(route)));
                        if (!alert.routes.length) badges.appendChild(element('span', 'alert-station-symbol', '!'));
                        const warning = element('span', 'alert-warning-symbol', alert.planned ? '⚒' : '!');
                        warning.setAttribute('aria-hidden', 'true');
                        badges.appendChild(warning);
                        const summary = element('div', 'alert-summary');
                        summary.appendChild(element('h3', 'alert-type', alert.planned ? 'Planned work' : alert.type));
                        const timing = element('p', 'alert-timing');
                        timing.dataset.updatedAt = alert.updatedAt || '';
                        timing.dataset.planned = String(alert.planned);
                        timing.title = alert.schedule;
                        summary.appendChild(timing);
                        meta.appendChild(badges);
                        meta.appendChild(summary);
                        const message = element('p', 'alert-message');
                        appendMessage(message, alert.text);
                        card.appendChild(meta);
                        card.appendChild(message);
                        pageElement.appendChild(card);
                    });
                    pagesElement.appendChild(pageElement);
                });
            }
            [...pagesElement.children].forEach((page, index) => {
                page.classList.toggle('is-active', index === model.pageIndex);
                page.setAttribute('aria-hidden', String(index !== model.pageIndex));
            });
            pagesElement.querySelectorAll('.alert-timing').forEach(timing => {
                timing.textContent = timing.dataset.planned === 'true' ? 'Happening now' : updatedLabel(Number(timing.dataset.updatedAt), model.now);
            });
            pagesElement.classList.toggle('alerts-fading', model.fading);
        };
    }

    function createServiceAlerts(options = {}) {
        const now = options.now || Date.now;
        const later = options.setTimeout || root.setTimeout.bind(root);
        const cancel = options.clearTimeout || root.clearTimeout.bind(root);
        const fetchFeed = options.fetch || root.fetch.bind(root);
        const view = options.render || createAlertsView(options.document || root.document);
        const reducedMotion = options.reducedMotion || (() => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const isHidden = options.isHidden || (() => root.document && root.document.hidden);
        let enabled = true, context = { trains: [], stopIds: [] }, contextReady = false;
        let feed = null, failed = false, sourceStale = false, lastFetch = 0, pending = false;
        let alerts = [], signature = '', pageIndex = 0, fading = false;
        let pollTimer = null, rotationTimer = null, swapTimer = null, controller = null, requestId = 0;
        const backendRetryAt = new Map();
        function fresh() {
            const timestamp = Number(feed && feed.header && feed.header.timestamp) * 1000;
            return timestamp > 0 && now() - timestamp <= MAX_FEED_AGE_MS &&
                now() - lastFetch <= MAX_CACHE_AGE_MS && timestamp <= now() + REFRESH_MS;
        }
        function render() {
            let status = '';
            if (!contextReady) status = 'Waiting for station arrivals…';
            else if (!context.trains.length) status = 'No upcoming trains to match service alerts.';
            else if (!fresh()) status = failed || feed ? 'Service alerts temporarily unavailable. Check mta.info for updates.' : 'Checking service alerts…';
            else if (failed || sourceStale) status = 'Updates delayed. Showing the latest available MTA alerts.';
            else if (!alerts.length) status = 'No current alerts for the arriving lines.';
            view({ enabled, alerts, pageIndex, fading, status, now: now() });
        }
        function stopRotation() {
            cancel(rotationTimer); cancel(swapTimer);
            rotationTimer = swapTimer = null;
            fading = false;
        }
        function scheduleRotation(delay = HOLD_MS) {
            if (enabled && alerts.length > 2) rotationTimer = later(rotate, delay);
        }
        function updateAlerts() {
            const next = fresh() ? selectAlerts(feed, context, now()) : [];
            const nextSignature = JSON.stringify(next);
            if (signature !== nextSignature) {
                stopRotation();
                alerts = next;
                signature = nextSignature;
                pageIndex = 0;
                scheduleRotation();
            }
            render();
        }
        function rotate() {
            rotationTimer = null;
            const previous = signature;
            updateAlerts();
            if (signature !== previous || alerts.length <= 2 || !enabled) return;
            if (isHidden()) { scheduleRotation(); return; }
            const duration = reducedMotion() ? 0 : FADE_MS;
            const swap = () => {
                swapTimer = null;
                pageIndex = (pageIndex + 1) % Math.ceil(alerts.length / 2);
                fading = false;
                render();
                scheduleRotation(HOLD_MS + duration);
            };
            if (duration) {
                fading = true;
                render();
                swapTimer = later(swap, duration);
            } else swap();
        }
        function schedulePoll() {
            cancel(pollTimer);
            pollTimer = null;
            if (enabled && context.trains.length) pollTimer = later(() => { pollTimer = null; refresh(); }, REFRESH_MS);
        }
        async function refresh() {
            if (!enabled || !context.trains.length || pending) return;
            cancel(pollTimer);
            pollTimer = null;
            pending = true;
            const id = ++requestId;
            const backend = context.apiBase && context.apiBase + '/service-alerts';
            const urls = backend && !(backendRetryAt.get(backend) > now()) ? [backend, MTA_ALERTS_URL] : [MTA_ALERTS_URL];
            let success = false;
            for (const url of urls) {
                const requestController = new AbortController();
                controller = requestController;
                const timeout = later(() => requestController.abort(), 6000);
                try {
                    const response = await fetchFeed(url, { signal: controller.signal });
                    if (!response.ok) throw new Error('Alerts HTTP ' + response.status);
                    const body = await response.json();
                    const incoming = body.feed || body;
                    const timestamp = Number(incoming.header && incoming.header.timestamp) * 1000;
                    if (!Array.isArray(incoming.entity) || !timestamp || now() - timestamp > MAX_FEED_AGE_MS || timestamp > now() + REFRESH_MS) throw new Error('Invalid or expired alert feed');
                    if (id !== requestId || !enabled) return;
                    feed = incoming;
                    sourceStale = Boolean(body.stale);
                    lastFetch = now();
                    failed = false;
                    success = true;
                    break;
                } catch (error) {
                    if (id !== requestId || !enabled) return;
                    if (url === backend) backendRetryAt.set(backend, now() + MAX_CACHE_AGE_MS);
                } finally { cancel(timeout); }
            }
            if (id !== requestId) return;
            controller = null;
            pending = false;
            failed = !success;
            updateAlerts();
            schedulePoll();
        }
        return {
            refresh,
            setContext(value) {
                const changedStation = context.stationId !== value.stationId;
                context = { trains: [], stopIds: [], ...value };
                if (!context.trains.length) { cancel(pollTimer); pollTimer = null; }
                contextReady = true;
                if (changedStation) { stopRotation(); signature = ''; }
                updateAlerts();
                if (enabled && context.trains.length && (!feed || now() - lastFetch >= REFRESH_MS)) refresh();
                else if (enabled && context.trains.length && pollTimer === null) schedulePoll();
            },
            setEnabled(value) {
                enabled = Boolean(value);
                if (!enabled) {
                    requestId++;
                    if (controller) controller.abort();
                    controller = null;
                    pending = false;
                    cancel(pollTimer); pollTimer = null;
                    stopRotation();
                } else {
                    signature = '';
                    updateAlerts();
                    if (!feed || now() - lastFetch >= REFRESH_MS) refresh();
                    else schedulePoll();
                }
                render();
            }
        };
    }

    const api = { normalizeRoute, englishText, isActive, selectAlerts, pageAlerts, updatedLabel, createServiceAlerts, MTA_ALERTS_URL };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ServiceAlerts = createServiceAlerts();
})(typeof window === 'undefined' ? globalThis : window);

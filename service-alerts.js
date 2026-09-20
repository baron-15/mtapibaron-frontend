(function (root) {
    'use strict';

    const HOLD_MS = 10000;
    const FADE_MS = 300;
    const ROUTES = new Set(['1', '2', '3', '4', '5', '6', '7', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'L', 'M', 'N', 'Q', 'R', 'W', 'Z', 'S', 'SI', 'FS', 'GS', 'H']);

    function normalizeRoute(value) {
        const route = String(value || '').toUpperCase().replace(/X$/, '');
        return route === 'SIR' ? 'SI' : route;
    }

    function isUsable(payload, nowMs) {
        return payload && ['ok', 'stale'].includes(payload.status) &&
            Array.isArray(payload.alerts) && Number(payload.expiresAt) * 1000 > nowMs;
    }

    function selectVisibleAlerts(payload, trains, nowMs) {
        if (!isUsable(payload, nowMs)) return [];
        const routes = new Set(trains.map(train => normalizeRoute(train.route)));
        if (!routes.size) return [];
        return payload.alerts.flatMap(alert => {
            if (!alert || typeof alert.text !== 'string' || !Array.isArray(alert.routes) ||
                alert.activeUntil != null && !(Number(alert.activeUntil) * 1000 > nowMs)) return [];
            const matched = alert.routes.map(normalizeRoute).filter(route => routes.has(route));
            return matched.length || alert.stationWide ? [{ ...alert, routes: matched }] : [];
        });
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
                        const symbols = alert.routes.length ? alert.routes.map(routeBadge) : [element('span', 'alert-station-symbol', '!')];
                        symbols.slice(0, -1).forEach(badge => badges.appendChild(badge));
                        const anchor = element('span', 'alert-badge-anchor');
                        anchor.appendChild(symbols[symbols.length - 1]);
                        const warning = element('span', 'alert-warning-symbol ' + (alert.planned ? 'alert-warning-planned' : 'alert-warning-delay'));
                        warning.setAttribute('aria-hidden', 'true');
                        anchor.appendChild(warning);
                        badges.appendChild(anchor);
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
        const view = options.render || createAlertsView(options.document || root.document);
        const reducedMotion = options.reducedMotion || (() => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const isHidden = options.isHidden || (() => root.document && root.document.hidden);
        let enabled = true, context = { trains: [], serviceAlerts: null }, contextReady = false;
        let alerts = [], signature = '', pageIndex = 0, fading = false;
        let rotationTimer = null, swapTimer = null, expiryTimer = null;
        function render() {
            const payload = context.serviceAlerts;
            let status = '';
            if (!contextReady) status = 'Waiting for station arrivals…';
            else if (!context.trains.length) status = 'No upcoming trains to match service alerts.';
            else if (payload && payload.status === 'loading') status = 'Checking service alerts…';
            else if (!isUsable(payload, now())) status = 'Service alerts temporarily unavailable. Check mta.info for updates.';
            else if (payload.status === 'stale') status = 'Updates delayed. Showing the latest available MTA alerts.';
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
            const next = selectVisibleAlerts(context.serviceAlerts, context.trains, now());
            const nextSignature = JSON.stringify(next);
            if (signature !== nextSignature) {
                stopRotation();
                alerts = next;
                signature = nextSignature;
                pageIndex = 0;
                scheduleRotation();
            }
            cancel(expiryTimer);
            expiryTimer = null;
            if (enabled && isUsable(context.serviceAlerts, now())) {
                const deadlines = [context.serviceAlerts.expiresAt, ...alerts.map(alert => alert.activeUntil)]
                    .map(value => Number(value) * 1000).filter(value => value > now());
                expiryTimer = later(updateAlerts, Math.min(...deadlines) - now());
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
        return {
            setContext(value) {
                const changedStation = context.stationId !== value.stationId;
                context = { trains: [], serviceAlerts: null, ...value };
                contextReady = true;
                if (changedStation) { stopRotation(); signature = ''; }
                updateAlerts();
            },
            setEnabled(value) {
                enabled = Boolean(value);
                if (!enabled) {
                    cancel(expiryTimer); expiryTimer = null;
                    stopRotation();
                } else {
                    signature = '';
                    updateAlerts();
                }
                render();
            }
        };
    }

    const api = { normalizeRoute, selectVisibleAlerts, pageAlerts, updatedLabel, createServiceAlerts };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ServiceAlerts = createServiceAlerts();
})(typeof window === 'undefined' ? globalThis : window);

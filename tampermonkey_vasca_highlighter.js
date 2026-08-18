// ==UserScript==
// @name         Vasca Highlighter (Rodeo + Dock) via Eagle-Eye
// @namespace    eu-vret
// @version      2.0.0
// @description  Evidenzia in verde su Rodeo e Outbound Dock Management i pacchi scansionati alle vasche. Legge i codici dal Google Sheet, li risolve via Eagle-Eye in tutti i loro identificatori, e li evidenzia sul DOM. Basato sul RODEO Package Finder di Nick Hebert.
// @author       MXP5 (Davide Bonvino) | Base Eagle-Eye: Nick Hebert
// @match        https://rodeo-dub.amazon.com/*
// @match        https://rodeo-iad.amazon.com/*
// @match        https://trans-logistics-eu.amazon.com/ssp/dock/hrz/ob*
// @match        https://eagleeye.amazon.dev/?lang=en_US&region=EU
// @connect      eagleeye-api.ats.amazon.dev
// @connect      eagleeye.amazon.dev
// @connect      docs.google.com
// @connect      sheets.googleusercontent.com
// @connect      *.googleusercontent.com
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== EAGLE-EYE TOKEN EXTRACTION ====================
    const EAGLEEYE_ORIGIN = 'https://eagleeye.amazon.dev';
    if (location.href.startsWith(EAGLEEYE_ORIGIN)) {
        const stored = window.localStorage.getItem('amzn-cognito-token:eagle-eye');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.token) {
                    GM_setValue('eagleeyeToken', parsed.token);
                    console.log('[VascaHL] ✅ Eagle-Eye token salvato.');
                }
            } catch (e) {
                console.error('[VascaHL] Errore parsing token:', e);
            }
        } else {
            console.log('[VascaHL] ⚠️ Nessun token Eagle-Eye. Fai login.');
        }
        return; // Su Eagle-Eye non fa altro
    }

    // ==================== CONFIG ====================
    const SHEET_ID = '1xblEjqHdpXCGJgatKeJgDx3810dP83Z92-C3uonL0gY';
    const GID = '1642192258';
    const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
    const COLUMN_INDEX = 1; // colonna B = scannable_id
    const EAGLEEYE_API = 'https://eu.eagleeye-api.ats.amazon.dev';
    const SHEET_REFRESH_MS = 30000;    // rilegge lo Sheet ogni 30s
    const HIGHLIGHT_REFRESH_MS = 5000; // ri-scansiona il DOM ogni 5s
    const RESOLVE_DELAY_MS = 250;      // pausa tra le chiamate Eagle-Eye (rate limit)

    const LOG = (...a) => console.log('[VascaHL]', ...a);
    const WARN = (...a) => console.warn('[VascaHL]', ...a);
    const ERR = (...a) => console.error('[VascaHL]', ...a);

    LOG('Caricato v2.0.0 su', location.hostname);

    // ==================== STATO ====================
    // Insieme di tutti gli identificatori (lowercase) da evidenziare
    let highlightIds = new Set();
    // Cache: codice grezzo -> array di ID risolti (persistente)
    let resolveCache = {};
    // Codici già visti (per non ri-risolvere)
    let seenCodes = new Set();
    let resolving = false;

    function isSpoo(code) { return /^sp[A-Za-z0-9]/i.test(code); }

    function loadCache() {
        try { resolveCache = JSON.parse(GM_getValue('vascaHL_cache', '{}')); }
        catch (e) { resolveCache = {}; }
        // Ripopola highlightIds dalla cache
        Object.values(resolveCache).forEach(ids => {
            ids.forEach(id => { if (id) highlightIds.add(id.toLowerCase()); });
        });
    }
    function saveCache() {
        GM_setValue('vascaHL_cache', JSON.stringify(resolveCache));
    }

    // ==================== EAGLE-EYE QUERY ====================
    function queryEagleEye(searchValue) {
        return new Promise((resolve) => {
            const token = GM_getValue('eagleeyeToken', null);
            if (!token) {
                WARN('Nessun token Eagle-Eye. Apri eagleeye.amazon.dev per catturarlo.');
                resolve(null);
                return;
            }

            const isShipmentId = /^\d{15}$/.test(searchValue);
            const endpoint = isShipmentId ? 'shipment' : 'scannable';
            const request = { getLairManifestDetails: false, multipleVersions: false };
            if (isShipmentId) request.shipmentIds = [searchValue.toString()];
            else request.scannableIds = [searchValue];

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${EAGLEEYE_API}/${endpoint}`,
                anonymous: true,
                headers: { 'Content-Type': 'application/json', 'Authorization': token },
                data: JSON.stringify(request),
                timeout: 15000,
                onload: function (response) {
                    if (response.status === 401 || response.status === 403) {
                        GM_setValue('eagleeyeToken', null);
                        WARN('Token Eagle-Eye scaduto. Riapri eagleeye.amazon.dev.');
                        resolve(null);
                        return;
                    }
                    if (response.status !== 200) {
                        WARN('Eagle-Eye HTTP', response.status, 'per', searchValue);
                        resolve(null);
                        return;
                    }
                    try {
                        const data = JSON.parse(response.responseText);
                        let pkg = null;
                        if (Array.isArray(data) && data.length > 0 && data[0].package) pkg = data[0].package;
                        else if (data && data.package) pkg = data.package;
                        resolve(pkg);
                    } catch (e) {
                        ERR('Risposta Eagle-Eye non JSON:', e);
                        resolve(null);
                    }
                },
                onerror: () => { ERR('Errore rete Eagle-Eye'); resolve(null); },
                ontimeout: () => { ERR('Timeout Eagle-Eye'); resolve(null); }
            });
        });
    }

    // Estrae tutti gli identificatori utili da un package Eagle-Eye
    function extractIds(pkg) {
        if (!pkg) return [];
        const ids = [];
        const push = v => { if (v) ids.push(String(v)); };
        push(pkg.scannableId);
        push(pkg.label);                 // encrypted_shipment_id (SL/ST...)
        push(pkg.containerLabel);
        push(pkg.orderingShipmentId);
        push(pkg.shipmentId);
        push(pkg.trackingId);
        push(pkg.parentContainerLabel);
        if (pkg.orderingOrderId) {
            push(pkg.orderingOrderId.substring(pkg.orderingOrderId.lastIndexOf('*') + 1));
        }
        return ids;
    }

    // ==================== LETTURA SHEET + RISOLUZIONE ====================
    function loadSheetAndResolve() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: SHEET_CSV_URL,
            onload: async function (response) {
                if (response.status !== 200) { WARN('Errore Sheet:', response.status); return; }

                const lines = response.responseText.split('\n');
                const toResolve = [];

                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(',');
                    if (cols.length > COLUMN_INDEX) {
                        let code = cols[COLUMN_INDEX].trim().replace(/"/g, '');
                        // Normalizza "?" -> "_" (scanner) e via eventuali prefissi
                        code = code.replace(/\?/g, '_');
                        if (!code) continue;

                        // Le SPOO le evidenziamo direttamente (match testuale)
                        highlightIds.add(code.toLowerCase());

                        // Se già in cache o già visto, salta la risoluzione
                        if (resolveCache[code] || seenCodes.has(code)) continue;
                        seenCodes.add(code);
                        toResolve.push(code);
                    }
                }

                LOG(`Sheet: ${seenCodes.size} codici totali, ${toResolve.length} nuovi da risolvere`);
                highlightPage();

                // Risolvi i nuovi codici via Eagle-Eye (sequenziale, con pausa)
                if (toResolve.length > 0 && !resolving) {
                    resolving = true;
                    for (const code of toResolve) {
                        const pkg = await queryEagleEye(code);
                        const ids = extractIds(pkg);
                        resolveCache[code] = ids;
                        ids.forEach(id => highlightIds.add(id.toLowerCase()));
                        if (ids.length > 0) LOG(`✅ ${code} → ${ids.length} ID risolti`);
                        await new Promise(r => setTimeout(r, RESOLVE_DELAY_MS));
                    }
                    saveCache();
                    resolving = false;
                    highlightPage();
                }
            },
            onerror: () => ERR('Errore caricamento Sheet')
        });
    }

    // ==================== EVIDENZIAZIONE DOM ====================
    function highlightPage() {
        if (highlightIds.size === 0) return;
        const els = document.querySelectorAll('td, span, div, a, p, li, th, label');
        els.forEach(el => {
            if (el.dataset.vascaHl) return;
            const text = el.textContent.trim();
            if (!text || text.length > 200) return;
            const tl = text.toLowerCase();

            if (highlightIds.has(tl)) { applyHighlight(el); return; }
            if (el.children.length === 0) {
                for (const id of highlightIds) {
                    if (tl.includes(id)) { applyHighlight(el); break; }
                }
            }
        });
    }

    function applyHighlight(el) {
        el.style.backgroundColor = '#d4edda';
        el.style.border = '2px solid #28a745';
        el.style.borderRadius = '3px';
        el.style.padding = '1px 4px';
        el.title = '✅ Scansionato alle vasche (injection confermata)';
        el.dataset.vascaHl = 'true';
    }

    // ==================== BADGE DI STATO ====================
    GM_addStyle(`
        #vasca-hl-badge {
            position: fixed; bottom: 10px; right: 10px; z-index: 999999;
            background: #232f3e; color: #fff; padding: 8px 14px; border-radius: 20px;
            font-family: Arial, sans-serif; font-size: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3); opacity: 0.85;
        }
    `);
    function buildBadge() {
        if (document.getElementById('vasca-hl-badge')) return;
        const b = document.createElement('div');
        b.id = 'vasca-hl-badge';
        b.textContent = '📦 Evidenzia pacchi letti alle vasche';
        document.body.appendChild(b);
    }

    // ==================== OBSERVER + AVVIO ====================
    let debounce;
    const observer = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(highlightPage, 400);
    });

    function start() {
        buildBadge();
        loadCache();
        // Se non c'è token, apri Eagle-Eye una volta per catturarlo
        if (!GM_getValue('eagleeyeToken', null)) {
            WARN('Token mancante: apri eagleeye.amazon.dev per attivare la risoluzione.');
        }
        loadSheetAndResolve();
        setInterval(loadSheetAndResolve, SHEET_REFRESH_MS);
        setInterval(highlightPage, HIGHLIGHT_REFRESH_MS);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

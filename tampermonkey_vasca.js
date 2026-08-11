// ==UserScript==
// @name         Vasca Scanner - Highlight Injected
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Evidenzia gli Scannable ID scansionati alle vasche su Rodeo/Troubleshooting
// @author       MXP5
// @match        https://rodeo-dub.amazon.com/*
// @match        https://troubleshooting-dub.amazon.com/*
// @match        https://rodeo-iad.amazon.com/*
// @match        https://troubleshooting-iad.amazon.com/*
// @match        https://rodeo.amazon.com/*
// @match        https://troubleshooting.amazon.com/*
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ─── CONFIG ─────────────────────────────────────────────────────────────
    const SHEET_ID = '1xblEjqHdpXCGJgatKeJgDx3810dP83Z92-C3uonL0gY';
    const GID = '1642192258';
    const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

    // Ricarica lista ogni 60 secondi
    const REFRESH_INTERVAL = 60000;

    // Set di scannable ID scansionati
    let scannedIDs = new Set();

    // ─── CARICA LISTA DAL GOOGLE SHEET ──────────────────────────────────────
    function loadScannedIDs() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: SHEET_CSV_URL,
            onload: function(response) {
                if (response.status === 200) {
                    const lines = response.responseText.split('\n');
                    scannedIDs.clear();

                    // Skip header (prima riga)
                    for (let i = 1; i < lines.length; i++) {
                        const cols = lines[i].split(',');
                        if (cols.length >= 2) {
                            // Colonna B = scannable_id
                            const scanId = cols[1].trim().replace(/"/g, '');
                            if (scanId && scanId.startsWith('sp')) {
                                scannedIDs.add(scanId);
                            }
                        }
                    }
                    console.log(`[Vasca Scanner] Caricati ${scannedIDs.size} scan`);
                    highlightPage();
                }
            },
            onerror: function(err) {
                console.error('[Vasca Scanner] Errore caricamento sheet:', err);
            }
        });
    }

    // ─── EVIDENZIA NELLA PAGINA ─────────────────────────────────────────────
    function highlightPage() {
        if (scannedIDs.size === 0) return;

        // Cerca in tutti gli elementi visibili
        const allElements = document.querySelectorAll('td, span, div, a, p, li, th, label');
        let highlighted = 0;

        allElements.forEach(el => {
            // Salta se già evidenziato
            if (el.dataset.vascaHighlighted) return;

            const text = el.textContent.trim();

            // Match esatto
            if (scannedIDs.has(text)) {
                applyHighlight(el);
                highlighted++;
            }
            // Match parziale (solo su elementi foglia senza figli)
            else if (el.children.length === 0 && text.length < 200) {
                for (const scanId of scannedIDs) {
                    if (text.includes(scanId)) {
                        applyHighlight(el);
                        highlighted++;
                        break;
                    }
                }
            }
        });

        if (highlighted > 0) {
            console.log(`[Vasca Scanner] Evidenziati ${highlighted} elementi`);
        }
    }

    function applyHighlight(element) {
        element.style.backgroundColor = '#d4edda';
        element.style.border = '2px solid #28a745';
        element.style.borderRadius = '3px';
        element.style.padding = '1px 4px';
        element.title = '✅ Scansionato alle vasche (injection confermata)';
        element.dataset.vascaHighlighted = 'true';
    }

    // ─── OBSERVER PER CONTENUTO DINAMICO ────────────────────────────────────
    let debounceTimer;
    const observer = new MutationObserver(function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(highlightPage, 500);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // ─── AVVIO ──────────────────────────────────────────────────────────────
    loadScannedIDs();
    setInterval(loadScannedIDs, REFRESH_INTERVAL);

    // Badge visivo
    const badge = document.createElement('div');
    badge.innerHTML = '📦 Vasca Tracker ON';
    badge.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: #28a745;
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: bold;
        z-index: 99999;
        opacity: 0.8;
    `;
    document.body.appendChild(badge);

})();

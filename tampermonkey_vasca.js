// ==UserScript==
// @name         Vasca Scanner - Highlight Injected
// @namespace    http://tampermonkey.net/
// @version      1.0
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

    // Quanto spesso ricaricare la lista (millisecondi) - ogni 60 secondi
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

                    // Skip header (prima riga: Timestamp, scannable_id)
                    for (let i = 1; i < lines.length; i++) {
                        const cols = lines[i].split(',');
                        if (cols.length >= 2) {
                            // La colonna B (indice 1) è lo scannable_id
                            const scanId = cols[1].trim().replace(/"/g, '');
                            if (scanId) {
                                scannedIDs.add(scanId);
                            }
                        }
                    }
                    console.log(`[Vasca Scanner] Caricati ${scannedIDs.size} scan`);

                    // Dopo il caricamento, evidenzia
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

        // Cerca tutti gli elementi di testo nella pagina
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const nodesToHighlight = [];
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text && scannedIDs.has(text)) {
                nodesToHighlight.push(node);
            }
        }

        // Anche in celle di tabella, span, div, td, ecc.
        const allElements = document.querySelectorAll('td, span, div, a, p, li');
        allElements.forEach(el => {
            const text = el.textContent.trim();
            // Match esatto (il testo dell'elemento è solo lo scannable ID)
            if (scannedIDs.has(text)) {
                applyHighlight(el);
            }
            // Match parziale (lo scannable ID è contenuto nel testo)
            else {
                for (const scanId of scannedIDs) {
                    if (text.includes(scanId) && el.children.length === 0) {
                        applyHighlight(el);
                        break;
                    }
                }
            }
        });

        console.log(`[Vasca Scanner] Evidenziati ${nodesToHighlight.length} nodi testuali`);
    }

    function applyHighlight(element) {
        // Non evidenziare se già evidenziato
        if (element.dataset.vascaHighlighted) return;

        element.style.backgroundColor = '#d4edda';
        element.style.border = '2px solid #28a745';
        element.style.borderRadius = '3px';
        element.style.padding = '1px 4px';
        element.title = '✅ Scansionato alle vasche (injection confermata)';
        element.dataset.vascaHighlighted = 'true';
    }

    // ─── OBSERVER PER CONTENUTO DINAMICO ────────────────────────────────────
    // Rodeo/Troubleshooting caricano dati in modo dinamico (AJAX)
    const observer = new MutationObserver(function(mutations) {
        // Re-evidenzia quando il DOM cambia
        highlightPage();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // ─── AVVIO ──────────────────────────────────────────────────────────────
    // Carica subito
    loadScannedIDs();

    // Ricarica ogni REFRESH_INTERVAL
    setInterval(loadScannedIDs, REFRESH_INTERVAL);

    // Badge visivo nell'angolo
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

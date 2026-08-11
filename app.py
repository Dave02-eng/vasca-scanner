"""
Vasca Scanner — Streamlit App
================================
Pagina web per scansione pacchi alle vasche.
L'operatore spara il barcode, l'app salva su Google Sheets via Google Form.
"""

import streamlit as st
import requests
from datetime import datetime

# ─── Config ──────────────────────────────────────────────────────────────────
st.set_page_config(page_title="Scan-point Vasche", page_icon="📦", layout="centered")

# Google Apps Script endpoint (scrittura)
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxGCxERhIMskRiXUdNlGVZh1I2_Tr6gzU3gGiSNDR8bb7onlzX8Vifocd55qlehJFuCEQ/exec"

# Google Sheet (per lettura lista)
SHEET_ID = "1xblEjqHdpXCGJgatKeJgDx3810dP83Z92-C3uonL0gY"
SHEET_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=1642192258"


# ─── CSS ─────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    .stApp { font-family: 'Segoe UI', sans-serif; }
    .scanner-header {
        background: linear-gradient(135deg, #1a5276, #2980b9);
        color: white;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        text-align: center;
    }
    .scan-count {
        font-size: 3rem;
        font-weight: 700;
        color: #2c3e50;
        text-align: center;
        margin: 10px 0;
    }
    .scan-success {
        background-color: #d4edda;
        border: 1px solid #c3e6cb;
        border-radius: 6px;
        padding: 10px;
        text-align: center;
        margin: 10px 0;
    }
    .last-scan {
        background-color: #e8f4fd;
        border: 1px solid #b8daff;
        border-radius: 6px;
        padding: 10px;
        font-family: monospace;
        font-size: 1.1rem;
        text-align: center;
    }
</style>
""", unsafe_allow_html=True)


# ─── Session State ───────────────────────────────────────────────────────────
if "scan_count" not in st.session_state:
    st.session_state.scan_count = 0
if "last_scan" not in st.session_state:
    st.session_state.last_scan = ""
if "scan_history" not in st.session_state:
    st.session_state.scan_history = []


# ─── Header ──────────────────────────────────────────────────────────────────
st.markdown("""
<div class='scanner-header'>
    <h1 style='margin:0;color:white;font-size:2.5rem;'>📦 Scan-point Vasche</h1>
    <p style='margin:10px 0 0 0;opacity:0.9;font-size:1.1rem;'>⚠️ Sparare la <b>Sp00</b> del pacco</p>
</div>
""", unsafe_allow_html=True)


# ─── Istruzione ──────────────────────────────────────────────────────────────
st.markdown("<h2 style='text-align:center;color:#2c3e50;margin:20px 0;'>📦 Scansiona la Sp00</h2>",
           unsafe_allow_html=True)


# ─── Input Scanner ───────────────────────────────────────────────────────────
# Uso un form: invia SOLO quando si preme Enter (lo scanner lo fa automaticamente)

with st.form("scan_form", clear_on_submit=True):
    scan_input = st.text_input(
        "Scansiona qui",
        key="scan_input",
        placeholder="In attesa di scansione...",
        label_visibility="collapsed"
    )
    submitted = st.form_submit_button("Invia", type="primary", use_container_width=True)
    # Nascondi il bottone via CSS
    st.markdown("""<style>
        button[kind="primaryFormSubmit"] { display: none !important; }
    </style>""", unsafe_allow_html=True)

if submitted and scan_input and scan_input.strip():
    barcode = scan_input.strip()

    # Invia a Google Apps Script
    try:
        import json
        response = requests.post(
            APPS_SCRIPT_URL,
            json={"scannable_id": barcode},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            st.session_state.scan_count += 1
            st.session_state.last_scan = barcode
            st.session_state.scan_history.insert(0, {
                "id": barcode,
                "time": datetime.now().strftime("%H:%M:%S")
            })
            st.session_state.scan_history = st.session_state.scan_history[:50]
            st.markdown("<div class='scan-success'>✅ Salvato!</div>", unsafe_allow_html=True)
        else:
            st.error(f"❌ Errore salvataggio: {response.status_code}")
    except Exception as e:
        st.error(f"❌ Errore connessione: {str(e)}")


# ─── Storico sessione ────────────────────────────────────────────────────────
if st.session_state.scan_history:
    with st.expander(f"📋 Storico sessione ({len(st.session_state.scan_history)} scan)", expanded=False):
        for item in st.session_state.scan_history[:20]:
            st.markdown(f"`{item['time']}` — **{item['id']}**")


# ─── Footer ─────────────────────────────────────────────────────────────────
st.divider()
st.caption("MXP5 — Vasca Injection Tracker")

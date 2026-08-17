"""
Vasca Scanner — Streamlit App
================================
Pagina web per scansione pacchi alle vasche.
1. L'operatore spara il badge → login riconosciuto
2. L'operatore spara le Sp00 → salvate su Google Sheet con login
"""

import streamlit as st
import requests
from datetime import datetime
from badges import BADGE_MAP

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
    .scan-success {
        background-color: #d4edda;
        border: 1px solid #c3e6cb;
        border-radius: 6px;
        padding: 10px;
        text-align: center;
        margin: 10px 0;
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
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False
if "user_login" not in st.session_state:
    st.session_state.user_login = ""
if "user_name" not in st.session_state:
    st.session_state.user_name = ""


# ─── Header ──────────────────────────────────────────────────────────────────
st.markdown("""
<div class='scanner-header'>
    <h1 style='margin:0;color:white;font-size:2.5rem;'>📦 Scan-point Vasche</h1>
</div>
""", unsafe_allow_html=True)


# ─── LOGIN VIA BADGE ─────────────────────────────────────────────────────────
if not st.session_state.logged_in:
    st.markdown("<h2 style='text-align:center;color:#2c3e50;margin:20px 0;'>🪪 Spara il tuo Badge</h2>",
               unsafe_allow_html=True)

    with st.form("badge_form", clear_on_submit=True):
        badge_input = st.text_input(
            "Badge",
            placeholder="Spara il badge...",
            label_visibility="collapsed"
        )
        badge_submitted = st.form_submit_button("OK", type="primary", use_container_width=True)
        st.markdown("""<style>
            button[kind="primaryFormSubmit"] { display: none !important; }
        </style>""", unsafe_allow_html=True)

    if badge_submitted and badge_input and badge_input.strip():
        badge_id = badge_input.strip()
        if badge_id in BADGE_MAP:
            info = BADGE_MAP[badge_id]
            st.session_state.logged_in = True
            st.session_state.user_login = info["login"]
            st.session_state.user_name = info["name"]
            st.rerun()
        else:
            st.error("⚠️ Badge non riconosciuto. Riprova.")

    st.stop()


# ─── SCANNER (solo se loggato) ───────────────────────────────────────────────
# Saluto
first_name = st.session_state.user_name.split(",")[1].strip().split()[0] if "," in st.session_state.user_name else st.session_state.user_name
st.markdown(f"<h2 style='text-align:center;color:#2c3e50;margin:10px 0;'>Ciao {first_name}, scansiona l'etichetta pacco</h2>",
           unsafe_allow_html=True)

# ─── Input Scanner ───────────────────────────────────────────────────────────
with st.form("scan_form", clear_on_submit=True):
    scan_input = st.text_input(
        "Scansiona qui",
        key="scan_input",
        placeholder="In attesa di scansione...",
        label_visibility="collapsed"
    )
    submitted = st.form_submit_button("Invia", type="primary", use_container_width=True)
    st.markdown("""<style>
        button[kind="primaryFormSubmit"] { display: none !important; }
    </style>""", unsafe_allow_html=True)

if submitted and scan_input and scan_input.strip():
    barcode = scan_input.strip()

    # Invia a Google Apps Script con login
    try:
        response = requests.post(
            APPS_SCRIPT_URL,
            json={"scannable_id": barcode, "login": st.session_state.user_login},
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


# ─── Footer ─────────────────────────────────────────────────────────────────
st.divider()
st.caption(f"👤 {st.session_state.user_login} — MXP5 Vasca Injection Tracker")

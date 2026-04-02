# ===============================================================
# CONFIG.PY - COMPLETE CONFIGURATION
# ===============================================================

# ==================== CANDLE DATA ====================

CANDLE_FETCH_COUNT = 1000

# ==================== FETCH INTERVALS ====================

TICK_FETCH_INTERVAL       = 0.1    # seconds — Thread 1 (tick + M1 update)
POSITION_FETCH_INTERVAL   = 0.5    # seconds — Thread 3 (positions + account)
CONNECTION_CHECK_INTERVAL = 5      # seconds — Thread 3 (connection status)

# ==================== TRADE CONFIGURATION ====================

MT5_DEVIATION        = 5
MT5_MAGIC            = 234000
TRADE_COMMENT        = "MEGA FLOWZ"
CLOSE_TRADE_COMMENT  = "MEGA FLOWZ - Close"

# ==================== WEBSOCKET ====================

WS_HOST = "127.0.0.1"
WS_PORT = 8765

# ==================== PRICE PRECISION ====================
# Used by connector.py to round prices before sending to frontend
# Matched by checking if key is contained in symbol name

SYMBOL_PRECISION = {
    # JPY pairs — 3dp
    'JPY':  3,

    # Crypto — 2dp
    'BTC':  2,
    'ETH':  2,
    'LTC':  2,
    'XRP':  4,
    'BNB':  2,
    'SOL':  2,
    'ADA':  4,
    'DOT':  3,

    # Metals — 2dp
    'XAU':  2,
    'XAG':  2,
    'XPT':  2,
    'XPD':  2,

    # Indices — 1dp
    'US30': 1,
    'SPX':  1,
    'NAS':  1,
    'DAX':  1,
    'FTSE': 1,
    'CAC':  1,
    'NIK':  1,
    'ASX':  1,

    # Oil & Commodities — 2dp
    'OIL':  2,
    'WTI':  2,
    'BRENT':2,
    'NG':   3,
}

DEFAULT_PRECISION = 5  # Default forex pairs — 5dp

# ===============================================================
# END OF CONFIGURATION
# ===============================================================
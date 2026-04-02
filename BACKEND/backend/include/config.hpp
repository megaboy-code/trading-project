// ================================================================
// CONFIG.HPP - Server configuration constants
// ================================================================

#pragma once
#include <string>

namespace Config {

    // ── WEBSOCKET ──
    constexpr const char* WS_HOST = "127.0.0.1";
    constexpr int         WS_PORT = 8765;

    // ── CANDLE DATA ──
    constexpr int CANDLE_FETCH_COUNT = 1000;

    // ── TRADE CONFIGURATION ──
    constexpr int         MT5_DEVIATION = 5;
    constexpr int         MT5_MAGIC     = 234000;
    constexpr const char* TRADE_COMMENT = "MEGA FLOWZ";
    constexpr const char* CLOSE_COMMENT = "MEGA FLOWZ - Close";

    // ── PRICE PRECISION ──
    constexpr int DEFAULT_PRECISION = 5;
}
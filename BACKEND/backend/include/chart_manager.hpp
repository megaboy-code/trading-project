// ================================================================
// CHART_MANAGER.HPP - Chart State & Candle Storage
// Replaces: chart_manager.py
// ================================================================

#pragma once
#include <string>
#include <unordered_map>
#include <optional>
#include <mutex>
#include "candle.hpp"
#include "config.hpp"

// ── Chart state ──
struct ChartState {
    std::string symbol;
    std::string timeframe;
    std::string detected;
    bool        initial_sent    = false;
    bool        valid           = false;
    bool        pending_change  = false;
};

class ChartManager {
private:
    ChartState                                      state;
    std::unordered_map<std::string, CandleBuffer>   buffers;
    std::optional<ChartState>                       last_valid_state;
    mutable std::mutex                              mtx;

    // ── Timeframe map ──
    std::unordered_map<std::string, std::string> tf_map = {
        {"M1",  "M1"},  {"M5",  "M5"},  {"M15", "M15"},
        {"H1",  "H1"},  {"H4",  "H4"},  {"D1",  "D1"},
        {"1",   "M1"},  {"5",   "M5"},  {"15",  "M15"},
        {"60",  "H1"},  {"240", "H4"},  {"1D",  "D1"}
    };

public:

    // ── Storage key ──
    std::string storageKey(
        const std::string& symbol,
        const std::string& timeframe) const
    {
        return symbol + "_" + timeframe;
    }

    // ── Set chart state ──
    void setChartState(
        const std::string& symbol,
        const std::string& timeframe,
        const std::string& detected)
    {
        std::lock_guard<std::mutex> lock(mtx);

        state.symbol         = symbol;
        state.timeframe      = timeframe;
        state.detected       = detected;
        state.initial_sent   = false;
        state.pending_change = true;
        state.valid          = !detected.empty();

        if (state.valid) {
            last_valid_state = state;
        }
    }

    // ── Get chart state ──
    ChartState getChartState() const {
        std::lock_guard<std::mutex> lock(mtx);
        return state;
    }

    // ── Clear chart state ──
    void clearChartState() {
        std::lock_guard<std::mutex> lock(mtx);
        state = ChartState{};
    }

    // ── Mark chart ready ──
    bool markChartReady() {
        std::lock_guard<std::mutex> lock(mtx);
        if (!state.detected.empty()) {
            state.initial_sent   = true;
            state.pending_change = false;
            state.valid          = true;
            return true;
        }
        return false;
    }

    // ── Is chart valid ──
    bool isChartValid() const {
        std::lock_guard<std::mutex> lock(mtx);
        return state.valid
            && !state.pending_change
            && state.initial_sent
            && !state.detected.empty()
            && !state.symbol.empty()
            && !state.timeframe.empty();
    }

    // ── Store candles ──
    void storeCandles(
        const std::string& symbol,
        const std::string& timeframe,
        const CandleBuffer& candles)
    {
        std::lock_guard<std::mutex> lock(mtx);
        buffers[storageKey(symbol, timeframe)] = candles;
    }

    // ── Get stored candles ──
    CandleBuffer getCandles(
        const std::string& symbol,
        const std::string& timeframe) const
    {
        std::lock_guard<std::mutex> lock(mtx);
        auto it = buffers.find(storageKey(symbol, timeframe));
        if (it != buffers.end()) return it->second;
        return {};
    }

    // ── Update candle ──
    void updateCandle(
        const std::string& symbol,
        const std::string& timeframe,
        const Candle& candle)
    {
        std::lock_guard<std::mutex> lock(mtx);
        auto key = storageKey(symbol, timeframe);
        auto it  = buffers.find(key);

        if (it == buffers.end()) return;

        auto& buf = it->second;

        if (!buf.empty() && buf.back().time == candle.time) {
            buf.back() = candle;   // update existing
        } else {
            buf.push_back(candle); // new candle
            // Keep buffer size limited
            if (buf.size() > Config::CANDLE_FETCH_COUNT) {
                buf.pop_front();
            }
        }
    }

    // ── Clear candles ──
    void clearCandles(
        const std::string& symbol = "",
        const std::string& timeframe = "")
    {
        std::lock_guard<std::mutex> lock(mtx);
        if (!symbol.empty() && !timeframe.empty()) {
            buffers.erase(storageKey(symbol, timeframe)); 
        } else {
            buffers.clear();
        }
    }

    // ── Reconnection ──
    void saveStateForReconnection() {
        std::lock_guard<std::mutex> lock(mtx);
        if (state.valid) last_valid_state = state;
    }

    std::optional<ChartState> getReconnectionState() const {
        std::lock_guard<std::mutex> lock(mtx);
        return last_valid_state;
    }
};

// ── Global instance ──
inline ChartManager chart_manager; 
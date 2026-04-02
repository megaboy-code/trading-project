// ================================================================
// BROADCAST_MANAGER.HPP - Data Streaming & Broadcasting
// Push architecture — Python threads push data via callbacks
//   Thread 1 → on_tick        — bid/ask per symbol
//   Thread 1 → on_bar_update  — raw M1 OHLC → recompute all TFs
//   Thread 3 → on_positions_update  — positions + account
//   Thread 3 → on_connection_update — connection status
// C++ calculates change % from stored daily open
// No polling — no GIL contention
// ================================================================

#pragma once
#include <string>
#include <set>
#include <vector>
#include <functional>
#include <atomic>
#include <iostream>
#include <algorithm>
#include <mutex>
#include "config.hpp"
#include "chart_manager.hpp"
#include "symbol_cache.hpp"
#include "candle.hpp"

// ── Callback types ──
using BroadcastCallback = std::function<void(const std::string&)>;
using ReconnectCallback = std::function<void()>;

class BroadcastManager {
private:
    BroadcastCallback broadcast_cb;
    ReconnectCallback reconnect_cb;

    // ── Watchlist ──
    std::vector<std::string> watchlist;
    std::mutex               watchlist_mtx;

    // ── Active chart ──
    std::string active_symbol;
    std::string active_timeframe;
    std::mutex  active_mtx;

    // ── Connection state ──
    bool last_connected = false;
    bool first_check    = true;

    void broadcast(const std::string& json) {
        if (broadcast_cb && !json.empty()) broadcast_cb(json);
    }

    // ── Build candle update JSON ──
    std::string buildCandleJSON(
        const std::string& symbol,
        const std::string& timeframe,
        const Candle& c)
    {
        std::string json = "{\"type\":\"update\",";
        json += "\"symbol\":\""    + symbol    + "\",";
        json += "\"timeframe\":\"" + timeframe + "\",";
        json += "\"data\":{";
        json += "\"time\":"   + std::to_string(c.time)   + ",";
        json += "\"open\":"   + std::to_string(c.open)   + ",";
        json += "\"high\":"   + std::to_string(c.high)   + ",";
        json += "\"low\":"    + std::to_string(c.low)    + ",";
        json += "\"close\":"  + std::to_string(c.close)  + ",";
        json += "\"volume\":" + std::to_string(c.volume);
        json += "}}";
        return json;
    }

    // ── Build watchlist tick JSON ──
    std::string buildWatchlistTickJSON(
        const std::string& symbol,
        double bid, double ask,
        int64_t time_msc,
        double change_pct)
    {
        std::string json = "{\"type\":\"watchlist_update\",\"prices\":{";
        json += "\"" + symbol + "\":{";
        json += "\"bid\":"    + std::to_string(bid)             + ",";
        json += "\"ask\":"    + std::to_string(ask)             + ",";
        json += "\"spread\":" + std::to_string(ask - bid)       + ",";
        json += "\"time\":"   + std::to_string(time_msc / 1000) + ",";
        json += "\"change\":" + std::to_string(change_pct);
        json += "}}}";
        return json;
    }

    // ── Build price update JSON ──
    std::string buildPriceJSON(
        const std::string& symbol,
        double bid, double ask,
        int64_t time_msc)
    {
        std::string json = "{\"type\":\"price_update\",";
        json += "\"symbol\":\""  + symbol + "\",";
        json += "\"bid\":"       + std::to_string(bid)             + ",";
        json += "\"ask\":"       + std::to_string(ask)             + ",";
        json += "\"spread\":"    + std::to_string(ask - bid)       + ",";
        json += "\"time\":"      + std::to_string(time_msc / 1000);
        json += "}";
        return json;
    }

public:

    void setBroadcastCallback(BroadcastCallback cb) { broadcast_cb = cb; }
    void setReconnectCallback(ReconnectCallback cb) { reconnect_cb = cb; }

    void setActiveChart(
        const std::string& symbol,
        const std::string& timeframe)
    {
        std::lock_guard<std::mutex> lock(active_mtx);
        active_symbol    = symbol;
        active_timeframe = timeframe;
    }

    // ── Watchlist management ──
    void addToWatchlist(const std::string& symbol) {
        std::lock_guard<std::mutex> lock(watchlist_mtx);
        if (std::find(watchlist.begin(), watchlist.end(), symbol)
            == watchlist.end())
        {
            watchlist.push_back(symbol);
            std::cout << "Watchlist add: " << symbol << std::endl;
        }
    }

    void removeFromWatchlist(const std::string& symbol) {
        std::lock_guard<std::mutex> lock(watchlist_mtx);
        watchlist.erase(
            std::remove(watchlist.begin(), watchlist.end(), symbol),
            watchlist.end()
        );
        std::cout << "Watchlist remove: " << symbol << std::endl;
    }

    std::vector<std::string> getWatchlist() {
        std::lock_guard<std::mutex> lock(watchlist_mtx);
        return watchlist;
    }

    bool isInWatchlist(const std::string& symbol) {
        std::lock_guard<std::mutex> lock(watchlist_mtx);
        return std::find(
            watchlist.begin(), watchlist.end(), symbol
        ) != watchlist.end();
    }

    // ================================================================
    // ON TICK — Thread 1 push
    // symbol = detected (e.g. BTCUSDm) — resolve to base first
    // ================================================================
    void onTick(
        const std::string& symbol,
        double bid, double ask,
        int64_t time_msc)
    {
        // ── Resolve detected → base ──
        std::string base = symbol_cache.getBaseSymbol(symbol);

        std::string cur_symbol, cur_timeframe;
        {
            std::lock_guard<std::mutex> lock(active_mtx);
            cur_symbol    = active_symbol;
            cur_timeframe = active_timeframe;
        }

        // ── Price update — active chart only ──
        if (base == cur_symbol) {
            broadcast(buildPriceJSON(base, bid, ask, time_msc));
        }

        // ── Watchlist update ──
        if (isInWatchlist(base)) {
            double daily_open = symbol_cache.getDailyOpen(base);
            double change_pct = 0.0;
            if (daily_open > 0.0) {
                change_pct = ((bid - daily_open) / daily_open) * 100.0;
            }
            broadcast(buildWatchlistTickJSON(
                base, bid, ask, time_msc, change_pct
            ));
        }
    }

    // ================================================================
    // ON BAR UPDATE — Thread 1 push
    // symbol = detected (e.g. BTCUSDm) — resolve to base first
    // Raw M1 → recompute all cached TFs → broadcast active TF
    // ================================================================
    void onBarUpdate(
        const std::string& symbol,
        const CandleBuffer& candles)
    {
        if (candles.empty()) return;

        // ── Resolve detected → base ──
        std::string base = symbol_cache.getBaseSymbol(symbol);

        const Candle& m1 = candles.back();
        if (m1.time == 0) return;

        // ── Recompute all cached TFs from M1 ──
        symbol_cache.processM1Update(base, m1);

        // ── Broadcast active TF only ──
        std::string cur_symbol, cur_timeframe;
        {
            std::lock_guard<std::mutex> lock(active_mtx);
            cur_symbol    = active_symbol;
            cur_timeframe = active_timeframe;
        }

        if (base == cur_symbol && !cur_timeframe.empty()) {
            auto last = symbol_cache.getLastCandle(
                base, cur_timeframe
            );
            if (last.has_value()) {
                broadcast(buildCandleJSON(
                    base, cur_timeframe, last.value()
                ));
            }
        }
    }

    // ================================================================
    // ON POSITIONS UPDATE — Thread 3 push
    // ================================================================
    void onPositionsUpdate(const std::string& json) {
        broadcast(json);
    }

    // ================================================================
    // ON CONNECTION UPDATE — Thread 3 push
    // Only broadcast on state change
    // ================================================================
    void onConnectionUpdate(const std::string& json) {
        bool connected = json.find(
            "\"mt5_connected\":true"
        ) != std::string::npos;

        bool changed = first_check ||
                      (connected != last_connected);

        if (changed) {
            broadcast(json);

            if (connected && !first_check) {
                std::cout << "MT5 Reconnected" << std::endl;
                if (reconnect_cb) reconnect_cb();
            } else if (!connected) {
                std::cout << "MT5 Disconnected" << std::endl;
                chart_manager.saveStateForReconnection();
            }

            last_connected = connected;
            first_check    = false;
        }
    }

    bool isRunning() const { return true; }
};

inline BroadcastManager broadcast_manager;
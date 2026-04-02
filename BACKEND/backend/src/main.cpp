// ================================================================
// MAIN.CPP - MEGA FLOWZ C++ Engine Entry Point
// ================================================================

#include <iostream>
#include <csignal>
#include <atomic>
#include <pybind11/embed.h>

#ifdef _WIN32
#include <windows.h>
#endif

#include "config.hpp"
#include "candle.hpp"
#include "symbol_cache.hpp"
#include "chart_manager.hpp"
#include "trade_handler.hpp"
#include "message_handler.hpp"
#include "broadcast_manager.hpp"
#include "connector_bridge.hpp"
#include "websocket_server.hpp"

namespace py = pybind11;

std::atomic<bool> should_exit { false };

void signalHandler(int sig) {
    std::cout << "\nShutdown signal received" << std::endl;
    should_exit = true;
    ws_server.stop();
    std::exit(0);
}

#ifdef _WIN32
BOOL WINAPI consoleHandler(DWORD type) {
    std::cout << "\nShutdown..." << std::endl;
    should_exit = true;
    std::exit(0);
    return TRUE;
}
#endif

int main() {

#ifdef _WIN32
    SetConsoleOutputCP(65001);
#endif

    std::cout << "MEGA FLOWZ Engine starting..." << std::endl;

    std::signal(SIGINT,  signalHandler);
    std::signal(SIGTERM, signalHandler);

#ifdef _WIN32
    SetConsoleCtrlHandler(consoleHandler, TRUE);
#endif

    // ── Start Python interpreter ──
    py::scoped_interpreter python_guard{};

    // ── Initialize connector bridge ──
    if (!connector_bridge.initialize()) {
        std::cerr << "Failed to initialize connector bridge" << std::endl;
        return 1;
    }

    // ── Connect to MT5 + start threads + wire callbacks ──
    if (!connector_bridge.connect()) {
        std::cerr << "Warning: MT5 not connected." << std::endl;
    } else {
        std::cout << "MT5 connected" << std::endl;
    }

    // ── Wire connector callbacks → broadcast manager ──
    connector_bridge.setTickCallback([](
        const std::string& symbol,
        double bid, double ask,
        int64_t time_msc)
    {
        broadcast_manager.onTick(symbol, bid, ask, time_msc);
    });

    connector_bridge.setBarUpdateCallback([](
        const std::string& symbol,
        const CandleBuffer& candles)
    {
        broadcast_manager.onBarUpdate(symbol, candles);
    });

    connector_bridge.setPositionsCallback([](
        const std::string& json)
    {
        broadcast_manager.onPositionsUpdate(json);
    });

    connector_bridge.setConnectionCallback([](
        const std::string& json)
    {
        broadcast_manager.onConnectionUpdate(json);
    });

    connector_bridge.setDailyOpenCallback([](
        const std::string& detected,
        double open_price)
    {
        std::string base = symbol_cache.getBaseSymbol(detected);
        symbol_cache.storeDailyOpen(base, open_price);
    });

    // ── Wire symbol detected — Thread 2 fires after auto detect ──
    connector_bridge.setSymbolDetectedCallback([](
        const std::string& symbol,
        const std::string& timeframe,
        const std::string& detected)
    {
        symbol_cache.storeDetected(symbol, detected);
        chart_manager.setChartState(symbol, timeframe, detected);
        broadcast_manager.setActiveChart(symbol, timeframe);

        std::cout << "Symbol detected: "
                  << symbol << " → " << detected
                  << std::endl;
    });

    // ── Wire symbol not found ──
    connector_bridge.setSymbolNotFoundCallback([](
        const std::string& symbol)
    {
        ws_server.broadcastToAll(
            "{\"type\":\"error\","
            "\"message\":\"Symbol not found: "
            + symbol + "\"}"
        );
    });

    // ── Wire trade handler ──
    trade_handler.setExecuteTradeCallback([](
        const std::string& symbol,
        const std::string& direction,
        double volume, double price,
        double sl, double tp,
        std::function<void(TradeResult)> callback)
    {
        connector_bridge.requestTrade(
            symbol, direction, volume, price, tp, sl, callback
        );
    });

    trade_handler.setClosePositionCallback([](
        int64_t ticket,
        std::function<void(TradeResult)> callback)
    {
        connector_bridge.requestClose(ticket, callback);
    });

    trade_handler.setCloseAllCallback([](
        std::function<void(TradeResult)> callback)
    {
        connector_bridge.requestCloseAll(callback);
    });

    trade_handler.setModifyPositionCallback([](
        int64_t ticket, double sl, double tp,
        std::function<void(TradeResult)> callback)
    {
        connector_bridge.requestModify(ticket, sl, tp, callback);
    });

    // ── Wire reconnect ──
    broadcast_manager.setReconnectCallback([]() {
        auto state = chart_manager.getReconnectionState();
        if (!state) return;

        std::cout << "Reconnect: clearing all caches..." << std::endl;

        symbol_cache.clearAll();

        std::string detected =
            connector_bridge.autoDetectSymbol(state->symbol);
        if (detected.empty()) return;

        chart_manager.setChartState(
            state->symbol, state->timeframe, detected
        );

        connector_bridge.addActiveSymbol(detected);
        connector_bridge.setActiveSymbols({ detected });

        symbol_cache.storeDetected(state->symbol, detected);

        connector_bridge.requestHistory(
            state->symbol, detected,
            state->timeframe,
            Config::CANDLE_FETCH_COUNT
        );
    });

    // ── Wire history result ──
    connector_bridge.setHistoryCallback([](
        const std::string& symbol,
        const std::string& timeframe,
        const CandleBuffer& candles)
    {
        if (candles.empty()) return;

        std::string detected = symbol_cache.getDetected(symbol);

        symbol_cache.storeCandles(
            symbol, detected, timeframe, candles
        );

        chart_manager.markChartReady();

        std::string json = "{\"type\":\"initial\",";
        json += "\"symbol\":\""    + symbol    + "\",";
        json += "\"timeframe\":\"" + timeframe + "\",";
        json += "\"data\":[";

        bool first = true;
        for (const auto& c : candles) {
            if (!first) json += ",";
            json += "{";
            json += "\"time\":"   + std::to_string(c.time)   + ",";
            json += "\"open\":"   + std::to_string(c.open)   + ",";
            json += "\"high\":"   + std::to_string(c.high)   + ",";
            json += "\"low\":"    + std::to_string(c.low)    + ",";
            json += "\"close\":"  + std::to_string(c.close)  + ",";
            json += "\"volume\":" + std::to_string(c.volume);
            json += "}";
            first = false;
        }

        json += "],\"count\":"
             + std::to_string(candles.size()) + "}";

        ws_server.broadcastToAll(json);
        std::cout << "Fetched and sent " << candles.size()
                  << " candles: "
                  << symbol << " " << timeframe << std::endl;

        symbol_cache.printActiveSymbols(
            broadcast_manager.getWatchlist()
        );
    });

    // ── Wire message handler callbacks ──
    message_handler.setPositionsCallback([]() {});
    message_handler.setAccountCallback([]() {});
    message_handler.setPriceCallback([]() {});

    message_handler.setConnectionCallback([]() {
        std::string conn = connector_bridge.checkConnection();
        ws_server.broadcastToAll(conn);
    });

    message_handler.setAutoTradingCallback([](bool enabled) {
        std::cout << "Auto trading: "
                  << (enabled ? "ON" : "OFF") << std::endl;
    });

    // ── Release GIL before starting event loop ──
    {
        py::gil_scoped_release release;
        ws_server.start();
    }

    return 0;
}
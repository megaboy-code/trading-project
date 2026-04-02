// ================================================================
// CONNECTOR_BRIDGE.HPP - Python MT5 Bridge
// Three-thread push architecture:
//   Thread 1 — on_tick       → price stream (bid/ask)
//              on_bar_update → live M1 OHLC numpy zero-copy
//   Thread 2 — on_history_result  → history numpy zero-copy
//              on_daily_open      → D1 open price
//              on_symbol_detected → detected symbol fired back to C++
//   Thread 3 — on_positions_update  → positions + account
//              on_connection_update → connection status
// GIL released after Python data extracted — C++ runs free
// ================================================================

#pragma once
#include <string>
#include <vector>
#include <functional>
#include <iostream>
#include <mutex>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>
#include "candle.hpp"
#include "trade_handler.hpp"

namespace py = pybind11;

// ── Callback types ──
using TickCallback       = std::function<void(
                               const std::string& symbol,
                               double bid, double ask,
                               int64_t time_msc)>;

using BarUpdateCallback  = std::function<void(
                               const std::string& symbol,
                               const CandleBuffer& candles)>;

using HistoryCallback    = std::function<void(
                               const std::string& symbol,
                               const std::string& timeframe,
                               const CandleBuffer& candles)>;

using BridgePositionsCallback  = std::function<void(
                               const std::string& json)>;

using BridgeConnectionCallback = std::function<void(
                               const std::string& json)>;

using DailyOpenCallback  = std::function<void(
                               const std::string& detected,
                               double open_price)>;

using SymbolDetectedCallback = std::function<void(
                               const std::string& symbol,
                               const std::string& timeframe,
                               const std::string& detected)>;

using SymbolNotFoundCallback = std::function<void(
                               const std::string& symbol)>;

using TradeResultCallback = std::function<void(
                               const TradeResult& result)>;

class ConnectorBridge {
private:
    py::object connector;
    bool       initialized = false;
    std::mutex mtx;

    // ── C++ side callbacks ──
    TickCallback              tick_cb;
    BarUpdateCallback         bar_update_cb;
    HistoryCallback           history_cb;
    BridgePositionsCallback   positions_cb;
    BridgeConnectionCallback  connection_cb;
    DailyOpenCallback         daily_open_cb;
    SymbolDetectedCallback    symbol_detected_cb;
    SymbolNotFoundCallback    symbol_not_found_cb;

    std::string dbl(double v) const {
        return std::to_string(v);
    }

    std::string optDbl(py::object val) const {
        try {
            if (val.is_none()) return "null";
            double v = val.cast<double>();
            if (v == 0.0) return "null";
            return std::to_string(v);
        } catch (...) { return "null"; }
    }

    // ================================================================
    // RATES ARRAY TO BUFFER
    // ================================================================
    CandleBuffer ratesArrayToBuffer(py::array rates_array) {
        CandleBuffer buffer;
        if (rates_array.is_none()) return buffer;

        try {
            size_t count = rates_array.shape(0);
            if (count == 0) return buffer;

            for (size_t i = 0; i < count; i++) {
                py::object row =
                    rates_array.attr("__getitem__")(i);
                Candle c;
                c.time   = row.attr("__getitem__")("time")
                              .cast<int64_t>();
                c.open   = row.attr("__getitem__")("open")
                              .cast<double>();
                c.high   = row.attr("__getitem__")("high")
                              .cast<double>();
                c.low    = row.attr("__getitem__")("low")
                              .cast<double>();
                c.close  = row.attr("__getitem__")("close")
                              .cast<double>();
                c.volume = row.attr("__getitem__")("tick_volume")
                              .cast<int64_t>();
                buffer.push_back(c);
            }

        } catch (const py::error_already_set& e) {
            std::cerr << "ratesArrayToBuffer error: "
                      << e.what() << std::endl;
        } catch (...) {
            std::cerr << "ratesArrayToBuffer unknown error"
                      << std::endl;
        }

        return buffer;
    }

    // ================================================================
    // BUILD POSITIONS + ACCOUNT JSON
    // ================================================================
    std::string buildPositionsJSON(
        py::list   positions,
        py::object account)
    {
        std::string json =
            "{\"type\":\"positions_update\","
            "\"positions\":[";
        bool first = true;

        for (auto& item : positions) {
            if (!first) json += ",";
            py::dict p = item.cast<py::dict>();

            int type_int = p["type"].cast<int>();

            json += "{";
            json += "\"ticket\":"        + std::to_string(
                        p["ticket"].cast<int64_t>())        + ",";
            json += "\"symbol\":\""      +
                        p["symbol"].cast<std::string>()     + "\",";
            json += "\"type\":\""        +
                        std::string(type_int == 0
                            ? "BUY" : "SELL")               + "\",";
            json += "\"volume\":"        + dbl(
                        p["volume"].cast<double>())          + ",";
            json += "\"open_price\":"    + dbl(
                        p["open_price"].cast<double>())      + ",";
            json += "\"current_price\":" + dbl(
                        p["current_price"].cast<double>())   + ",";
            json += "\"sl\":"            + optDbl(p["sl"])   + ",";
            json += "\"tp\":"            + optDbl(p["tp"])   + ",";
            json += "\"profit\":"        + dbl(
                        p["profit"].cast<double>())          + ",";
            json += "\"swap\":"          + dbl(
                        p["swap"].cast<double>())            + ",";
            json += "\"commission\":"    + dbl(
                        p["commission"].cast<double>())      + ",";
            json += "\"open_time\":"     + std::to_string(
                        p["open_time"].cast<int64_t>());
            json += "}";
            first = false;
        }

        json += "]";

        if (!account.is_none()) {
            py::dict a = account.cast<py::dict>();
            json += ",\"account\":{";
            json += "\"balance\":"      + dbl(
                        a["balance"].cast<double>())      + ",";
            json += "\"equity\":"       + dbl(
                        a["equity"].cast<double>())       + ",";
            json += "\"margin\":"       + dbl(
                        a["margin"].cast<double>())       + ",";
            json += "\"free_margin\":"  + dbl(
                        a["free_margin"].cast<double>())  + ",";
            json += "\"margin_level\":" + dbl(
                        a["margin_level"].cast<double>()) + ",";
            json += "\"leverage\":"     + std::to_string(
                        a["leverage"].cast<int>());
            json += "}";
        } else {
            json += ",\"account\":null";
        }

        json += "}";
        return json;
    }

    // ================================================================
    // BUILD CONNECTION JSON
    // ================================================================
    std::string buildConnectionJSON(py::dict status) {
        bool        connected =
            status["mt5_connected"].cast<bool>();
        std::string text      =
            status["status_text"].cast<std::string>();
        return "{\"type\":\"connection_status\","
               "\"data\":{\"mt5_connected\":"
               + std::string(connected ? "true" : "false")
               + ",\"status_text\":\"" + text + "\"}}";
    }

public:

    // ================================================================
    // INITIALIZE
    // ================================================================
    bool initialize() {
        try {
            py::gil_scoped_acquire gil;
            py::module_ sys = py::module_::import("sys");
            sys.attr("path").attr("append")(
                "C:/Users/mega/mega_env/BACKEND"
            );
            connector   = py::module_::import("connector")
                              .attr("connector");
            initialized = true;
            std::cout << "ConnectorBridge initialized"
                      << std::endl;
            return true;
        } catch (const py::error_already_set& e) {
            std::cerr << "ConnectorBridge init error: "
                      << e.what() << std::endl;
            return false;
        }
    }

    // ================================================================
    // CONNECT + START THREADS + WIRE CALLBACKS
    // ================================================================
    bool connect() {
        if (!initialized) return false;
        try {
            py::gil_scoped_acquire gil;

            bool ok =
                connector.attr("connect")().cast<bool>();
            if (!ok) return false;

            // ── Wire on_tick ──
            connector.attr("on_tick") = py::cpp_function(
                [this](
                    std::string symbol,
                    py::object  tick)
                {
                    try {
                        double  bid      =
                            tick.attr("bid").cast<double>();
                        double  ask      =
                            tick.attr("ask").cast<double>();
                        int64_t time_msc =
                            tick.attr("time_msc")
                                .cast<int64_t>();
                        py::gil_scoped_release release;
                        if (tick_cb)
                            tick_cb(symbol, bid, ask, time_msc);
                    } catch (...) {}
                }
            );

            // ── Wire on_bar_update ──
            connector.attr("on_bar_update") = py::cpp_function(
                [this](
                    std::string symbol,
                    py::object  rates)
                {
                    try {
                        if (rates.is_none()) return;
                        CandleBuffer candles =
                            ratesArrayToBuffer(
                                rates.cast<py::array>()
                            );
                        py::gil_scoped_release release;
                        if (!candles.empty() && bar_update_cb)
                            bar_update_cb(symbol, candles);
                    } catch (...) {}
                }
            );

            // ── Wire on_history_result ──
            connector.attr("on_history_result") =
                py::cpp_function(
                [this](
                    std::string symbol,
                    std::string timeframe,
                    py::object  rates)
                {
                    try {
                        if (rates.is_none()) return;
                        CandleBuffer candles =
                            ratesArrayToBuffer(
                                rates.cast<py::array>()
                            );
                        py::gil_scoped_release release;
                        if (!candles.empty() && history_cb)
                            history_cb(
                                symbol, timeframe, candles
                            );
                    } catch (...) {}
                }
            );

            // ── Wire on_symbol_detected ──
            // Fires from Thread 2 after auto_detect_symbol
            connector.attr("on_symbol_detected") =
                py::cpp_function(
                [this](
                    std::string symbol,
                    std::string timeframe,
                    py::object  detected_obj)
                {
                    try {
                        if (detected_obj.is_none()) {
                            py::gil_scoped_release release;
                            if (symbol_not_found_cb)
                                symbol_not_found_cb(symbol);
                            return;
                        }
                        std::string detected =
                            detected_obj.cast<std::string>();
                        py::gil_scoped_release release;
                        if (symbol_detected_cb)
                            symbol_detected_cb(
                                symbol, timeframe, detected
                            );
                    } catch (...) {}
                }
            );

            // ── Wire on_positions_update ──
            connector.attr("on_positions_update") =
                py::cpp_function(
                [this](
                    py::object positions,
                    py::object account)
                {
                    try {
                        py::list pos_list =
                            positions.cast<py::list>();
                        std::string json =
                            buildPositionsJSON(
                                pos_list, account
                            );
                        py::gil_scoped_release release;
                        if (positions_cb)
                            positions_cb(json);
                    } catch (...) {}
                }
            );

            // ── Wire on_connection_update ──
            connector.attr("on_connection_update") =
                py::cpp_function(
                [this](py::object status) {
                    try {
                        py::dict d =
                            status.cast<py::dict>();
                        std::string json =
                            buildConnectionJSON(d);
                        py::gil_scoped_release release;
                        if (connection_cb)
                            connection_cb(json);
                    } catch (...) {}
                }
            );

            // ── Wire on_daily_open ──
            connector.attr("on_daily_open") =
                py::cpp_function(
                [this](
                    std::string detected,
                    double      open_price)
                {
                    try {
                        py::gil_scoped_release release;
                        if (daily_open_cb)
                            daily_open_cb(
                                detected, open_price
                            );
                    } catch (...) {}
                }
            );

            // ── Start all three threads ──
            connector.attr("start_threads")();

            std::cout << "MT5 connected — all threads started"
                      << std::endl;
            return true;

        } catch (const py::error_already_set& e) {
            std::cerr << "connect error: "
                      << e.what() << std::endl;
            return false;
        }
    }

    // ================================================================
    // CALLBACK SETTERS
    // ================================================================
    void setTickCallback(TickCallback cb)                          { tick_cb             = cb; }
    void setBarUpdateCallback(BarUpdateCallback cb)                { bar_update_cb       = cb; }
    void setHistoryCallback(HistoryCallback cb)                    { history_cb          = cb; }
    void setPositionsCallback(BridgePositionsCallback cb)          { positions_cb        = cb; }
    void setConnectionCallback(BridgeConnectionCallback cb)        { connection_cb       = cb; }
    void setDailyOpenCallback(DailyOpenCallback cb)                { daily_open_cb       = cb; }
    void setSymbolDetectedCallback(SymbolDetectedCallback cb)      { symbol_detected_cb  = cb; }
    void setSymbolNotFoundCallback(SymbolNotFoundCallback cb)      { symbol_not_found_cb = cb; }

    // ================================================================
    // ACTIVE SYMBOLS
    // ================================================================
    void addActiveSymbol(const std::string& detected) {
        if (!initialized || detected.empty()) return;
        try {
            py::gil_scoped_acquire gil;
            connector.attr("add_active_symbol")(detected);
        } catch (...) {}
    }

    void removeActiveSymbol(const std::string& detected) {
        if (!initialized || detected.empty()) return;
        try {
            py::gil_scoped_acquire gil;
            connector.attr("remove_active_symbol")(detected);
        } catch (...) {}
    }

    void setActiveSymbols(
        const std::vector<std::string>& detected_symbols)
    {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;
            py::list sym_list;
            for (const auto& s : detected_symbols)
                sym_list.append(s);
            connector.attr("set_active_symbols")(sym_list);
        } catch (...) {}
    }

    // ================================================================
    // REQUEST DETECT AND FETCH — async Thread 2 queue
    // Replaces autoDetectSymbol from detached thread
    // No Python touched in calling thread
    // ================================================================
    void requestDetectAndFetch(
        const std::string& symbol,
        const std::string& timeframe,
        int count = 0)
    {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;
            connector.attr("request_detect_and_fetch")(
                symbol,
                timeframe,
                count > 0
                    ? py::cast(count)
                    : py::none()
            );
        } catch (...) {}
    }

    // ================================================================
    // REQUEST HISTORY — async Thread 2 queue
    // ================================================================
    void requestHistory(
        const std::string& symbol,
        const std::string& detected,
        const std::string& timeframe,
        int count = 0)
    {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;
            connector.attr("request_history")(
                symbol, detected, timeframe,
                count > 0
                    ? py::cast(count)
                    : py::none()
            );
        } catch (...) {}
    }

    // ================================================================
    // REQUEST DAILY OPEN — async Thread 2 queue
    // ================================================================
    void requestDailyOpen(const std::string& detected) {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;
            connector.attr("request_daily_open")(detected);
        } catch (...) {}
    }

    // ================================================================
    // TRADE COMMANDS — async Thread 2 queue
    // ================================================================
    void requestTrade(
        const std::string& symbol,
        const std::string& direction,
        double volume, double price,
        double tp, double sl,
        std::function<void(TradeResult)> callback = nullptr)
    {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;

            py::object cb = py::none();
            if (callback) {
                cb = py::cpp_function(
                    [callback](py::dict result) {
                        TradeResult r;
                        r.success =
                            result["success"].cast<bool>();
                        if (r.success) {
                            r.direction =
                                result["direction"]
                                    .cast<std::string>();
                            r.symbol =
                                result["symbol"]
                                    .cast<std::string>();
                            r.volume =
                                result["volume"]
                                    .cast<double>();
                            r.price =
                                result["price"]
                                    .cast<double>();
                            r.ticket =
                                result["ticket"]
                                    .cast<int64_t>();
                            r.timestamp =
                                result["timestamp"]
                                    .cast<int64_t>();
                            r.message =
                                result["message"]
                                    .cast<std::string>();
                        } else {
                            r.error =
                                result["error"]
                                    .cast<std::string>();
                        }
                        callback(r);
                    }
                );
            }

            connector.attr("request_trade")(
                symbol, direction, volume, price,
                tp > 0 ? py::cast(tp) : py::none(),
                sl > 0 ? py::cast(sl) : py::none(),
                cb
            );

        } catch (...) {}
    }

    void requestClose(
        int64_t ticket,
        std::function<void(TradeResult)> callback = nullptr)
    {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;

            py::object cb = py::none();
            if (callback) {
                cb = py::cpp_function(
                    [callback](py::dict result) {
                        TradeResult r;
                        r.success =
                            result["success"].cast<bool>();
                        r.message = r.success
                            ? result["message"]
                                  .cast<std::string>()
                            : result["error"]
                                  .cast<std::string>();
                        callback(r);
                    }
                );
            }

            connector.attr("request_close")(ticket, cb);

        } catch (...) {}
    }

    void requestCloseAll(
        std::function<void(TradeResult)> callback = nullptr)
    {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;

            py::object cb = py::none();
            if (callback) {
                cb = py::cpp_function(
                    [callback](py::dict result) {
                        TradeResult r;
                        r.success =
                            result["success"].cast<bool>();
                        r.message =
                            result["message"]
                                .cast<std::string>();
                        callback(r);
                    }
                );
            }

            connector.attr("request_close_all")(cb);

        } catch (...) {}
    }

    void requestModify(
        int64_t ticket, double sl, double tp,
        std::function<void(TradeResult)> callback = nullptr)
    {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;

            py::object cb = py::none();
            if (callback) {
                cb = py::cpp_function(
                    [callback](py::dict result) {
                        TradeResult r;
                        r.success =
                            result["success"].cast<bool>();
                        r.message = r.success
                            ? result["message"]
                                  .cast<std::string>()
                            : result["error"]
                                  .cast<std::string>();
                        callback(r);
                    }
                );
            }

            connector.attr("request_modify")(
                ticket,
                sl > 0 ? py::cast(sl) : py::none(),
                tp > 0 ? py::cast(tp) : py::none(),
                cb
            );

        } catch (...) {}
    }

    // ================================================================
    // AUTO DETECT SYMBOL — synchronous (keep for reconnect only)
    // ================================================================
    std::string autoDetectSymbol(const std::string& symbol) {
        if (!initialized) return "";
        try {
            py::gil_scoped_acquire gil;
            py::object result =
                connector.attr("auto_detect_symbol")(symbol);
            if (result.is_none()) return "";
            return result.cast<std::string>();
        } catch (...) { return ""; }
    }

    // ================================================================
    // CHECK CONNECTION — synchronous on demand
    // ================================================================
    std::string checkConnection() {
        if (!initialized) {
            return "{\"type\":\"connection_status\","
                   "\"data\":{\"mt5_connected\":false,"
                   "\"status_text\":\"Bridge not initialized\"}}";
        }
        try {
            py::gil_scoped_acquire gil;
            py::dict d =
                connector.attr("check_mt5_connection")()
                    .cast<py::dict>();
            return buildConnectionJSON(d);
        } catch (...) {
            return "{\"type\":\"connection_status\","
                   "\"data\":{\"mt5_connected\":false,"
                   "\"status_text\":\"Error\"}}";
        }
    }

    // ================================================================
    // STOP
    // ================================================================
    void stop() {
        if (!initialized) return;
        try {
            py::gil_scoped_acquire gil;
            connector.attr("stop_threads")();
            connector.attr("disconnect")();
        } catch (...) {}
    }

    bool isInitialized() const { return initialized; }
};

inline ConnectorBridge connector_bridge;
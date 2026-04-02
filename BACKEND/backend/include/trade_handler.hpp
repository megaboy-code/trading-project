// ================================================================
// TRADE_HANDLER.HPP - Trade Execution & Position Management
// Async callbacks — all trades go through Thread 2 queue
// ================================================================

#pragma once
#include <string>
#include <functional>
#include <sstream>
#include <vector>
#include <iostream>
#include "candle.hpp"

// ── Trade result ──
struct TradeResult {
    bool        success     = false;
    std::string direction;
    std::string symbol;
    double      volume      = 0.0;
    double      price       = 0.0;
    double      tp          = 0.0;
    double      sl          = 0.0;
    int64_t     ticket      = 0;
    int64_t     timestamp   = 0;
    std::string message;
    std::string error;
};

// ── Callback types ──
using ExecuteTradeCallback = std::function<void(
    const std::string& symbol,
    const std::string& direction,
    double volume, double price,
    double sl, double tp,
    std::function<void(TradeResult)> callback)>;

using ClosePositionCallback = std::function<void(
    int64_t ticket,
    std::function<void(TradeResult)> callback)>;

using CloseAllCallback = std::function<void(
    std::function<void(TradeResult)> callback)>;

using ModifyPositionCallback = std::function<void(
    int64_t ticket, double sl, double tp,
    std::function<void(TradeResult)> callback)>;

class TradeHandler {
private:
    ExecuteTradeCallback    execute_trade_cb;
    ClosePositionCallback   close_position_cb;
    CloseAllCallback        close_all_cb;
    ModifyPositionCallback  modify_position_cb;

    // ── Split string helper ──
    std::vector<std::string> split(
        const std::string& str,
        char delimiter) const
    {
        std::vector<std::string> parts;
        std::stringstream ss(str);
        std::string token;
        while (std::getline(ss, token, delimiter)) {
            parts.push_back(token);
        }
        return parts;
    }

    // ── Parse optional double ──
    double parseOptional(const std::string& val) const {
        if (val.empty() || val == "0" || val == "None") return 0.0;
        try { return std::stod(val); }
        catch (...) { return 0.0; }
    }

    // ── Build trade response JSON ──
    static std::string buildTradeResponse(const TradeResult& r) {
        std::string json = "{";
        json += "\"type\":\"trade_executed\",";
        json += "\"success\":" + std::string(r.success ? "true" : "false") + ",";
        if (r.success) {
            json += "\"direction\":\"" + r.direction  + "\",";
            json += "\"symbol\":\""    + r.symbol     + "\",";
            json += "\"volume\":"      + std::to_string(r.volume)    + ",";
            json += "\"price\":"       + std::to_string(r.price)     + ",";
            json += "\"ticket\":"      + std::to_string(r.ticket)    + ",";
            json += "\"timestamp\":"   + std::to_string(r.timestamp) + ",";
            json += "\"message\":\""   + r.message + "\"";
        } else {
            json += "\"message\":\"" + r.error + "\"";
        }
        json += "}";
        return json;
    }

    // ── Build error JSON ──
    static std::string buildError(const std::string& msg) {
        return "{\"type\":\"error\",\"message\":\"" + msg + "\"}";
    }

public:

    // ── Set callbacks ──
    void setExecuteTradeCallback(ExecuteTradeCallback cb)     { execute_trade_cb   = cb; }
    void setClosePositionCallback(ClosePositionCallback cb)   { close_position_cb  = cb; }
    void setCloseAllCallback(CloseAllCallback cb)             { close_all_cb       = cb; }
    void setModifyPositionCallback(ModifyPositionCallback cb) { modify_position_cb = cb; }

    // ================================================================
    // HANDLE TRADE COMMAND
    // Format: TRADE_BUY_EURUSD_0.01_1.0850_sl_tp
    // ================================================================
    void handleTradeCommand(
        const std::string& message,
        std::function<void(const std::string&)> send_cb)
    {
        auto parts = split(message, '_');
        if (parts.size() < 5) {
            send_cb(buildError(
                "Invalid format. Use: TRADE_BUY_EURUSD_0.01_1.0850"
            ));
            return;
        }
        try {
            std::string direction = parts[1];
            std::string symbol    = parts[2];
            double      volume    = std::stod(parts[3]);
            double      price     = std::stod(parts[4]);
            double      sl = parts.size() > 5 ? parseOptional(parts[5]) : 0.0;
            double      tp = parts.size() > 6 ? parseOptional(parts[6]) : 0.0;

            if (!execute_trade_cb) {
                send_cb(buildError("Trade executor not configured"));
                return;
            }

            std::cout << "Trade: " << direction
                      << " " << symbol
                      << " " << volume
                      << " @ " << price
                      << " SL:" << sl
                      << " TP:" << tp << std::endl;

            execute_trade_cb(
                symbol, direction, volume, price, sl, tp,
                [send_cb](TradeResult r) {
                    send_cb(buildTradeResponse(r));
                }
            );

        } catch (const std::exception& e) {
            send_cb(buildError(
                std::string("Parse error: ") + e.what()
            ));
        }
    }

    // ================================================================
    // HANDLE CLOSE POSITION
    // Format: CLOSE_POSITION_123456
    // ================================================================
    void handleClosePosition(
        const std::string& message,
        std::function<void(const std::string&)> send_cb)
    {
        auto parts = split(message, '_');
        if (parts.size() < 3) {
            send_cb(buildError(
                "Invalid format. Use: CLOSE_POSITION_ticket"
            ));
            return;
        }
        try {
            int64_t ticket = std::stoll(parts[2]);

            if (!close_position_cb) {
                send_cb(buildError("Close callback not configured"));
                return;
            }

            std::cout << "Close position: " << ticket << std::endl;

            close_position_cb(ticket, [send_cb](TradeResult r) {
                send_cb(
                    "{\"type\":\"position_closed\","
                    "\"success\":" +
                    std::string(r.success ? "true" : "false") + ","
                    "\"message\":\"" +
                    (r.success ? r.message : r.error) + "\"}"
                );
            });

        } catch (const std::exception& e) {
            send_cb(buildError(
                std::string("Parse error: ") + e.what()
            ));
        }
    }

    // ================================================================
    // HANDLE CLOSE ALL
    // ================================================================
    void handleCloseAll(
        std::function<void(const std::string&)> send_cb)
    {
        if (!close_all_cb) {
            send_cb(buildError("Close all callback not configured"));
            return;
        }

        std::cout << "Close all positions" << std::endl;

        close_all_cb([send_cb](TradeResult r) {
            send_cb(
                "{\"type\":\"positions_closed\","
                "\"success\":" +
                std::string(r.success ? "true" : "false") + ","
                "\"message\":\"" + r.message + "\"}"
            );
        });
    }

    // ================================================================
    // HANDLE MODIFY POSITION
    // Format: MODIFY_POSITION_ticket_sl_tp
    // ================================================================
    void handleModifyPosition(
        const std::string& message,
        std::function<void(const std::string&)> send_cb)
    {
        auto parts = split(message, '_');
        if (parts.size() < 5) {
            send_cb(buildError(
                "Invalid format. Use: MODIFY_POSITION_ticket_sl_tp"
            ));
            return;
        }
        try {
            int64_t ticket = std::stoll(parts[2]);
            double  sl     = parseOptional(parts[3]);
            double  tp     = parseOptional(parts[4]);

            if (!modify_position_cb) {
                send_cb(buildError("Modify callback not configured"));
                return;
            }

            std::cout << "Modify: " << ticket
                      << " SL:" << sl
                      << " TP:" << tp << std::endl;

            modify_position_cb(ticket, sl, tp, [send_cb](TradeResult r) {
                send_cb(
                    "{\"type\":\"position_modified\","
                    "\"success\":" +
                    std::string(r.success ? "true" : "false") + ","
                    "\"message\":\"" +
                    (r.success ? r.message : r.error) + "\"}"
                );
            });

        } catch (const std::exception& e) {
            send_cb(buildError(
                std::string("Parse error: ") + e.what()
            ));
        }
    }
};

// ── Global instance ──
inline TradeHandler trade_handler;
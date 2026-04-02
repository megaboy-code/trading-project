// ================================================================
// CANDLE.HPP - Core Data Structures
// ================================================================

#pragma once
#include <deque>
#include <vector>
#include <cstdint>
#include <algorithm>

// ── Candle structure ──
struct Candle {
    int64_t time   = 0;
    double  open   = 0.0;
    double  high   = 0.0;
    double  low    = 0.0;
    double  close  = 0.0;
    int64_t volume = 0;

    double mid() const {
        return (high + low) / 2.0;
    }

    double range() const {
        return high - low;
    }

    bool isBull() const {
        return close >= open;
    }

    bool isBear() const {
        return close < open;
    }

    double body() const {
        return std::abs(close - open);
    }
};

// ── Candle buffer ──
using CandleBuffer = std::deque<Candle>;

// ── Tick data structure ──
struct TickData {
    int64_t time   = 0;
    double  bid    = 0.0;
    double  ask    = 0.0;
    int64_t volume = 0;
};

// ── Tick buffer ──
using TickBuffer = std::vector<TickData>;
// ================================================================
// MEGAFLOWZ_DECODER.TS - FlatBuffers Binary Decoder
// Wraps auto-generated flatc output into clean typed interface
// Zero copy — reads directly from buffer, no allocation
// Import path assumes flatc output in same directory
// ================================================================

import { ByteBuffer }        from 'flatbuffers';
import {
    Message,
    MessagePayload,
    InitialData,
    BarUpdate,
    PriceUpdate,
    WatchlistUpdate,
    PositionsUpdate,
    Position,
    Account,
    ConnectionStatus,
    TradeExecuted,
    PositionModified,
    ErrorMsg,
    AutoTradingStatus,
    CacheCleared,
    Notification,
    JournalData,
    JournalTrade,
    AvailableConfig,
    AvailableSymbol,
    AvailableItem,
    NotificationType,
    Severity,
    Timeframe,
    PositionType,
    IndicatorUpdate,
    IndicatorLine
} from './mega-flowz';

// ================================================================
// TYPED PAYLOADS — what ConnectionManager receives
// ================================================================

export interface CandleData {
    time:   number;
    open:   number;
    high:   number;
    low:    number;
    close:  number;
    volume: number;
}

export interface InitialPayload {
    symbol:    string;
    timeframe: string;
    candles:   CandleData[];
}

export interface BarUpdatePayload {
    symbol:    string;
    timeframe: string;
    candle:    CandleData;
}

export interface PriceUpdatePayload {
    symbol: string;
    bid:    number;
    ask:    number;
    spread: number;
    time:   number;
}

export interface WatchlistUpdatePayload {
    symbol: string;
    bid:    number;
    ask:    number;
    spread: number;
    time:   number;
    change: number;
}

export interface PositionData {
    ticket:        number;
    symbol:        string;
    type:          'BUY' | 'SELL';
    volume:        number;
    open_price:    number;
    current_price: number;
    sl:            number;
    tp:            number;
    profit:        number;
    swap:          number;
    commission:    number;
    open_time:     number;
}

export interface AccountData {
    balance:      number;
    equity:       number;
    margin:       number;
    free_margin:  number;
    margin_level: number;
    leverage:     number;
}

export interface PositionsUpdatePayload {
    positions: PositionData[];
    account:   AccountData | null;
}

export interface ConnectionStatusPayload {
    connected:   boolean;
    status_text: string;
}

export interface TradeExecutedPayload {
    success:   boolean;
    direction: 'BUY' | 'SELL';
    symbol:    string;
    volume:    number;
    price:     number;
    ticket:    number;
    timestamp: number;
    message:   string;
}

export interface PositionModifiedPayload {
    success: boolean;
    ticket:  number;
    message: string;
}

export interface NotificationPayload {
    nType:      NotificationType;
    severity:   Severity;
    title:      string;
    message:    string;
    symbol:     string;
    direction:  'BUY' | 'SELL';
    volume:     number;
    price:      number;
    open_price: number;
    profit:     number;
    ticket:     number;
    timestamp:  number;
}

export interface ErrorPayload {
    message: string;
}

export interface AutoTradingPayload {
    enabled: boolean;
    message: string;
}

export interface CacheClearedPayload {
    message: string;
}

export interface PongPayload {
    message: string;
}

export interface JournalTradeData {
    ticket:      number;
    symbol:      string;
    type:        'BUY' | 'SELL';
    volume:      number;
    open_price:  number;
    close_price: number;
    profit:      number;
    swap:        number;
    commission:  number;
    open_time:   number;
    close_time:  number;
}

export interface JournalDataPayload {
    trades: JournalTradeData[];
    scope:  string;
}

export interface AvailableSymbolData {
    name:        string;
    description: string;
}

export interface AvailableItemData {
    key:           string;
    label:         string;
    description:   string;
    badge:         string;
    type:          string;
    is_strategy:   boolean;
    period:        number;
    fast_period:   number;
    slow_period:   number;
    signal_period: number;
    k_period:      number;
    d_period:      number;
    slowing:       number;
    deviation:     number;
    overbought:    number;
    oversold:      number;
    volume:        number;
    price_type:    string;
    symbol:        string;
    timeframe:     string;
}

export interface AvailableConfigPayload {
    symbols:            AvailableSymbolData[];
    timeframes_visible: string[];
    timeframes_more:    string[];
    indicators:         AvailableItemData[];
    strategies:         AvailableItemData[];
    patterns:           AvailableItemData[];
}

export interface IndicatorLineData {
    name:       string;
    timestamps: number[];
    values:     number[];
}

export interface IndicatorUpdatePayload {
    key:       string;
    label:     string;
    symbol:    string;
    timeframe: string;
    lines:     IndicatorLineData[];
}

// ================================================================
// DISCRIMINATED UNION — single return type
// ================================================================

export type DecodedMessage =
    | { type: 'initial';           data: InitialPayload          }
    | { type: 'bar_update';        data: BarUpdatePayload        }
    | { type: 'price_update';      data: PriceUpdatePayload      }
    | { type: 'watchlist_update';  data: WatchlistUpdatePayload  }
    | { type: 'positions_update';  data: PositionsUpdatePayload  }
    | { type: 'connection_status'; data: ConnectionStatusPayload }
    | { type: 'trade_executed';    data: TradeExecutedPayload    }
    | { type: 'position_modified'; data: PositionModifiedPayload }
    | { type: 'notification';      data: NotificationPayload     }
    | { type: 'error';             data: ErrorPayload            }
    | { type: 'auto_trading';      data: AutoTradingPayload      }
    | { type: 'cache_cleared';     data: CacheClearedPayload     }
    | { type: 'pong';              data: PongPayload             }
    | { type: 'journal_data';      data: JournalDataPayload      }
    | { type: 'available_config';  data: AvailableConfigPayload  }
    | { type: 'indicator_update';  data: IndicatorUpdatePayload  }
    | { type: 'unknown' };

// ================================================================
// TIMEFRAME ENUM → STRING
// ================================================================

function tfToString(tf: Timeframe): string {
    switch (tf) {
        case Timeframe.M1:  return 'M1';
        case Timeframe.M5:  return 'M5';
        case Timeframe.M15: return 'M15';
        case Timeframe.H1:  return 'H1';
        case Timeframe.H4:  return 'H4';
        case Timeframe.D1:  return 'D1';
        default:            return 'M1';
    }
}

// ================================================================
// POSITION TYPE ENUM → STRING
// ================================================================

function posTypeToString(t: PositionType): 'BUY' | 'SELL' {
    return t === PositionType.Buy ? 'BUY' : 'SELL';
}

// ================================================================
// CANDLE EXTRACTOR
// ================================================================

function extractCandle(c: any): CandleData {
    return {
        time:   parseInt(c.time().toString(), 10),
        open:   c.open(),
        high:   c.high(),
        low:    c.low(),
        close:  c.close(),
        volume: parseInt(c.volume().toString(), 10)
    };
}

// ================================================================
// AVAILABLE ITEM EXTRACTOR — all params including symbol + timeframe
// ================================================================

function extractAvailableItem(item: AvailableItem): AvailableItemData {
    return {
        key:           item.key()         ?? '',
        label:         item.label()       ?? '',
        description:   item.description() ?? '',
        badge:         item.badge()       ?? '',
        type:          item.type()        ?? '',
        is_strategy:   item.isStrategy(),
        period:        item.period(),
        fast_period:   item.fastPeriod(),
        slow_period:   item.slowPeriod(),
        signal_period: item.signalPeriod(),
        k_period:      item.kPeriod(),
        d_period:      item.dPeriod(),
        slowing:       item.slowing(),
        deviation:     item.deviation(),
        overbought:    item.overbought(),
        oversold:      item.oversold(),
        volume:        item.volume(),
        price_type:    item.priceType()   ?? 'close',
        symbol:        item.symbol()      ?? '',
        timeframe:     item.timeframe()   ?? ''
    };
}

// ================================================================
// DECODER CLASS
// ================================================================

export class MegaFlowzDecoder {

    static decode(buffer: ArrayBuffer): DecodedMessage {
        try {
            const bytes = new Uint8Array(buffer);
            const bb    = new ByteBuffer(bytes);
            const msg   = Message.getRootAsMessage(bb);

            const payloadType = msg.payloadType();

            switch (payloadType) {

                // ── Initial burst ──
                case MessagePayload.InitialData: {
                    const p = msg.payload(
                        new InitialData()
                    ) as InitialData;

                    const candles: CandleData[] = [];
                    for (let i = 0; i < p.candlesLength(); i++) {
                        const c = p.candles(i);
                        if (c) candles.push(extractCandle(c));
                    }

                    return {
                        type: 'initial',
                        data: {
                            symbol:    p.symbol()    ?? '',
                            timeframe: tfToString(p.timeframe()),
                            candles
                        }
                    };
                }

                // ── Bar update ──
                case MessagePayload.BarUpdate: {
                    const p = msg.payload(
                        new BarUpdate()
                    ) as BarUpdate;

                    const c = p.candle();
                    if (!c) return { type: 'unknown' };

                    return {
                        type: 'bar_update',
                        data: {
                            symbol:    p.symbol()    ?? '',
                            timeframe: tfToString(p.timeframe()),
                            candle:    extractCandle(c)
                        }
                    };
                }

                // ── Price update ──
                case MessagePayload.PriceUpdate: {
                    const p = msg.payload(
                        new PriceUpdate()
                    ) as PriceUpdate;

                    return {
                        type: 'price_update',
                        data: {
                            symbol: p.symbol() ?? '',
                            bid:    p.bid(),
                            ask:    p.ask(),
                            spread: p.spread(),
                            time:   parseInt(p.time().toString(), 10)
                        }
                    };
                }

                // ── Watchlist update ──
                case MessagePayload.WatchlistUpdate: {
                    const p = msg.payload(
                        new WatchlistUpdate()
                    ) as WatchlistUpdate;

                    return {
                        type: 'watchlist_update',
                        data: {
                            symbol: p.symbol() ?? '',
                            bid:    p.bid(),
                            ask:    p.ask(),
                            spread: p.spread(),
                            time:   parseInt(p.time().toString(), 10),
                            change: p.change()
                        }
                    };
                }

                // ── Positions update ──
                case MessagePayload.PositionsUpdate: {
                    const p = msg.payload(
                        new PositionsUpdate()
                    ) as PositionsUpdate;

                    const positions: PositionData[] = [];
                    for (let i = 0; i < p.positionsLength(); i++) {
                        const pos = p.positions(i);
                        if (!pos) continue;
                        positions.push({
                            ticket:        parseInt(pos.ticket().toString(), 10),
                            symbol:        pos.symbol()       ?? '',
                            type:          posTypeToString(pos.type()),
                            volume:        pos.volume(),
                            open_price:    pos.openPrice(),
                            current_price: pos.currentPrice(),
                            sl:            pos.sl(),
                            tp:            pos.tp(),
                            profit:        pos.profit(),
                            swap:          pos.swap(),
                            commission:    pos.commission(),
                            open_time:     parseInt(pos.openTime().toString(), 10)
                        });
                    }

                    const acc = p.account();
                    const account: AccountData | null = acc
                        ? {
                            balance:      acc.balance(),
                            equity:       acc.equity(),
                            margin:       acc.margin(),
                            free_margin:  acc.freeMargin(),
                            margin_level: acc.marginLevel(),
                            leverage:     acc.leverage()
                          }
                        : null;

                    return {
                        type: 'positions_update',
                        data: { positions, account }
                    };
                }

                // ── Connection status ──
                case MessagePayload.ConnectionStatus: {
                    const p = msg.payload(
                        new ConnectionStatus()
                    ) as ConnectionStatus;

                    return {
                        type: 'connection_status',
                        data: {
                            connected:   p.connected(),
                            status_text: p.statusText() ?? ''
                        }
                    };
                }

                // ── Trade executed ──
                case MessagePayload.TradeExecuted: {
                    const p = msg.payload(
                        new TradeExecuted()
                    ) as TradeExecuted;

                    return {
                        type: 'trade_executed',
                        data: {
                            success:   p.success(),
                            direction: posTypeToString(p.direction()),
                            symbol:    p.symbol()    ?? '',
                            volume:    p.volume(),
                            price:     p.price(),
                            ticket:    parseInt(p.ticket().toString(), 10),
                            timestamp: parseInt(p.timestamp().toString(), 10),
                            message:   p.message()   ?? ''
                        }
                    };
                }

                // ── Position modified ──
                case MessagePayload.PositionModified: {
                    const p = msg.payload(
                        new PositionModified()
                    ) as PositionModified;

                    return {
                        type: 'position_modified',
                        data: {
                            success: p.success(),
                            ticket:  parseInt(p.ticket().toString(), 10),
                            message: p.message() ?? ''
                        }
                    };
                }

                // ── Notification ──
                case MessagePayload.Notification: {
                    const p = msg.payload(
                        new Notification()
                    ) as Notification;

                    return {
                        type: 'notification',
                        data: {
                            nType:      p.type(),
                            severity:   p.severity(),
                            title:      p.title()   ?? '',
                            message:    p.message() ?? '',
                            symbol:     p.symbol()  ?? '',
                            direction:  posTypeToString(p.direction()),
                            volume:     p.volume(),
                            price:      p.price(),
                            open_price: p.openPrice(),
                            profit:     p.profit(),
                            ticket:     parseInt(p.ticket().toString(), 10),
                            timestamp:  parseInt(p.timestamp().toString(), 10)
                        }
                    };
                }

                // ── Error ──
                case MessagePayload.ErrorMsg: {
                    const p = msg.payload(
                        new ErrorMsg()
                    ) as ErrorMsg;

                    return {
                        type: 'error',
                        data: { message: p.message() ?? '' }
                    };
                }

                // ── Auto trading ──
                case MessagePayload.AutoTradingStatus: {
                    const p = msg.payload(
                        new AutoTradingStatus()
                    ) as AutoTradingStatus;

                    return {
                        type: 'auto_trading',
                        data: {
                            enabled: p.enabled(),
                            message: p.message() ?? ''
                        }
                    };
                }

                // ── Cache cleared / pong ──
                case MessagePayload.CacheCleared: {
                    const p = msg.payload(
                        new CacheCleared()
                    ) as CacheCleared;

                    const message = p.message() ?? '';

                    if (message === 'pong') {
                        return {
                            type: 'pong',
                            data: { message }
                        };
                    }

                    return {
                        type: 'cache_cleared',
                        data: { message }
                    };
                }

                // ── Journal data ──
                case MessagePayload.JournalData: {
                    const p = msg.payload(
                        new JournalData()
                    ) as JournalData;

                    const trades: JournalTradeData[] = [];
                    for (let i = 0; i < p.tradesLength(); i++) {
                        const t = p.trades(i);
                        if (!t) continue;
                        trades.push({
                            ticket:      parseInt(t.ticket().toString(), 10),
                            symbol:      t.symbol()     ?? '',
                            type:        posTypeToString(t.type()),
                            volume:      t.volume(),
                            open_price:  t.openPrice(),
                            close_price: t.closePrice(),
                            profit:      t.profit(),
                            swap:        t.swap(),
                            commission:  t.commission(),
                            open_time:   parseInt(t.openTime().toString(), 10),
                            close_time:  parseInt(t.closeTime().toString(), 10)
                        });
                    }

                    return {
                        type: 'journal_data',
                        data: {
                            trades,
                            scope: p.scope() ?? 'today'
                        }
                    };
                }

                // ── Available config ──
                case MessagePayload.AvailableConfig: {
                    const p = msg.payload(
                        new AvailableConfig()
                    ) as AvailableConfig;

                    const symbols: AvailableSymbolData[] = [];
                    for (let i = 0; i < p.symbolsLength(); i++) {
                        const s = p.symbols(i);
                        if (!s) continue;
                        symbols.push({
                            name:        s.name()        ?? '',
                            description: s.description() ?? ''
                        });
                    }

                    const timeframes_visible: string[] = [];
                    for (let i = 0; i < p.timeframesVisibleLength(); i++) {
                        timeframes_visible.push(
                            p.timeframesVisible(i) ?? ''
                        );
                    }

                    const timeframes_more: string[] = [];
                    for (let i = 0; i < p.timeframesMoreLength(); i++) {
                        timeframes_more.push(
                            p.timeframesMore(i) ?? ''
                        );
                    }

                    const indicators: AvailableItemData[] = [];
                    for (let i = 0; i < p.indicatorsLength(); i++) {
                        const item = p.indicators(i);
                        if (!item) continue;
                        indicators.push(extractAvailableItem(item));
                    }

                    const strategies: AvailableItemData[] = [];
                    for (let i = 0; i < p.strategiesLength(); i++) {
                        const item = p.strategies(i);
                        if (!item) continue;
                        strategies.push(extractAvailableItem(item));
                    }

                    const patterns: AvailableItemData[] = [];
                    for (let i = 0; i < p.patternsLength(); i++) {
                        const item = p.patterns(i);
                        if (!item) continue;
                        patterns.push(extractAvailableItem(item));
                    }

                    return {
                        type: 'available_config',
                        data: {
                            symbols,
                            timeframes_visible,
                            timeframes_more,
                            indicators,
                            strategies,
                            patterns
                        }
                    };
                }

                // ── Indicator update ──
                case MessagePayload.IndicatorUpdate: {
                    const p = msg.payload(
                        new IndicatorUpdate()
                    ) as IndicatorUpdate;

                    const lines: IndicatorLineData[] = [];
                    for (let i = 0; i < p.linesLength(); i++) {
                        const line = p.lines(i);
                        if (!line) continue;

                        const timestamps: number[] = [];
                        for (let j = 0; j < line.timestampsLength(); j++) {
                            const ts = line.timestamps(j);
                            if (ts !== null) timestamps.push(Number(ts));
                        }

                        const values: number[] = [];
                        for (let j = 0; j < line.valuesLength(); j++) {
                            const v = line.values(j);
                            if (v !== null) values.push(v);
                        }

                        lines.push({
                            name: line.name() ?? '',
                            timestamps,
                            values
                        });
                    }

                    return {
                        type: 'indicator_update',
                        data: {
                            key:       p.key()       ?? '',
                            label:     p.label()     ?? '',
                            symbol:    p.symbol()    ?? '',
                            timeframe: tfToString(p.timeframe()),
                            lines
                        }
                    };
                }

                default:
                    return { type: 'unknown' };
            }

        } catch (e) {
            return { type: 'unknown' };
        }
    }
}

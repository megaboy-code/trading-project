// ================================================================
// ⚡ CONNECTION MANAGER - WebSocket Pipe Only
// FlatBuffers binary protocol — replaces all JSON
// ================================================================

import { MegaFlowzDecoder, DecodedMessage, NotificationPayload, AvailableConfigPayload, IndicatorUpdatePayload, StrategyDrawingUpdatePayload } from '../generated/MegaFlowzDecoder';
import { AccountInfo, PositionData }                             from '../types';

export interface ConnectionCallbacks {
    onCandleData?:              (symbol: string, timeframe: string, candles: any[]) => void;
    onBarUpdate?:               (symbol: string, timeframe: string, candle: any)    => void;
    onTickData?:                (symbol: string, bid: number, ask: number, spread: number, time: number) => void;
    onAccountUpdate?:           (account: AccountInfo)      => void;
    onPositionsUpdate?:         (positions: PositionData[]) => void;
    onStrategyData?:            (type: string, data: any)   => void;
    onTradeExecuted?:           (success: boolean, direction: string, symbol: string, volume: number, price: number, ticket: number, timestamp: number, message: string) => void;
    onPositionModified?:        (success: boolean, ticket: number, message: string) => void;
    onNotification?:            (data: NotificationPayload) => void;
    onConnectionStatus?:        (status: 'connected' | 'disconnected' | 'connecting' | 'error') => void;
    onMT5Status?:               (connected: boolean, statusText: string) => void;
    onWatchlistUpdate?:         (symbol: string, bid: number, ask: number, spread: number, time: number, change: number) => void;
    onError?:                   (message: string) => void;
    onAutoTrading?:             (enabled: boolean, message: string) => void;
    onCacheCleared?:            (message: string) => void;
    onJournalData?:             (trades: any[], scope: string) => void;
    onAvailableConfig?:         (data: AvailableConfigPayload) => void;
    onIndicatorUpdate?:         (data: IndicatorUpdatePayload) => void;
    onStrategyDrawingUpdate?:   (data: StrategyDrawingUpdatePayload) => void;
}

export class ConnectionManager {
    private ws:                  WebSocket | null = null;
    private wsConnected:         boolean = false;

    private currentSymbol:       string;
    private currentTimeframe:    string;
    private currentSubscription: string | null = null;

    private lastBidPrice:        number | null = null;
    private lastAskPrice:        number | null = null;

    private mt5Connected:        boolean = false;
    private mt5StatusText:       string  = 'Unknown';

    private callbacks:           ConnectionCallbacks = {};

    constructor() {
        this.currentSymbol    = localStorage.getItem('last_symbol')    || 'EURUSD';
        this.currentTimeframe = localStorage.getItem('last_timeframe') || 'H1';
    }

    // ==================== TIMEFRAME NORMALIZATION ====================

    private normalizeTimeframe(tf: string): string {
        const map: Record<string, string> = {
            '1': 'M1', '5': 'M5', '15': 'M15', '30': 'M30',
            '60': 'H1', '240': 'H4', '1440': 'D1',
            '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30',
            '1h': 'H1', '4h': 'H4', '1d': 'D1',
            '1M': 'M1', '5M': 'M5', '15M': 'M15', '30M': 'M30',
            '1H': 'H1', '4H': 'H4', '1D': 'D1',
            'M1': 'M1', 'M5': 'M5', 'M15': 'M15', 'M30': 'M30',
            'H1': 'H1', 'H4': 'H4', 'D1': 'D1'
        };
        return map[tf] || tf.toUpperCase();
    }

    // ==================== CONNECTION ====================

    public connect(): void {
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN)       return;
            if (this.ws.readyState === WebSocket.CONNECTING) return;
        }
        this.notifyConnectionStatus('connecting');
        this.setupWebSocket();
    }

    public disconnect(): void {
        if (this.ws) {
            this.ws.onclose          = null;
            this.ws.close();
            this.ws                  = null;
            this.wsConnected         = false;
            this.currentSubscription = null;
            this.notifyConnectionStatus('disconnected');
        }
    }

    // ==================== SEND ====================

    public sendCommand(command: string): void {
        if (this.wsConnected && this.ws &&
            this.ws.readyState === WebSocket.OPEN)
        {
            this.ws.send(command);
        }
    }

    // ==================== SYMBOL / TIMEFRAME ====================

    public setSymbol(symbol: string): void {
        const oldSymbol    = this.currentSymbol;
        this.currentSymbol = symbol;

        this.lastBidPrice = null;
        this.lastAskPrice = null;

        localStorage.setItem('last_symbol', symbol);

        if (this.wsConnected) {
            const key = `${symbol}_${this.currentTimeframe}`;
            if (this.currentSubscription === key) return;
            this.currentSubscription = key;
            this.sendCommand(`UNSUBSCRIBE_${oldSymbol}`);
            this.sendCommand(`SUBSCRIBE_${symbol}_${this.currentTimeframe}`);
        }
    }

    public setTimeframe(timeframe: string): void {
        const normalized      = this.normalizeTimeframe(timeframe);
        this.currentTimeframe = normalized;
        localStorage.setItem('last_timeframe', normalized);

        if (this.wsConnected) {
            const key = `${this.currentSymbol}_${normalized}`;
            if (this.currentSubscription === key) return;
            this.currentSubscription = key;
            this.sendCommand(`UNSUBSCRIBE_${this.currentSymbol}`);
            this.sendCommand(`SUBSCRIBE_${this.currentSymbol}_${normalized}`);
        }
    }

    // ==================== GETTERS ====================

    public getCurrentSymbol(): string       { return this.currentSymbol; }
    public getCurrentTimeframe(): string    { return this.currentTimeframe; }
    public getLastBidPrice(): number | null { return this.lastBidPrice; }
    public getLastAskPrice(): number | null { return this.lastAskPrice; }
    public isConnected(): boolean           { return this.wsConnected; }
    public isMT5Connected(): boolean        { return this.mt5Connected; }
    public getMT5StatusText(): string       { return this.mt5StatusText; }

    // ==================== TRADING COMMANDS ====================

    public executeTrade(
        direction: 'BUY' | 'SELL',
        symbol:    string,
        volume:    number,
        price:     number,
        tp:        number | null = null,
        sl:        number | null = null
    ): void {
        const slStr = sl !== null ? String(sl) : '0';
        const tpStr = tp !== null ? String(tp) : '0';
        this.sendCommand(
            `TRADE_${direction}_${symbol}_${volume}_${price}_${slStr}_${tpStr}`
        );
    }

    public closeAllPositions(): void           { this.sendCommand('CLOSE_ALL'); }
    public closePosition(ticket: string): void { this.sendCommand(`CLOSE_POSITION_${ticket}`); }
    public getPositions(): void                { this.sendCommand('GET_POSITIONS'); }
    public getAccountInfo(): void              { this.sendCommand('GET_ACCOUNT_INFO'); }
    public clearCache(): void                  { this.sendCommand('CLEAR_CACHE'); }
    public getJournalToday(): void             { this.sendCommand('GET_JOURNAL_TODAY'); }

    public getJournalMonth(year: number, month: number): void {
        this.sendCommand(`GET_JOURNAL_MONTH_${year}_${month}`);
    }

    // ==================== INDICATOR COMMANDS ====================

    public subscribeIndicator(
        key:       string,
        symbol:    string,
        timeframe: string,
        period:    number = 0
    ): void {
        const tf  = this.normalizeTimeframe(timeframe);
        const cmd = period > 0
            ? `INDICATOR_SUB_${key}_${symbol}_${tf}_${period}`
            : `INDICATOR_SUB_${key}_${symbol}_${tf}`;
        this.sendCommand(cmd);
    }

    public unsubscribeIndicator(
        key:       string,
        symbol:    string,
        timeframe: string
    ): void {
        const tf = this.normalizeTimeframe(timeframe);
        this.sendCommand(`INDICATOR_UNSUB_${key}_${symbol}_${tf}`);
    }

    // ==================== STRATEGY COMMANDS ====================

    public deployStrategy(
        strategyType: string,
        symbol:       string,
        timeframe:    string,
        params:       object
    ): void {
        const tf = this.normalizeTimeframe(timeframe);
        this.sendCommand(
            `DEPLOY_STRATEGY_${strategyType}_${symbol}_${tf}`
        );
    }

    public removeStrategy(
        strategyType: string,
        symbol:       string,
        timeframe:    string
    ): void {
        const tf = this.normalizeTimeframe(timeframe);
        this.sendCommand(
            `REMOVE_STRATEGY_${strategyType}_${symbol}_${tf}`
        );
    }

    public updateStrategy(strategyId: string, updates: object): void {
        this.sendCommand(`UPDATE_STRATEGY_${strategyId}`);
    }

    public getActiveStrategies(): void { this.sendCommand('GET_ACTIVE_STRATEGIES'); }

    public backtestStrategy(
        strategyType: string,
        symbol:       string,
        timeframe:    string,
        days:         number,
        params:       object
    ): void {
        const tf = this.normalizeTimeframe(timeframe);
        this.sendCommand(
            `BACKTEST_STRATEGY_${strategyType}_${symbol}_${tf}_${days}`
        );
    }

    public setAutoTrading(enabled: boolean): void {
        this.sendCommand(enabled ? 'AUTO_ON' : 'AUTO_OFF');
    }

    // ==================== CALLBACK REGISTRATION ====================

    public onCandleData(cb: ConnectionCallbacks['onCandleData']): void                           { this.callbacks.onCandleData             = cb; }
    public onBarUpdate(cb: ConnectionCallbacks['onBarUpdate']): void                             { this.callbacks.onBarUpdate              = cb; }
    public onTickData(cb: ConnectionCallbacks['onTickData']): void                               { this.callbacks.onTickData               = cb; }
    public onAccountUpdate(cb: ConnectionCallbacks['onAccountUpdate']): void                     { this.callbacks.onAccountUpdate          = cb; }
    public onPositionsUpdate(cb: ConnectionCallbacks['onPositionsUpdate']): void                 { this.callbacks.onPositionsUpdate        = cb; }
    public onStrategyData(cb: ConnectionCallbacks['onStrategyData']): void                       { this.callbacks.onStrategyData           = cb; }
    public onTradeExecuted(cb: ConnectionCallbacks['onTradeExecuted']): void                     { this.callbacks.onTradeExecuted          = cb; }
    public onPositionModified(cb: ConnectionCallbacks['onPositionModified']): void               { this.callbacks.onPositionModified       = cb; }
    public onNotification(cb: ConnectionCallbacks['onNotification']): void                       { this.callbacks.onNotification           = cb; }
    public onConnectionStatus(cb: ConnectionCallbacks['onConnectionStatus']): void               { this.callbacks.onConnectionStatus       = cb; }
    public onMT5Status(cb: ConnectionCallbacks['onMT5Status']): void                             { this.callbacks.onMT5Status              = cb; }
    public onWatchlistUpdate(cb: ConnectionCallbacks['onWatchlistUpdate']): void                 { this.callbacks.onWatchlistUpdate        = cb; }
    public onError(cb: ConnectionCallbacks['onError']): void                                     { this.callbacks.onError                  = cb; }
    public onAutoTrading(cb: ConnectionCallbacks['onAutoTrading']): void                         { this.callbacks.onAutoTrading            = cb; }
    public onCacheCleared(cb: ConnectionCallbacks['onCacheCleared']): void                       { this.callbacks.onCacheCleared           = cb; }
    public onJournalData(cb: ConnectionCallbacks['onJournalData']): void                         { this.callbacks.onJournalData            = cb; }
    public onAvailableConfig(cb: ConnectionCallbacks['onAvailableConfig']): void                 { this.callbacks.onAvailableConfig        = cb; }
    public onIndicatorUpdate(cb: ConnectionCallbacks['onIndicatorUpdate']): void                 { this.callbacks.onIndicatorUpdate        = cb; }
    public onStrategyDrawingUpdate(cb: ConnectionCallbacks['onStrategyDrawingUpdate']): void     { this.callbacks.onStrategyDrawingUpdate  = cb; }

    // ==================== WEBSOCKET SETUP ====================

    private setupWebSocket(): void {
        this.ws = new WebSocket('ws://127.0.0.1:8765');
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.wsConnected = true;
            this.notifyConnectionStatus('connected');

            this.sendCommand('GET_STARTUP_CONFIG');
            this.sendCommand('GET_ACTIVE_STRATEGIES');

            this.currentSubscription =
                `${this.currentSymbol}_${this.currentTimeframe}`;
            this.sendCommand(
                `SUBSCRIBE_${this.currentSymbol}_${this.currentTimeframe}`
            );

            try {
                const saved = localStorage.getItem('watchlist_symbols');
                if (saved) {
                    const symbols: string[] = JSON.parse(saved);
                    if (Array.isArray(symbols)) {
                        symbols.forEach(symbol => {
                            this.sendCommand(`WATCHLIST_ADD_${symbol}`);
                        });
                    }
                }
            } catch (e) {}
        };

        this.ws.onmessage = (event: MessageEvent) => {
            if (!(event.data instanceof ArrayBuffer)) return;
            const msg = MegaFlowzDecoder.decode(event.data);
            this.routeMessage(msg);
        };

        this.ws.onclose = () => {
            this.wsConnected         = false;
            this.currentSubscription = null;
            this.notifyConnectionStatus('disconnected');

            setTimeout(() => {
                if (!this.ws ||
                    this.ws.readyState === WebSocket.CLOSED)
                {
                    this.setupWebSocket();
                }
            }, 3000);
        };

        this.ws.onerror = () => {
            this.notifyConnectionStatus('error');
        };
    }

    // ==================== MESSAGE ROUTING ====================

    private routeMessage(msg: DecodedMessage): void {
        switch (msg.type) {

            case 'initial':
                if (this.callbacks.onCandleData) {
                    this.callbacks.onCandleData(
                        msg.data.symbol,
                        msg.data.timeframe,
                        msg.data.candles
                    );
                }
                break;

            case 'bar_update':
                if (this.callbacks.onBarUpdate) {
                    this.callbacks.onBarUpdate(
                        msg.data.symbol,
                        msg.data.timeframe,
                        msg.data.candle
                    );
                }
                break;

            case 'price_update':
                this.lastBidPrice = msg.data.bid;
                this.lastAskPrice = msg.data.ask;
                if (this.callbacks.onTickData) {
                    this.callbacks.onTickData(
                        msg.data.symbol,
                        msg.data.bid,
                        msg.data.ask,
                        msg.data.spread,
                        msg.data.time
                    );
                }
                break;

            case 'watchlist_update':
                if (this.callbacks.onWatchlistUpdate) {
                    this.callbacks.onWatchlistUpdate(
                        msg.data.symbol,
                        msg.data.bid,
                        msg.data.ask,
                        msg.data.spread,
                        msg.data.time,
                        msg.data.change
                    );
                }
                break;

            case 'positions_update':
                if (msg.data.positions &&
                    this.callbacks.onPositionsUpdate)
                {
                    this.callbacks.onPositionsUpdate(
                        msg.data.positions as PositionData[]
                    );
                }
                if (msg.data.account &&
                    this.callbacks.onAccountUpdate)
                {
                    this.callbacks.onAccountUpdate(
                        msg.data.account as AccountInfo
                    );
                }
                break;

            case 'connection_status':
                this.mt5Connected  = msg.data.connected;
                this.mt5StatusText = msg.data.status_text;
                if (this.callbacks.onMT5Status) {
                    this.callbacks.onMT5Status(
                        msg.data.connected,
                        msg.data.status_text
                    );
                }
                break;

            case 'trade_executed':
                if (this.callbacks.onTradeExecuted) {
                    this.callbacks.onTradeExecuted(
                        msg.data.success,
                        msg.data.direction,
                        msg.data.symbol,
                        msg.data.volume,
                        msg.data.price,
                        msg.data.ticket,
                        msg.data.timestamp,
                        msg.data.message
                    );
                }
                break;

            case 'position_modified':
                if (this.callbacks.onPositionModified) {
                    this.callbacks.onPositionModified(
                        msg.data.success,
                        msg.data.ticket,
                        msg.data.message
                    );
                }
                break;

            case 'notification':
                if (this.callbacks.onNotification) {
                    this.callbacks.onNotification(msg.data);
                }
                break;

            case 'journal_data':
                if (this.callbacks.onJournalData) {
                    this.callbacks.onJournalData(
                        msg.data.trades,
                        msg.data.scope
                    );
                }
                break;

            case 'available_config':
                if (this.callbacks.onAvailableConfig) {
                    this.callbacks.onAvailableConfig(msg.data);
                }
                break;

            case 'indicator_update':
                if (this.callbacks.onIndicatorUpdate) {
                    this.callbacks.onIndicatorUpdate(msg.data);
                }
                break;

            case 'strategy_drawing_update':
                if (this.callbacks.onStrategyDrawingUpdate) {
                    this.callbacks.onStrategyDrawingUpdate(msg.data);
                }
                break;

            case 'error':
                if (this.callbacks.onError) {
                    this.callbacks.onError(msg.data.message);
                }
                break;

            case 'auto_trading':
                if (this.callbacks.onAutoTrading) {
                    this.callbacks.onAutoTrading(
                        msg.data.enabled,
                        msg.data.message
                    );
                }
                break;

            case 'cache_cleared':
                if (this.callbacks.onCacheCleared) {
                    this.callbacks.onCacheCleared(msg.data.message);
                }
                break;

            case 'pong':
                break;

            case 'unknown':
                break;
        }
    }

    private notifyConnectionStatus(
        status: 'connected' | 'disconnected' | 'connecting' | 'error'
    ): void {
        if (this.callbacks.onConnectionStatus) {
            this.callbacks.onConnectionStatus(status);
        }
    }

    // ==================== DEBUG ====================

    public debugInfo(): void {
        console.log('=== ConnectionManager ===');
        console.log('WS Connected:    ', this.wsConnected);
        console.log('MT5 Connected:   ', this.mt5Connected);
        console.log('MT5 Status:      ', this.mt5StatusText);
        console.log('Symbol:          ', this.currentSymbol);
        console.log('Timeframe:       ', this.currentTimeframe);
        console.log('Subscription:    ', this.currentSubscription);
        console.log('Last Bid:        ', this.lastBidPrice);
        console.log('Last Ask:        ', this.lastAskPrice);
        console.log('========================');
    }
}

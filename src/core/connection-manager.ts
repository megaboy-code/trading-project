// ================================================================
// ⚡ CONNECTION MANAGER - WebSocket Pipe Only
// ================================================================

import {
    WebSocketMessage,
    AccountInfo,
    PositionData
} from '../types';

export interface ConnectionCallbacks {
    onCandleData?: (data: WebSocketMessage) => void;
    onTickData?: (data: WebSocketMessage) => void;
    onAccountUpdate?: (account: AccountInfo) => void;
    onPositionsUpdate?: (positions: PositionData[]) => void;
    onStrategyData?: (data: WebSocketMessage) => void;
    onTradeExecuted?: (data: WebSocketMessage) => void;
    onConnectionStatus?: (status: 'connected' | 'disconnected' | 'connecting' | 'error') => void;
    onMT5Status?: (connected: boolean, statusText: string) => void;
}

export class ConnectionManager {
    private ws: WebSocket | null = null;
    private wsConnected: boolean = false;

    private currentSymbol: string;
    private currentTimeframe: string;
    private currentSubscription: string | null = null;

    private lastBidPrice: number | null = null;
    private lastAskPrice: number | null = null;

    private mt5Connected: boolean = false;
    private mt5StatusText: string = 'Unknown';

    private callbacks: ConnectionCallbacks = {};

    constructor() {
        console.log('📡 Connection Manager Initialized');

        this.currentSymbol    = localStorage.getItem('last_symbol')    || 'EURUSD';
        this.currentTimeframe = localStorage.getItem('last_timeframe') || 'H1';

        console.log(`📡 Loaded: ${this.currentSymbol} @ ${this.currentTimeframe}`);
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

        const normalized = map[tf] || tf.toUpperCase();
        if (tf !== normalized) console.log(`🔄 Timeframe normalized: ${tf} → ${normalized}`);
        return normalized;
    }

    // ==================== CONNECTION ====================

    public connect(): void {
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN)       return;
            if (this.ws.readyState === WebSocket.CONNECTING) return;
        }

        console.log('🔌 Connecting to WebSocket');
        this.notifyConnectionStatus('connecting');
        this.setupWebSocket();
    }

    public disconnect(): void {
        console.log('🔌 Disconnecting WebSocket');
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws                  = null;
            this.wsConnected         = false;
            this.currentSubscription = null;
            this.notifyConnectionStatus('disconnected');
        }
    }

    // ==================== SEND ====================

    public sendCommand(command: string | object): void {
        if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (typeof command === 'object') {
                this.ws.send(JSON.stringify(command));
            } else {
                this.ws.send(command);
            }
            console.log(`📤 Sent: ${typeof command === 'object' ? 'JSON' : String(command).substring(0, 50)}`);
        } else {
            console.warn('⚠️ Cannot send — WebSocket not connected');
        }
    }

    // ==================== SYMBOL / TIMEFRAME ====================

    public setSymbol(symbol: string): void {
        const oldSymbol       = this.currentSymbol;
        this.currentSymbol    = symbol;
        localStorage.setItem('last_symbol', symbol);

        if (this.wsConnected) {
            const key = `${symbol}_${this.currentTimeframe}`;
            if (this.currentSubscription === key) {
                console.log(`⏭️ Already subscribed to ${key}`);
                return;
            }
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
            if (this.currentSubscription === key) {
                console.log(`⏭️ Already subscribed to ${key}`);
                return;
            }
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
        symbol: string,
        volume: number,
        price: number,
        tp: number | null = null,
        sl: number | null = null
    ): void {
        const slStr = sl !== null ? String(sl) : '0';
        const tpStr = tp !== null ? String(tp) : '0';
        this.sendCommand(`TRADE_${direction}_${symbol}_${volume}_${price}_${slStr}_${tpStr}`);
    }

    public closeAllPositions(): void              { this.sendCommand('CLOSE_ALL'); }
    public closePosition(ticket: string): void    { this.sendCommand(`CLOSE_POSITION_${ticket}`); }
    public getPositions(): void                   { this.sendCommand('GET_POSITIONS'); }
    public getAccountInfo(): void                 { this.sendCommand('GET_ACCOUNT_INFO'); }
    public clearCache(): void                     { this.sendCommand('CLEAR_CACHE'); }

    // ==================== STRATEGY COMMANDS ====================

    public deployStrategy(
        strategyType: string,
        symbol: string,
        timeframe: string,
        params: object): void
    {
        const tf = this.normalizeTimeframe(timeframe);
        this.sendCommand(`DEPLOY_STRATEGY_${strategyType}_${symbol}_${tf}_${JSON.stringify(params)}`);
    }

    public removeStrategy(strategyId: string): void {
        this.sendCommand(`REMOVE_STRATEGY_${strategyId}`);
    }

    public updateStrategy(strategyId: string, updates: object): void {
        this.sendCommand(`UPDATE_STRATEGY_${strategyId}_${JSON.stringify(updates)}`);
    }

    public getActiveStrategies(): void { this.sendCommand('GET_ACTIVE_STRATEGIES'); }

    public backtestStrategy(
        strategyType: string,
        symbol: string,
        timeframe: string,
        days: number,
        params: object): void
    {
        const tf = this.normalizeTimeframe(timeframe);
        this.sendCommand(`BACKTEST_STRATEGY_${strategyType}_${symbol}_${tf}_${days}_${JSON.stringify(params)}`);
    }

    public setAutoTrading(enabled: boolean): void {
        this.sendCommand(enabled ? 'AUTO_ON' : 'AUTO_OFF');
    }

    // ==================== CALLBACK REGISTRATION ====================

    public onCandleData(callback: (data: WebSocketMessage) => void): void {
        this.callbacks.onCandleData = callback;
    }

    public onTickData(callback: (data: WebSocketMessage) => void): void {
        this.callbacks.onTickData = callback;
    }

    public onAccountUpdate(callback: (account: AccountInfo) => void): void {
        this.callbacks.onAccountUpdate = callback;
    }

    public onPositionsUpdate(callback: (positions: PositionData[]) => void): void {
        this.callbacks.onPositionsUpdate = callback;
    }

    public onStrategyData(callback: (data: WebSocketMessage) => void): void {
        this.callbacks.onStrategyData = callback;
    }

    public onTradeExecuted(callback: (data: WebSocketMessage) => void): void {
        this.callbacks.onTradeExecuted = callback;
    }

    public onConnectionStatus(callback: (status: 'connected' | 'disconnected' | 'connecting' | 'error') => void): void {
        this.callbacks.onConnectionStatus = callback;
    }

    public onMT5Status(callback: (connected: boolean, statusText: string) => void): void {
        this.callbacks.onMT5Status = callback;
    }

    // ==================== WEBSOCKET SETUP ====================

    private setupWebSocket(): void {
        this.ws = new WebSocket('ws://localhost:8765');

        this.ws.onopen = () => {
            console.log('✅ WebSocket connected');
            this.wsConnected = true;
            this.notifyConnectionStatus('connected');

            // ── Initial requests ──
            this.sendCommand('GET_ACCOUNT_INFO');
            this.sendCommand('GET_POSITIONS');

            // ── Subscribe to last symbol/TF ──
            this.currentSubscription = `${this.currentSymbol}_${this.currentTimeframe}`;
            this.sendCommand(`SUBSCRIBE_${this.currentSymbol}_${this.currentTimeframe}`);

            // ✅ Re-send watchlist symbols to C++ on every connect
            // Ensures C++ watchlist matches frontend localStorage
            try {
                const saved = localStorage.getItem('watchlist_symbols');
                if (saved) {
                    const symbols: string[] = JSON.parse(saved);
                    if (Array.isArray(symbols)) {
                        symbols.forEach(symbol => {
                            this.sendCommand(`WATCHLIST_ADD_${symbol}`);
                        });
                        console.log(`📡 Watchlist synced to backend: ${symbols.join(', ')}`);
                    }
                }
            } catch (e) {
                console.warn('⚠️ Failed to sync watchlist to backend');
            }
        };

        this.ws.onmessage = (event: MessageEvent) => {
            try {
                const data: WebSocketMessage = JSON.parse(event.data);
                this.handleWebSocketData(data);
            } catch (error) {
                console.error('❌ WebSocket parse error:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('🔌 WebSocket disconnected');
            this.wsConnected         = false;
            this.currentSubscription = null;
            this.notifyConnectionStatus('disconnected');

            setTimeout(() => {
                if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                    this.setupWebSocket();
                }
            }, 3000);
        };

        this.ws.onerror = () => {
            console.error('❌ WebSocket error');
            this.notifyConnectionStatus('error');
        };
    }

    // ==================== MESSAGE ROUTING ====================

    private handleWebSocketData(data: WebSocketMessage): void {
        if (!data || !data.type) return;

        switch (data.type) {

            case 'connection_status':
                this.handleConnectionStatus(data);
                break;

            case 'initial':
            case 'update':
            case 'append':
                if (this.callbacks.onCandleData) this.callbacks.onCandleData(data);
                break;

            case 'price_update':
                if (data.bid !== undefined) this.lastBidPrice = data.bid;
                if (data.ask !== undefined) this.lastAskPrice = data.ask;
                if (this.callbacks.onTickData) this.callbacks.onTickData(data);
                break;

            case 'trade_executed':
            case 'position_modified':
            case 'position_closed':
            case 'positions_closed':
                if (this.callbacks.onTradeExecuted) this.callbacks.onTradeExecuted(data);
                break;

            case 'positions_update':
                if (data.positions && this.callbacks.onPositionsUpdate) {
                    this.callbacks.onPositionsUpdate(data.positions);
                }
                if (data.account && this.callbacks.onAccountUpdate) {
                    this.callbacks.onAccountUpdate(data.account);
                }
                break;

            case 'account_info':
                if (data.account && this.callbacks.onAccountUpdate) {
                    this.callbacks.onAccountUpdate(data.account);
                }
                break;

            // ✅ Watchlist prices from C++ backend
            case 'watchlist_update':
                document.dispatchEvent(new CustomEvent('watchlist-prices-update', {
                    detail: data
                }));
                break;

            case 'strategy_response':
            case 'strategy_deployed':
            case 'strategy_removed':
            case 'strategy_updated':
            case 'strategy_signal':
            case 'strategy_initial':
            case 'strategy_update':
            case 'auto_trading_status':
            case 'backtest_results':
                if (this.callbacks.onStrategyData) this.callbacks.onStrategyData(data);
                break;

            default:
                console.log(`📨 Unhandled message type: ${data.type}`);
        }
    }

    private handleConnectionStatus(data: WebSocketMessage): void {
        this.mt5Connected  = data.data?.mt5_connected || false;
        this.mt5StatusText = data.data?.status_text   || 'Unknown';

        console.log(`📡 MT5: ${this.mt5Connected ? '✅' : '❌'} ${this.mt5StatusText}`);

        if (this.callbacks.onMT5Status) {
            this.callbacks.onMT5Status(this.mt5Connected, this.mt5StatusText);
        }
    }

    private notifyConnectionStatus(
        status: 'connected' | 'disconnected' | 'connecting' | 'error'
    ): void {
        console.log(`🔌 Status: ${status}`);
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
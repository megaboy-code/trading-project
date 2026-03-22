// ================================================================
// ⚡ MODULE MANAGER - Orchestrator
// ================================================================

import { ChartModule as ChartModuleImpl } from '../chart/chart-core';
import { ConnectionManager } from './connection-manager';
import { TradingModule as TradingModuleClass } from '../trading/trading';
import { Notification } from '../notification';
import { Panels } from '../panel';
import { WatchlistModule } from '../watchlist/watchlist-module';
import { EconomicCalendarModule } from '../calendar/calendar-module';
import { AlertsModule } from '../alerts/alerts-module';
import { WebSocketMessage, AccountInfo, PositionData } from '../types';

declare global {
    interface Window {}
}

// ✅ Trade arrow store entry
interface TradeArrowEntry {
    id:         string;
    type:       'buy' | 'sell';
    timestamp:  number;
    price:      number;
    priceLabel: string;
}

export class ModuleManager {
    private chart: ChartModuleImpl | null = null;
    private tradingInstance: InstanceType<typeof TradingModuleClass> | null = null;
    private journalInstance: any | null = null;
    private strategyInstance: any | null = null;

    private watchlistInstance: WatchlistModule | null = null;
    private calendarInstance: EconomicCalendarModule | null = null;
    private alertsInstance: AlertsModule | null = null;

    private journalLoading: boolean = false;
    private strategyLoading: boolean = false;

    private notifications = Notification;
    private panels = Panels;

    // ✅ In-memory trade arrow store
    // Survives TF switches — cleared on symbol change or clear all
    private tradeArrowStore: TradeArrowEntry[] = [];

    constructor(private connectionManager: ConnectionManager) {}

    // ==================== INITIALIZATION ====================

    public initialize(): void {
        this.setupConnectionCallbacks();

        this.initializeNotificationModule();
        this.initializeChartModule();
        this.initializeTradingModule();
        this.initializeWatchlistModule();
        this.initializeCalendarModule();
        this.initializeAlertsModule();

        this.setupDOMEventBridge();

        console.log('✅ Module Manager initialized');
    }

    public destroy(): void {
        this.chart?.destroy();
        this.tradingInstance?.destroy();
        this.journalInstance?.destroy();
        this.strategyInstance?.destroy();
        this.watchlistInstance?.destroy();
        this.calendarInstance?.destroy();
        this.alertsInstance?.destroy();
        this.notifications.destroy();
    }

    // ==================== TRADE ARROW STORE ====================

    // ✅ Resolve correct bar timestamp for current TF
    private resolveArrowTimestamp(dataTimestamp?: number): number {
        const latestBar     = this.chart?.getDataManager()?.getLatestOHLC();
        const latestBarTime = latestBar?.time as number;

        if (!dataTimestamp || dataTimestamp <= 0) {
            return latestBarTime ?? Math.floor(Date.now() / 1000);
        }

        const tf = this.connectionManager.getCurrentTimeframe();
        const tfSeconds: Record<string, number> = {
            M1:  60,
            M5:  300,
            M15: 900,
            H1:  3600,
            H4:  14400,
            D1:  86400,
        };

        const interval = tfSeconds[tf] ?? 60;
        const rounded  = Math.floor(dataTimestamp / interval) * interval;

        if (latestBarTime && rounded > latestBarTime) {
            return latestBarTime;
        }

        // ✅ M5 special case — core renders one bar ahead
        if (tf === 'M5' && latestBarTime && rounded === latestBarTime) {
            return rounded - interval;
        }

        return rounded;
    }

    // ✅ Convert stored raw timestamp to correct bar for current TF
    private convertTimestampToCurrentTF(rawTimestamp: number): number {
        const tf = this.connectionManager.getCurrentTimeframe();
        const tfSeconds: Record<string, number> = {
            M1:  60,
            M5:  300,
            M15: 900,
            H1:  3600,
            H4:  14400,
            D1:  86400,
        };

        const interval      = tfSeconds[tf] ?? 60;
        const rounded       = Math.floor(rawTimestamp / interval) * interval;
        const latestBar     = this.chart?.getDataManager()?.getLatestOHLC();
        const latestBarTime = latestBar?.time as number;

        if (latestBarTime && rounded > latestBarTime) {
            return latestBarTime;
        }

        if (tf === 'M5' && latestBarTime && rounded === latestBarTime) {
            return rounded - interval;
        }

        return rounded;
    }

    // ✅ Add arrow to store and place on chart
    private addTradeArrow(entry: TradeArrowEntry): void {
        // Avoid duplicate IDs in store
        if (!this.tradeArrowStore.find(a => a.id === entry.id)) {
            this.tradeArrowStore.push(entry);
        }

        // Place on chart with current TF timestamp
        const timestamp = this.convertTimestampToCurrentTF(entry.timestamp);
        this.chart?.getDrawingModule()?.placeTradeArrow({
            ...entry,
            timestamp,
        });
    }

    // ✅ Re-inject all arrows from store with new TF timestamps
    // Called after chart-drawings-ready event — chart data is guaranteed ready
    private reInjectTradeArrows(): void {
        if (this.tradeArrowStore.length === 0) return;

        this.tradeArrowStore.forEach(entry => {
            const timestamp = this.convertTimestampToCurrentTF(entry.timestamp);
            this.chart?.getDrawingModule()?.placeTradeArrow({
                ...entry,
                timestamp,
            });
        });

        console.log(`🎯 Re-injected ${this.tradeArrowStore.length} trade arrows`);
    }

    // ✅ Clear store and remove all arrows from chart
    private clearAllTradeArrows(): void {
        this.tradeArrowStore = [];
        this.chart?.getDrawingModule()?.removeTradeArrows();
        console.log('🗑️ Trade arrow store cleared');
    }

    // ==================== CONNECTION CALLBACKS ====================

    private setupConnectionCallbacks(): void {

        // Candle data → Chart only
        this.connectionManager.onCandleData((data: WebSocketMessage) => {
            this.chart?.updateWithWebSocketData(data);
        });

        // Tick data → price-update DOM event
        this.connectionManager.onTickData((data: WebSocketMessage) => {
            document.dispatchEvent(new CustomEvent('price-update', {
                detail: {
                    bid:    data.bid,
                    ask:    data.ask,
                    symbol: data.symbol,
                    spread: data.spread,
                    change: data.change
                }
            }));
        });

        // Account update → Trading
        this.connectionManager.onAccountUpdate((account: AccountInfo) => {
            this.tradingInstance?.updateAccountInfo(account);
        });

        // Positions update → Trading
        this.connectionManager.onPositionsUpdate((positions: PositionData[]) => {
            this.tradingInstance?.updatePositions(positions);
        });

        // ✅ Trade executed → add to store + place arrow
        this.connectionManager.onTradeExecuted((data: WebSocketMessage) => {
            if (data.success) {
                this.notifications.success(
                    `Trade ${data.direction || 'executed'} successfully`,
                    { title: 'Trade Executed' }
                );

                if (data.direction && data.price) {
                    const type  = data.direction === 'BUY' ? 'buy' : 'sell';
                    const rawTs = Number(data.timestamp) || Math.floor(Date.now() / 1000);
                    const id    = `trade-arrow-${type}-${rawTs}`;

                    this.addTradeArrow({
                        id,
                        type,
                        timestamp:  rawTs,
                        price:      Number(data.price),
                        priceLabel: String(data.price),
                    });
                }

            } else {
                this.notifications.error(
                    data.message || 'Trade execution failed',
                    { title: 'Trade Failed' }
                );
            }
            this.tradingInstance?.handleTradeConfirmation(data);
        });

        // MT5 status → Chart legend
        this.connectionManager.onMT5Status((connected: boolean, statusText: string) => {
            document.dispatchEvent(new CustomEvent('mt5-status-changed', {
                detail: { connected, statusText }
            }));
        });

        // Connection status → Chart legend
        this.connectionManager.onConnectionStatus((status) => {
            document.dispatchEvent(new CustomEvent('chart-connection-status', {
                detail: { status }
            }));
        });

        // Strategy data
        this.connectionManager.onStrategyData((data: WebSocketMessage) => {
            switch (data.type) {
                case 'strategy_initial':
                case 'strategy_update':
                case 'strategy_deployed':
                case 'strategy_removed':
                case 'strategy_updated':
                    document.dispatchEvent(new CustomEvent(data.type, { detail: data }));
                    break;

                // ✅ Strategy signal → add to store + place arrow
                case 'strategy_signal':
                    document.dispatchEvent(new CustomEvent(data.type, { detail: data }));

                    if (data.direction && data.price) {
                        const type  = data.direction === 'BUY' ? 'buy' : 'sell';
                        const rawTs = Number(data.timestamp) || Math.floor(Date.now() / 1000);
                        const id    = `trade-arrow-${type}-${rawTs}`;

                        this.addTradeArrow({
                            id,
                            type,
                            timestamp:  rawTs,
                            price:      Number(data.price),
                            priceLabel: String(data.price),
                        });
                    }
                    break;

                case 'auto_trading_status':
                    document.dispatchEvent(new CustomEvent(data.type, { detail: data }));
                    break;

                case 'backtest_results':
                    this.strategyInstance?.handleBacktestResults(data);
                    break;

                default:
                    console.log(`📨 Unhandled strategy message: ${data.type}`);
            }
        });
    }

    // ==================== DOM EVENT BRIDGE ====================

    private setupDOMEventBridge(): void {

        document.addEventListener('symbol-changed', (e: Event) => {
            const { symbol } = (e as CustomEvent).detail;
            if (!symbol) return;
            this.connectionManager.setSymbol(symbol);
            this.chart?.handleSymbolChange(symbol);

            // ✅ Symbol change — clear store and arrows
            this.clearAllTradeArrows();
        });

        document.addEventListener('timeframe-changed', (e: Event) => {
            const { timeframe } = (e as CustomEvent).detail;
            if (!timeframe) return;
            this.connectionManager.setTimeframe(timeframe);
            this.chart?.handleTimeframeChange(timeframe);
            // ✅ No re-inject here — wait for chart-drawings-ready event
        });

        // ✅ Chart drawings restored and ready — re-inject trade arrows
        // This fires from chart-drawing-module.ts onDataReady() after loadDrawings() completes
        // Guarantees chart data is ready before placing arrows
        document.addEventListener('chart-drawings-ready', () => {
            this.reInjectTradeArrows();
        });

        // ✅ Arrow toggle ON — re-inject matching arrows from store
        document.addEventListener('chart-arrows-toggle-on', (e: Event) => {
            const { type } = (e as CustomEvent).detail as { type: 'buy' | 'sell' };
            this.tradeArrowStore
                .filter(a => a.type === type)
                .forEach(entry => {
                    const timestamp = this.convertTimestampToCurrentTF(entry.timestamp);
                    this.chart?.getDrawingModule()?.placeTradeArrow({
                        ...entry,
                        timestamp,
                    });
                });
            console.log(`✅ Re-injected ${type} arrows from store`);
        });

        document.addEventListener('chart-initial-data-loaded', () => {
            this.connectionManager.sendCommand('INITIAL_DATA_RECEIVED');
        });

        document.addEventListener('auto-trade-toggled', (e: Event) => {
            const { enabled } = (e as CustomEvent).detail;
            this.connectionManager.setAutoTrading(enabled);
            if (enabled) {
                this.notifications.success('Auto trading is now active', { title: 'Auto Trading Enabled' });
            } else {
                this.notifications.warning('Auto trading has been disabled', { title: 'Auto Trading Disabled' });
            }
        });

        document.addEventListener('execute-trade', (e: Event) => {
            const { command, tp, sl } = (e as CustomEvent).detail;
            if (!command) return;

            const parts = command.split('_');
            if (parts.length >= 5) {
                const direction = parts[1] as 'BUY' | 'SELL';
                const symbol    = parts[2];
                const volume    = parseFloat(parts[3]);
                const price     = parseFloat(parts[4]);
                this.connectionManager.executeTrade(direction, symbol, volume, price, tp ?? null, sl ?? null);
            } else {
                this.connectionManager.sendCommand(command);
            }
        });

        document.addEventListener('close-position', (e: Event) => {
            const { ticket } = (e as CustomEvent).detail;
            if (ticket) this.connectionManager.closePosition(ticket);
        });

        document.addEventListener('close-all-positions', () => {
            this.connectionManager.closeAllPositions();
        });

        document.addEventListener('modify-position', (e: Event) => {
            const { ticket, sl, tp } = (e as CustomEvent).detail;
            if (ticket) this.connectionManager.sendCommand(
                `MODIFY_POSITION_${ticket}_${sl ?? 0}_${tp ?? 0}`
            );
        });

        document.addEventListener('deploy-strategy', (e: Event) => {
            const { strategyType, symbol, timeframe, params } = (e as CustomEvent).detail;
            if (strategyType && symbol && timeframe) {
                this.connectionManager.deployStrategy(strategyType, symbol, timeframe, params || {});
            }
            this.loadStrategyModule();
        });

        document.addEventListener('remove-strategy', (e: Event) => {
            const { strategyId } = (e as CustomEvent).detail;
            if (strategyId) this.connectionManager.removeStrategy(strategyId);
        });

        document.addEventListener('update-strategy', (e: Event) => {
            const { strategyId, updates } = (e as CustomEvent).detail;
            if (strategyId && updates) this.connectionManager.updateStrategy(strategyId, updates);
        });

        document.addEventListener('get-active-strategies', () => {
            this.connectionManager.getActiveStrategies();
            this.loadStrategyModule();
        });

        document.addEventListener('backtest-strategy', (e: Event) => {
            const { strategyType, symbol, timeframe, days, params } = (e as CustomEvent).detail;
            if (strategyType && symbol && timeframe && days) {
                this.connectionManager.backtestStrategy(strategyType, symbol, timeframe, days, params || {});
            }
            this.loadStrategyModule();
        });

        document.addEventListener('hotkey-modal-toggle', (e: Event) => {
            const { modal } = (e as CustomEvent).detail;
            if (modal === 'full-journal') this.loadJournalModule();
        });

        document.addEventListener('show-panel', (e: Event) => {
            const { panel } = (e as CustomEvent).detail;
            if (panel === 'journal') this.loadJournalModule();
            if (panel) this.panels.show(panel);
        });

        document.addEventListener('tab-switched', (e: Event) => {
            const { tabId } = (e as CustomEvent).detail;
            if (tabId === 'strategy') this.loadStrategyModule();
            if (tabId === 'journal')  this.loadJournalModule();
        });

        document.addEventListener('hotkey-panel-switch', (e: Event) => {
            const { panel } = (e as CustomEvent).detail;
            if (panel) this.panels.show(panel);
        });

        document.addEventListener('show-notification', (e: Event) => {
            const { title, message, type } = (e as CustomEvent).detail;
            this.showNotification(title, message, type);
        });

        document.addEventListener('trade-error', (e: Event) => {
            const { message } = (e as CustomEvent).detail;
            this.notifications.error(message || 'Trade execution failed', { title: 'Trade Error' });
        });

        document.addEventListener('hide-panel', () => {
            this.panels.hide();
        });
    }

    // ==================== LAZY LOADERS ====================

    private async loadJournalModule(): Promise<void> {
        if (this.journalInstance || this.journalLoading) return;
        this.journalLoading = true;

        try {
            const { JournalModule } = await import('../journal/journal');
            this.journalInstance = new JournalModule();
            this.journalInstance.initialize();
            console.log('✅ Journal Module lazy loaded');
        } catch (error) {
            console.error('❌ Failed to lazy load journal:', error);
            this.notifications.error('Failed to load journal module', { title: 'Module Error' });
        } finally {
            this.journalLoading = false;
        }
    }

    private async loadStrategyModule(): Promise<void> {
        if (this.strategyInstance || this.strategyLoading) return;
        this.strategyLoading = true;

        try {
            const { StrategyModule } = await import('../strategy/strategy');
            this.strategyInstance = new StrategyModule(
                () => this.connectionManager.getCurrentSymbol(),
                () => this.connectionManager.getCurrentTimeframe()
            );
            console.log('✅ Strategy Module lazy loaded');
        } catch (error) {
            console.error('❌ Failed to lazy load strategy:', error);
            this.notifications.error('Failed to load strategy module', { title: 'Module Error' });
        } finally {
            this.strategyLoading = false;
        }
    }

    // ==================== MODULE INITIALIZATION ====================

    private initializeChartModule(): void {
        try {
            this.chart = new ChartModuleImpl();
            console.log('✅ Chart Module initialized');
        } catch (error) {
            console.error('❌ Failed to initialize chart:', error);
            this.notifications.error('Failed to initialize chart module', { title: 'Module Error' });
        }
    }

    private initializeTradingModule(): void {
        try {
            this.tradingInstance = new TradingModuleClass();
            console.log('✅ Trading Module initialized');
        } catch (error) {
            console.error('❌ Failed to initialize trading:', error);
            this.notifications.error('Failed to initialize trading module', { title: 'Module Error' });
        }
    }

    private initializeNotificationModule(): void {
        try {
            Notification.initialize();
            console.log('✅ Notification Module initialized');
        } catch (error) {
            console.error('❌ Failed to initialize notifications:', error);
        }
    }

    private initializeWatchlistModule(): void {
        try {
            this.watchlistInstance = new WatchlistModule();
            this.watchlistInstance.initialize();
            console.log('✅ Watchlist Module initialized');
        } catch (error) {
            console.error('❌ Failed to initialize watchlist:', error);
        }
    }

    private initializeCalendarModule(): void {
        try {
            this.calendarInstance = new EconomicCalendarModule();
            this.calendarInstance.initialize();
            console.log('✅ Economic Calendar Module initialized');
        } catch (error) {
            console.error('❌ Failed to initialize calendar:', error);
        }
    }

    private initializeAlertsModule(): void {
        try {
            this.alertsInstance = new AlertsModule();
            this.alertsInstance.initialize();
            console.log('✅ Alerts Module initialized');
        } catch (error) {
            console.error('❌ Failed to initialize alerts:', error);
        }
    }

    // ==================== NOTIFICATION HELPER ====================

    public showNotification(
        title:   string,
        message: string,
        type:    'success' | 'error' | 'warning' | 'info' = 'info'
    ): void {
        switch (type) {
            case 'success': this.notifications.success(message, { title }); break;
            case 'error':   this.notifications.error(message, { title });   break;
            case 'warning': this.notifications.warning(message, { title }); break;
            case 'info':    this.notifications.info(message, { title });    break;
        }
    }

    // ==================== GETTERS ====================

    public getChart(): ChartModuleImpl | null                 { return this.chart; }
    public getTradingModule()                                  { return this.tradingInstance; }
    public getJournalModule()                                  { return this.journalInstance; }
    public getStrategyModule()                                 { return this.strategyInstance; }
    public getWatchlistModule(): WatchlistModule | null        { return this.watchlistInstance; }
    public getCalendarModule(): EconomicCalendarModule | null  { return this.calendarInstance; }
    public getAlertsModule(): AlertsModule | null              { return this.alertsInstance; }
    public getConnectionManager(): ConnectionManager           { return this.connectionManager; }
    public getPanelsModule(): typeof Panels                    { return this.panels; }
    public getNotificationModule(): typeof Notification        { return this.notifications; }
}
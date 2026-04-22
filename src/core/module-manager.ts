// ================================================================
// ⚡ MODULE MANAGER - Orchestrator
// Direct wiring — no middlemen on hot path
// Chart ready before WebSocket connects — no race conditions
// ================================================================

import { ChartModule as ChartModuleImpl }      from '../chart/chart-core';
import { ConnectionManager }                   from './connection-manager';
import { TradingModule as TradingModuleClass } from '../trading/trading';
import { Notification }                        from '../notification';
import { Panels }                              from '../panel';
import { WatchlistModule }                     from '../watchlist/watchlist-module';
import { EconomicCalendarModule }              from '../calendar/calendar-module';
import { AlertsModule }                        from '../alerts/alerts-module';
import { JournalMiniModule }                   from '../journal/journal-mini';
import { StrategiesModule }                    from '../strategies/strategy-module';
import { OHLCData }                            from '../chart/chart-types';
import { NotificationPayload, AvailableConfigPayload, AvailableItemData } from '../generated/MegaFlowzDecoder';
import { Severity }                            from '../generated/mega-flowz';

declare global {
    interface Window {}
}

export class ModuleManager {
    private chart:           ChartModuleImpl | null = null;
    private tradingInstance: InstanceType<typeof TradingModuleClass> | null = null;
    private journalInstance: any | null = null;

    private watchlistInstance:   WatchlistModule | null = null;
    private calendarInstance:    EconomicCalendarModule | null = null;
    private alertsInstance:      AlertsModule | null = null;
    private journalMiniInstance: JournalMiniModule | null = null;
    private strategiesInstance:  StrategiesModule | null = null;

    private journalLoading: boolean = false;

    private notifications = Notification;
    private panels        = Panels;

    constructor(private connectionManager: ConnectionManager) {}

    // ==================== INITIALIZATION ====================

    public initialize(): void {
        this.initializeNotificationModule();
        this.initializeChartModule();
        this.initializeTradingModule();
        this.initializeWatchlistModule();
        this.initializeCalendarModule();
        this.initializeAlertsModule();
        this.initializeJournalMiniModule();
        this.initializeStrategiesModule();
        this.setupDOMEventBridge();

        if (this.chart) {
            this.chart.onChartReadyCallback(() => {
                this.wireDirectCallbacks();
                this.connectionManager.connect();
            });
        }
    }

    public destroy(): void {
        this.chart?.destroy();
        this.tradingInstance?.destroy();
        this.journalInstance?.destroy();
        this.journalMiniInstance?.destroy();
        this.watchlistInstance?.destroy();
        this.calendarInstance?.destroy();
        this.alertsInstance?.destroy();
        this.strategiesInstance?.destroy();
        this.notifications.destroy();
    }

    // ================================================================
    // DIRECT CALLBACKS — wired once after chart ready
    // ================================================================

    private wireDirectCallbacks(): void {
        if (!this.chart) return;

        const seriesManager = this.chart.getSeriesManager();
        const dataManager   = this.chart.getDataManager();

        // ── Tick — direct to SeriesManager + TradingModule ──
        this.connectionManager.onTickData((
            symbol, bid, ask, spread, time) =>
        {
            if (symbol !== this.connectionManager.getCurrentSymbol()) return;
            seriesManager?.updateBidAsk(bid, ask);
            this.tradingInstance?.onTick(symbol, bid, ask);
        });

        // ── Bar update — direct to DataManager + SeriesManager ──
        this.connectionManager.onBarUpdate((
            symbol, timeframe, candle) =>
        {
            if (symbol    !== this.connectionManager.getCurrentSymbol())    return;
            if (timeframe !== this.connectionManager.getCurrentTimeframe()) return;

            const ohlc: OHLCData = {
                time:   Number(candle.time),
                open:   candle.open,
                high:   candle.high,
                low:    candle.low,
                close:  candle.close,
                volume: candle.volume
            };

            dataManager.updateOHLCData(ohlc);
            const latest = dataManager.getLatestUpdateForCurrentType();
            if (latest) seriesManager?.updateData(latest);
        });

        // ── Initial burst — direct to DataManager + SeriesManager ──
        this.connectionManager.onCandleData((
            symbol, timeframe, candles) =>
        {
            const currentSymbol    = this.connectionManager.getCurrentSymbol();
            const currentTimeframe = this.connectionManager.getCurrentTimeframe();

            if (symbol !== currentSymbol || timeframe !== currentTimeframe) {
                console.warn(
                    `[CandleData] DISCARDED — stale data for ${symbol} ${timeframe}`
                );
                return;
            }

            const ohlcData: OHLCData[] = candles.map(c => ({
                time:   Number(c.time),
                open:   c.open,
                high:   c.high,
                low:    c.low,
                close:  c.close,
                volume: c.volume
            }));

            dataManager.addOHLCData(ohlcData);
            const converted = dataManager.getDataForCurrentType();
            if (converted.length > 0) {
                seriesManager?.setData(converted);
            }

            this.chart?.setReady();

            this.chart?.handleInitialDataLoaded({
                count:     ohlcData.length,
                symbol,
                timeframe
            });

            document.dispatchEvent(new CustomEvent(
                'chart-initial-data-loaded', {
                    detail: { symbol, timeframe, count: ohlcData.length }
                }
            ));

            this.connectionManager.sendCommand('INITIAL_DATA_RECEIVED');
        });

        // ── Indicator update — direct to IndicatorManager + strategy panel sync ──
        this.connectionManager.onIndicatorUpdate((data) => {
            this.chart?.getIndicatorManager()?.onIndicatorUpdate(data);

            // ── If strategy (2 lines = fast + slow), sync strategies panel ──
            if (data.lines.length > 1) {
                this.strategiesInstance?.addStrategy({
                    id:        data.key,
                    name:      data.label,
                    symbol:    data.symbol,
                    tf:        data.timeframe,
                    status:    'running',
                    pnl:       null,
                    trades:    0,
                    winrate:   null,
                    volume:    0.01,
                    risk:      1.0,
                    iconColor: 'green'
                });
                this.updateStrategiesBadge();
            }
        });

        // ── Watchlist ──
        this.connectionManager.onWatchlistUpdate((
            symbol, bid, ask, spread, time, change) =>
        {
            this.watchlistInstance?.updatePrice(symbol, bid, change);
            if (symbol === this.connectionManager.getCurrentSymbol()) {
                this.tradingInstance?.onTick(symbol, bid, ask);
            }
        });

        // ── Positions ──
        this.connectionManager.onPositionsUpdate((positions) => {
            this.tradingInstance?.updatePositions(positions);
        });

        // ── Account ──
        this.connectionManager.onAccountUpdate((account) => {
            this.tradingInstance?.updateAccountInfo(account);
        });

        // ── Trade executed ──
        this.connectionManager.onTradeExecuted((
            success, direction, symbol,
            volume, price, ticket, timestamp, message) =>
        {
            if (success) {
                this.notifications.success(
                    `Trade ${direction} executed successfully`,
                    { title: 'Trade Executed' }
                );
            } else {
                this.notifications.error(
                    message || 'Trade execution failed',
                    { title: 'Trade Failed' }
                );
            }
            this.tradingInstance?.handleTradeConfirmation();
        });

        // ── Notification ──
        this.connectionManager.onNotification((data: NotificationPayload) => {
            this.handleNotification(data);

            if (data.profit !== undefined && data.profit !== 0 &&
                data.direction && data.symbol && data.volume)
            {
                this.journalMiniInstance?.addTrade({
                    id:        data.ticket ?? Date.now(),
                    pair:      data.symbol,
                    direction: data.direction === 'BUY' ? 'LONG' : 'SHORT',
                    size:      String(data.volume),
                    pnl:       data.profit,
                    result:    data.profit >= 0 ? 'WIN' : 'LOSS',
                    date:      new Date()
                });
            }
        });

        // ── Journal data ──
        this.connectionManager.onJournalData((trades, scope) => {
            const mapped = trades.map((t: any) => ({
                id:        t.ticket ?? t.id,
                pair:      t.symbol,
                direction: t.type === 'BUY' ? 'LONG' : 'SHORT' as 'LONG' | 'SHORT',
                size:      String(t.volume),
                pnl:       t.profit,
                result:    t.profit >= 0 ? 'WIN' : 'LOSS' as 'WIN' | 'LOSS',
                date:      new Date(t.close_time * 1000)
            }));

            if (scope === 'today') {
                this.journalMiniInstance?.setTrades(mapped);
            } else if (scope === 'month') {
                this.journalInstance?.setTrades(mapped);
            }
        });

        // ── Position modified ──
        this.connectionManager.onPositionModified((
            success, ticket, message) =>
        {
            if (success) {
                this.notifications.success(
                    message, { title: 'Position Modified' }
                );
            } else {
                this.notifications.error(
                    message, { title: 'Modify Failed' }
                );
            }
        });

        // ── MT5 status ──
        this.connectionManager.onMT5Status((connected, statusText) => {
            document.dispatchEvent(new CustomEvent(
                'mt5-status-changed', {
                    detail: { connected, statusText }
                }
            ));
        });

        // ── WS connection status ──
        this.connectionManager.onConnectionStatus((status) => {
            document.dispatchEvent(new CustomEvent(
                'chart-connection-status', {
                    detail: { status }
                }
            ));
        });

        // ── Error ──
        this.connectionManager.onError((message) => {
            this.notifications.error(message, { title: 'Error' });
        });

        // ── Auto trading ──
        this.connectionManager.onAutoTrading((enabled, message) => {
            document.dispatchEvent(new CustomEvent(
                'auto_trading_status', {
                    detail: { enabled, message }
                }
            ));
        });

        // ── Available config — populates paramsMap + active strategies on refresh ──
        this.connectionManager.onAvailableConfig((config: AvailableConfigPayload) => {
            document.dispatchEvent(new CustomEvent(
                'available-config-received', {
                    detail: config
                }
            ));

            // ── Populate strategies panel from GET_ACTIVE_STRATEGIES response ──
            // Only maps entries that have symbol + timeframe (real instances, not templates)
            if (config.strategies && config.strategies.length > 0) {
                const instances = config.strategies.filter(
                    (s: AvailableItemData) => s.symbol && s.timeframe
                );
                if (instances.length > 0) {
                    const strategyItems = instances.map((s: AvailableItemData) => ({
                        id:        s.key,
                        name:      s.label,
                        symbol:    s.symbol,
                        tf:        s.timeframe,
                        status:    'running' as const,
                        pnl:       null,
                        trades:    0,
                        winrate:   null,
                        volume:    s.volume || 0.01,
                        risk:      1.0,
                        iconColor: 'green' as const
                    }));
                    this.strategiesInstance?.setStrategies(strategyItems);
                    this.updateStrategiesBadge();
                }
            }
        });

        // ── Strategy data — from explicit onStrategyData backend message ──
        this.connectionManager.onStrategyData((type, data) => {
            if (type === 'list')   this.strategiesInstance?.setStrategies(data);
            if (type === 'update') this.strategiesInstance?.addStrategy(data);
            if (type === 'remove') this.strategiesInstance?.removeStrategyById(data.id);
            this.updateStrategiesBadge();
        });
    }

    // ==================== NOTIFICATION HANDLER ====================

    private handleNotification(data: NotificationPayload): void {
        const parts: string[] = [];

        if (data.direction && data.volume && data.symbol) {
            parts.push(`${data.direction} ${data.volume}L ${data.symbol}`);
        } else if (data.symbol) {
            parts.push(data.symbol);
        }

        if (data.price) parts.push(`@ ${data.price}`);

        if (data.open_price && data.price && data.open_price !== data.price) {
            parts.push(`(open ${data.open_price})`);
        }

        if (data.profit !== 0) {
            const sign = data.profit >= 0 ? '+' : '';
            parts.push(`| P&L: ${sign}$${data.profit.toFixed(2)}`);
        }

        const message = parts.length > 0 ? parts.join(' ') : data.message;
        const title   = data.title || '';

        switch (data.severity) {
            case Severity.Success:
                this.notifications.success(message, { title }); break;
            case Severity.Warning:
                this.notifications.warning(message, { title }); break;
            case Severity.Error:
                this.notifications.error(message, { title });   break;
            case Severity.Info:
            default:
                this.notifications.info(message, { title });    break;
        }
    }

    // ==================== DOM EVENT BRIDGE ====================

    private setupDOMEventBridge(): void {

        document.addEventListener('watchlist-add', (e: Event) => {
            const { symbol } = (e as CustomEvent).detail;
            if (symbol) this.connectionManager.sendCommand(
                `WATCHLIST_ADD_${symbol}`
            );
        });

        document.addEventListener('watchlist-remove', (e: Event) => {
            const { symbol } = (e as CustomEvent).detail;
            if (symbol) this.connectionManager.sendCommand(
                `WATCHLIST_REMOVE_${symbol}`
            );
        });

        document.addEventListener('symbol-changed', (e: Event) => {
            const { symbol } = (e as CustomEvent).detail;
            if (!symbol) return;
            this.connectionManager.setSymbol(symbol);
            this.chart?.handleSymbolChange(symbol);
        });

        document.addEventListener('timeframe-changed', (e: Event) => {
            const { timeframe } = (e as CustomEvent).detail;
            if (!timeframe) return;
            // ── Pass new timeframe to indicator manager before setTimeframe ──
            this.chart?.getIndicatorManager()?.onTimeframeChange(timeframe);
            this.connectionManager.setTimeframe(timeframe);
            this.chart?.handleTimeframeChange(timeframe);
        });

        // ── Resubscribe indicator — timeframe comes from event detail ──
        document.addEventListener('resubscribe-indicator', (e: Event) => {
            const { key, symbol, timeframe, period } = (e as CustomEvent).detail;
            if (!key || !symbol) return;
            const tf = timeframe || this.connectionManager.getCurrentTimeframe();
            this.connectionManager.subscribeIndicator(
                key,
                symbol,
                tf,
                period ?? 0
            );
        });

        document.addEventListener('auto-trade-toggled', (e: Event) => {
            const { enabled } = (e as CustomEvent).detail;
            this.connectionManager.setAutoTrading(enabled);
            if (enabled) {
                this.notifications.success(
                    'Auto trading is now active',
                    { title: 'Auto Trading Enabled' }
                );
            } else {
                this.notifications.warning(
                    'Auto trading has been disabled',
                    { title: 'Auto Trading Disabled' }
                );
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
                this.connectionManager.executeTrade(
                    direction, symbol, volume, price,
                    tp ?? null, sl ?? null
                );
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

        // ── Add indicator — subscribe to backend ──
        document.addEventListener('add-indicator', (e: Event) => {
            const { type } = (e as CustomEvent).detail;
            if (!type || type === 'VOLUME') return;
            this.connectionManager.subscribeIndicator(
                type,
                this.connectionManager.getCurrentSymbol(),
                this.connectionManager.getCurrentTimeframe()
            );
        });

        // ── Deploy strategy — send to backend ──
        document.addEventListener('deploy-strategy', (e: Event) => {
            const { strategyType, symbol, timeframe, params } =
                (e as CustomEvent).detail;
            if (!strategyType) return;
            const sym = symbol    || this.connectionManager.getCurrentSymbol();
            const tf  = timeframe || this.connectionManager.getCurrentTimeframe();
            this.connectionManager.deployStrategy(
                strategyType, sym, tf, params || {}
            );
        });

        // ── Remove strategy ──
        document.addEventListener('remove-strategy', (e: Event) => {
            const { strategyType, symbol, timeframe } = (e as CustomEvent).detail;
            if (!strategyType) return;
            const sym = symbol    || this.connectionManager.getCurrentSymbol();
            const tf  = timeframe || this.connectionManager.getCurrentTimeframe();

            // ── Remove from backend ──
            this.connectionManager.removeStrategy(strategyType, sym, tf);

            // ── Remove from chart — full pool id ──
            const fullId = `${strategyType}_${sym}_${tf}`;
            this.chart?.getIndicatorManager()?.removeStrategyFromChart(fullId);

            this.updateStrategiesBadge();
        });

        // ── Update strategy ──
        document.addEventListener('update-strategy', (e: Event) => {
            const { strategyId, updates } = (e as CustomEvent).detail;
            if (strategyId && updates)
                this.connectionManager.updateStrategy(strategyId, updates);
        });

        // ── Remove indicator — backend unsubscribe ──
        document.addEventListener('indicator-removed', (e: Event) => {
            const { key, symbol, timeframe } = (e as CustomEvent).detail;
            if (key && symbol && timeframe) {
                this.connectionManager.unsubscribeIndicator(
                    key, symbol, timeframe
                );
            }
        });

        document.addEventListener('get-active-strategies', () => {
            this.connectionManager.getActiveStrategies();
        });

        document.addEventListener('backtest-strategy', (e: Event) => {
            const { strategyType, symbol, timeframe, days, params } =
                (e as CustomEvent).detail;
            if (strategyType && symbol && timeframe && days) {
                this.connectionManager.backtestStrategy(
                    strategyType, symbol, timeframe, days, params || {}
                );
            }
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
            if (tabId === 'journal') this.loadJournalModule();
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
            this.notifications.error(
                message || 'Trade execution failed',
                { title: 'Trade Error' }
            );
        });

        document.addEventListener('hide-panel', () => {
            this.panels.hide();
        });

        document.addEventListener('journal-month-changed', (e: Event) => {
            const { year, month } = (e as CustomEvent).detail;
            if (year && month !== undefined) {
                this.connectionManager.getJournalMonth(year, month);
            }
        });

        document.addEventListener('symbol-search-request', (e: Event) => {
            const { query } = (e as CustomEvent).detail;
            if (query) this.connectionManager.searchSymbols(query);
        });
    }

    // ==================== LAZY LOADERS ====================

    private async loadJournalModule(): Promise<void> {
        if (this.journalLoading) return;

        if (this.journalInstance) {
            const now = new Date();
            this.connectionManager.getJournalMonth(
                now.getFullYear(),
                now.getMonth() + 1
            );
            return;
        }

        this.journalLoading = true;
        try {
            const { JournalModule } = await import('../journal/journal');
            this.journalInstance = new JournalModule();
            this.journalInstance.mount();

            const now = new Date();
            this.connectionManager.getJournalMonth(
                now.getFullYear(),
                now.getMonth() + 1
            );
        } catch (error) {
            this.notifications.error(
                'Failed to load journal module',
                { title: 'Module Error' }
            );
        } finally {
            this.journalLoading = false;
        }
    }

    // ==================== MODULE INITIALIZATION ====================

    private initializeChartModule(): void {
        try {
            this.chart = new ChartModuleImpl();
        } catch (error) {
            this.notifications.error(
                'Failed to initialize chart module',
                { title: 'Module Error' }
            );
        }
    }

    private initializeTradingModule(): void {
        try {
            this.tradingInstance = new TradingModuleClass();
        } catch (error) {
            this.notifications.error(
                'Failed to initialize trading module',
                { title: 'Module Error' }
            );
        }
    }

    private initializeNotificationModule(): void {
        try {
            Notification.initialize();
        } catch (error) {}
    }

    private initializeWatchlistModule(): void {
        try {
            this.watchlistInstance = new WatchlistModule(
                this.connectionManager
            );
            this.watchlistInstance.initialize();
        } catch (error) {
            this.notifications.error(
                'Failed to initialize watchlist',
                { title: 'Module Error' }
            );
        }
    }

    private initializeCalendarModule(): void {
        try {
            this.calendarInstance = new EconomicCalendarModule();
            this.calendarInstance.initialize();
        } catch (error) {}
    }

    private initializeAlertsModule(): void {
        try {
            this.alertsInstance = new AlertsModule();
            this.alertsInstance.initialize();
        } catch (error) {}
    }

    private initializeJournalMiniModule(): void {
        try {
            this.journalMiniInstance = new JournalMiniModule();
            this.journalMiniInstance.initialize();
        } catch (error) {}
    }

    private initializeStrategiesModule(): void {
        try {
            this.strategiesInstance = new StrategiesModule();
            this.strategiesInstance.initialize();
        } catch (error) {}
    }

    // ==================== STRATEGIES BADGE ====================

    private updateStrategiesBadge(): void {
        const badge = document.getElementById('strategiesBadge');
        if (badge) badge.textContent = String(this.strategiesInstance?.getCount() ?? 0);
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

    public getChart(): ChartModuleImpl | null                { return this.chart; }
    public getTradingModule()                                 { return this.tradingInstance; }
    public getJournalModule()                                 { return this.journalInstance; }
    public getJournalMiniModule(): JournalMiniModule | null   { return this.journalMiniInstance; }
    public getWatchlistModule(): WatchlistModule | null       { return this.watchlistInstance; }
    public getCalendarModule(): EconomicCalendarModule | null { return this.calendarInstance; }
    public getAlertsModule(): AlertsModule | null             { return this.alertsInstance; }
    public getStrategiesModule(): StrategiesModule | null     { return this.strategiesInstance; }
    public getConnectionManager(): ConnectionManager          { return this.connectionManager; }
    public getPanelsModule(): typeof Panels                   { return this.panels; }
    public getNotificationModule(): typeof Notification       { return this.notifications; }
}

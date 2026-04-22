// ================================================================
// ⚡ CHART CORE - Orchestrator
// ================================================================

import { MainChart }          from './chart-engine/index';
import { ChartLegend }        from './legend/index';
import { ChartDataManager }   from './chart-data-manager';
import { ChartDrawingModule } from './drawingtools/index';
import { UserPriceAlerts }    from './price-alerts';
import { getDecimalPrecision,
         getPriceFormatter }  from './chart-utils';
import { ChartUI }            from './ui/chart-ui';
import { ChartContextMenu }   from './ui/context-menu';
import { ChartSettingsModal } from './ui/chart-settings-modal';
import { DrawingToolsConfig,
         LegendItem }         from './chart-types';
import { IndicatorManager }   from './indicator/index';

export class ChartModule {
    private mainChart:        MainChart;
    private chartDataManager: ChartDataManager;
    private chartContainer:   HTMLElement | null = null;
    private drawingModule:    ChartDrawingModule | null = null;
    private chartLegend:      ChartLegend | null = null;
    private priceAlerts:      UserPriceAlerts | null = null;
    private chartUI:          ChartUI | null = null;
    private contextMenu:      ChartContextMenu | null = null;
    private resizeObserver:   ResizeObserver | null = null;

    private indicatorManager: IndicatorManager | null = null;

    private abortController: AbortController | null = null;

    private _currentSymbol:    string;
    private _currentTimeframe: string;

    public get currentSymbol(): string    { return this._currentSymbol; }
    public get currentTimeframe(): string { return this._currentTimeframe; }

    private visibilityMap: Map<string, boolean> = new Map();

    private _onChartReadyCb: (() => void) | null = null;

    constructor() {
        this._currentSymbol    = localStorage.getItem('last_symbol')    || 'EURUSD';
        this._currentTimeframe = localStorage.getItem('last_timeframe') || 'H1';

        this.chartDataManager = new ChartDataManager();
        this.mainChart = new MainChart(
            this._currentSymbol,
            this._currentTimeframe,
            this.chartDataManager
        );

        this.mainChart.onChartReady = () => {
            this.onChartReady();
            if (this._onChartReadyCb) this._onChartReadyCb();
        };

        this.mainChart.onInitialDataLoaded = (detail) => {
            this.handleInitialDataLoaded(detail);
        };

        this.mainChart.onSymbolChange = (symbol) => {
            this._currentSymbol = symbol;
            document.dispatchEvent(new CustomEvent('symbol-changed', {
                detail: { symbol }
            }));
        };

        this.mainChart.onTimeframeChange = (timeframe) => {
            this._currentTimeframe = timeframe;
            document.dispatchEvent(new CustomEvent('timeframe-changed', {
                detail: { timeframe }
            }));
        };

        this.mainChart.onVolumeUpdate = (volume, isBullish) => {
            if (this.chartLegend) {
                this.chartLegend.updateVolume(volume, isBullish);
            }
        };

        this.mainChart.onVolumeToggle = (visible: boolean) => {
            if (this.chartLegend) {
                this.chartLegend.update({ volumeVisible: visible });
            }
        };

        this.mainChart.onSeriesDataReady = () => {
            this.drawingModule?.onDataReady();
        };

        this.mainChart.onBeforeSeriesRemoved = () => {
            this.drawingModule?.clearToolsOnly();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded',
                () => this.initialize()
            );
        } else {
            this.initialize();
        }
    }

    // ================================================================
    // CHART READY CALLBACK
    // ================================================================

    public onChartReadyCallback(cb: () => void): void {
        this._onChartReadyCb = cb;
    }

    // ================================================================
    // DIRECT ACCESS
    // ================================================================

    public getSeriesManager(): any {
        return this.mainChart.getSeriesManager();
    }

    public getDataManager(): ChartDataManager {
        return this.chartDataManager;
    }

    public getIndicatorManager(): IndicatorManager | null {
        return this.indicatorManager;
    }

    public setReady(): void {
        this.mainChart.setReady();
    }

    // ================================================================
    // INITIAL DATA LOADED
    // ================================================================

    public handleInitialDataLoaded(detail: any): void {
        if (detail.symbol &&
            detail.symbol !== this._currentSymbol)
        {
            this._currentSymbol = detail.symbol;
        }

        if (this.chartLegend) {
            this.chartLegend.update({
                symbol:    this._currentSymbol,
                timeframe: this._currentTimeframe
            });
        }

        if (this.chartUI) {
            this.chartUI.updateSymbol(this._currentSymbol);
        }
    }

    // ==================== INITIALIZATION ====================

    private initialize(): void {
        try {
            this.chartContainer = document.getElementById('tvChart');
            if (!this.chartContainer) return;
            this.setupEventListeners();
            this.setupResizeObserver();
            this.loadChart();
        } catch (error) {}
    }

    private async loadChart(): Promise<void> {
        if (!this.chartContainer) return;
        if (!this.mainChart.getChart()) {
            await this.mainChart.loadChart(this.chartContainer);
        }
    }

    private setupResizeObserver(): void {
        if (!this.chartContainer) return;

        let resizeTimer: ReturnType<typeof setTimeout> | null = null;

        this.resizeObserver = new ResizeObserver(() => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const chart = this.mainChart.getChart();
                if (chart && this.chartContainer) {
                    chart.resize(
                        this.chartContainer.clientWidth,
                        this.chartContainer.clientHeight,
                        true
                    );
                }
            }, 50);
        });

        this.resizeObserver.observe(this.chartContainer);
    }

    // ==================== CHART READY ====================

    private onChartReady(): void {
        this.initializeLegend();
        this.initializeDrawingModule();
        this.initializePriceAlerts();
        this.initializeChartUI();
        this.initializeContextMenu();
        this.initializeIndicatorManager();
        this.setupCrosshairTracking();

        ChartSettingsModal.restoreActiveTemplate();

        document.dispatchEvent(new CustomEvent('chart-ready', {
            detail: {
                symbol:        this._currentSymbol,
                timeframe:     this._currentTimeframe,
                volumeVisible: this.mainChart.isVolumeVisible()
            }
        }));
    }

    // ==================== MODULE INITIALIZATION ====================

    private initializeLegend(): void {
        if (!this.chartContainer) return;
        this.chartLegend = new ChartLegend(this.chartContainer);
        this.chartLegend.initialize();
        this.chartLegend.update({
            symbol:        this._currentSymbol,
            timeframe:     this._currentTimeframe,
            precision:     getDecimalPrecision(this._currentSymbol),
            volumeVisible: this.mainChart.isVolumeVisible()
        });
    }

    private async initializeDrawingModule(): Promise<void> {
        const chart  = this.mainChart.getChart();
        const series = this.mainChart.getSeries();
        if (!chart || !series) return;

        const config: DrawingToolsConfig = {
            precision:      getDecimalPrecision(this._currentSymbol),
            showLabels:     true,
            priceFormatter: getPriceFormatter(this._currentSymbol)
        };

        this.drawingModule = new ChartDrawingModule(
            chart, series, config,
            undefined,
            this._currentSymbol,
            this._currentTimeframe
        );

        await this.drawingModule.initialize();
    }

    private initializePriceAlerts(): void {
        const series = this.mainChart.getSeries();
        if (!series) return;

        try {
            this.priceAlerts = null;
            this.priceAlerts = new UserPriceAlerts();
            this.priceAlerts.setSymbolName(this._currentSymbol);
            series.attachPrimitive(this.priceAlerts);
        } catch (error) {}
    }

    private initializeChartUI(): void {
        this.chartUI = new ChartUI(
            {
                onSymbolChange:    (symbol)    => this.handleSymbolChange(symbol),
                onTimeframeChange: (timeframe) => this.handleTimeframeChange(timeframe),
                onChartTypeChange: (chartType) => this.handleChartTypeChange(chartType)
            },
            this._currentSymbol,
            this._currentTimeframe,
            this.mainChart.currentChartType
        );
        this.chartUI.initialize();
    }

    private initializeContextMenu(): void {
        this.contextMenu = new ChartContextMenu();
    }

    private initializeIndicatorManager(): void {
        if (this.indicatorManager) return;

        try {
            const chart = this.mainChart.getChart();
            if (!chart) return;

            this.indicatorManager = new IndicatorManager();
            this.indicatorManager.setMainChart(this.mainChart);
            this.indicatorManager.setChart(chart);
            this.indicatorManager.setSymbol(this._currentSymbol);
            this.indicatorManager.initialize();

            this.indicatorManager.onPaneCreated = async (pane: any) => {
                if (this.chartLegend) {
                    await this.chartLegend.createPaneLegend(pane);
                }
            };
        } catch (error) {}
    }

    // ==================== CROSSHAIR ====================

    private setupCrosshairTracking(): void {
        const chart  = this.mainChart.getChart();
        const series = this.mainChart.getSeries();
        if (!chart || !series) return;

        let lastUpdateTime: number = 0;
        const THROTTLE_MS = 16;

        chart.subscribeCrosshairMove((param: any) => {
            if (!param.time || !param.point) {
                if (this.drawingModule) {
                    this.drawingModule.onCrosshairMove(param);
                }
                return;
            }

            const now = Date.now();
            if (now - lastUpdateTime < THROTTLE_MS) return;
            lastUpdateTime = now;

            const ohlc = this.chartDataManager.getOHLCAtTime(
                param.time as number
            );
            if (ohlc && this.chartLegend) {
                this.chartLegend.updateOHLC(
                    ohlc.open, ohlc.high, ohlc.low, ohlc.close
                );
            }

            if (this.drawingModule) {
                this.drawingModule.onCrosshairMove(param);
            }
        });
    }

    // ==================== CALLED BY MODULE MANAGER ====================

    public handleSymbolChange(symbol: string): void {
        if (this._currentSymbol === symbol) return;
        this._currentSymbol = symbol;
        this.mainChart.handleSymbolChange(symbol);
        this.visibilityMap.clear();

        this.indicatorManager?.setSymbol(symbol);
        this.indicatorManager?.onSymbolChange(symbol);

        if (this.chartLegend) {
            this.chartLegend.update({
                symbol,
                precision: getDecimalPrecision(symbol)
            });
        }
        if (this.chartUI) this.chartUI.updateSymbol(symbol);

        this.drawingModule?.onSymbolChange(symbol);
        this.drawingModule?.updateConfig({
            precision:      getDecimalPrecision(symbol),
            priceFormatter: getPriceFormatter(symbol)
        });
    }

    public handleTimeframeChange(timeframe: string): void {
        if (this._currentTimeframe === timeframe) return;
        this._currentTimeframe = timeframe;
        this.mainChart.handleTimeframeChange(timeframe);
        this.visibilityMap.clear();

        if (this.chartLegend) {
            this.chartLegend.update({ timeframe });
        }
        if (this.chartUI) this.chartUI.updateTimeframe(timeframe);

        this.drawingModule?.onTimeframeChange(timeframe);
    }

    public handleChartTypeChange(newChartType: string): void {
        if (this.mainChart.currentChartType === newChartType) return;

        this.drawingModule?.beginChartTypeSwitch();
        this.drawingModule?.saveDrawings();
        this.mainChart.setChartType(newChartType);

        const newSeries = this.mainChart.getSeries();
        if (this.drawingModule && newSeries) {
            this.drawingModule.updateSeries(newSeries);
        }
        this.drawingModule?.endChartTypeSwitch();

        this.initializePriceAlerts();
        if (this.chartUI) this.chartUI.updateChartType(newChartType);
    }

    public setDrawingState(isActive: boolean): void {
        if (!this.drawingModule) return;
        if (isActive) this.drawingModule.activateDrawingMode();
        else          this.drawingModule.deactivateDrawingMode();
    }

    public setSelectionState(isActive: boolean): void {
        if (!this.drawingModule) return;
        if (isActive) this.drawingModule.activateSelectionMode();
        else          this.drawingModule.deactivateSelectionMode();
    }

    // ==================== DOWNLOAD ====================

    private triggerChartDownload(): void {
        const dataUrl = this.mainChart.downloadChart();
        if (dataUrl) {
            const link      = document.createElement('a');
            link.download   = `chart-${this._currentSymbol}-${this._currentTimeframe}-${new Date().toISOString().split('T')[0]}.png`;
            link.href       = dataUrl;
            link.click();
        }
    }

    // ==================== EVENT LISTENERS ====================

    private setupEventListeners(): void {
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        document.addEventListener('chart-reset-request',
            () => this.mainChart.resetView(), { signal });
        document.addEventListener('chart-download-request',
            () => this.triggerChartDownload(), { signal });
        document.addEventListener('chart-toggle-grid',
            () => this.mainChart.toggleGrid(), { signal });
        document.addEventListener('chart-toggle-crosshair',
            () => this.mainChart.toggleCrosshair(), { signal });
        document.addEventListener('chart-toggle-timescale',
            () => this.mainChart.toggleTimeScale(), { signal });
        document.addEventListener('chart-toggle-grid-vertical',
            () => this.mainChart.toggleGridVertical(), { signal });
        document.addEventListener('chart-toggle-grid-horizontal',
            () => this.mainChart.toggleGridHorizontal(), { signal });

        document.addEventListener('chart-toggle-volume', async () => {
            await this.mainChart.toggleVolume();
        }, { signal });

        document.addEventListener('chart-type-changed', (e: Event) => {
            const { chartType } = (e as CustomEvent).detail;
            if (chartType) this.handleChartTypeChange(chartType);
        }, { signal });

        document.addEventListener('hotkey-global-action', (e: Event) => {
            const { action } = (e as CustomEvent).detail;
            switch (action) {
                case 'fullscreen':
                    this.toggleFullscreen();
                    break;
                case 'chart-reset':
                    this.mainChart.resetView();
                    break;
                case 'chart-download':
                    this.triggerChartDownload();
                    break;
                case 'open-settings-modal':
                    if (document.getElementById('settingsOverlay')) {
                        document.dispatchEvent(
                            new CustomEvent('close-settings-modal')
                        );
                    } else {
                        document.dispatchEvent(
                            new CustomEvent('chart-settings-modal-request')
                        );
                    }
                    break;
            }
        }, { signal });

        document.addEventListener('chart-start-drawing', (e: Event) => {
            const { toolType } = (e as CustomEvent).detail;
            if (toolType) this.drawingModule?.startDrawing(toolType);
        }, { signal });

        document.addEventListener('chart-clear-drawings', () => {
            this.drawingModule?.clearAllDrawings();
        }, { signal });

        document.addEventListener('chart-connection-status', (e: Event) => {
            const { status } = (e as CustomEvent).detail;
            if (status && this.chartLegend) {
                this.chartLegend.updateConnectionStatus(status);
            }
        }, { signal });

        document.addEventListener('mt5-status-changed', (e: Event) => {
            const { connected } = (e as CustomEvent).detail;
            if (this.chartLegend) {
                this.chartLegend.updateConnectionStatus(
                    connected ? 'connected' : 'disconnected'
                );
            }
        }, { signal });

        document.addEventListener('chart-settings-modal-request', () => {
            const modal = new ChartSettingsModal({
                colors:    this.mainChart.getColors(),
                chartType: this.mainChart.currentChartType,
                symbol:    this._currentSymbol
            });
            modal.open();
        }, { signal });

        document.addEventListener('chart-colors-change', (e: Event) => {
            const { colors } = (e as CustomEvent).detail;
            this.mainChart.updateChartColors(colors);
        }, { signal });

        document.addEventListener('chart-scale-change', (e: Event) => {
            this.mainChart.applyScaleOptions((e as CustomEvent).detail);
        }, { signal });

        document.addEventListener('chart-scale-margins', (e: Event) => {
            const { top, bottom } = (e as CustomEvent).detail;
            this.mainChart.applyScaleMargins(top, bottom);
        }, { signal });

        document.addEventListener('chart-scale-position', (e: Event) => {
            const { position } = (e as CustomEvent).detail;
            this.mainChart.applyScalePosition(position);
        }, { signal });

        document.addEventListener('chart-font-size', (e: Event) => {
            const { size } = (e as CustomEvent).detail;
            this.mainChart.applyFontSize(size);
        }, { signal });

        document.addEventListener('chart-crosshair-style', (e: Event) => {
            const { style } = (e as CustomEvent).detail;
            this.mainChart.applyCrosshairStyle(style);
        }, { signal });

        document.addEventListener('chart-bar-spacing', (e: Event) => {
            const { spacing } = (e as CustomEvent).detail;
            if (spacing !== undefined) this.mainChart.applyBarSpacing(spacing);
        }, { signal });

        document.addEventListener('chart-time-visible', (e: Event) => {
            const { visible } = (e as CustomEvent).detail;
            if (visible !== undefined) this.mainChart.applyTimeVisible(visible);
        }, { signal });

        document.addEventListener('chart-watermark', (e: Event) => {
            const { visible, color } = (e as CustomEvent).detail;
            if (visible !== undefined)
                this.mainChart.applyWatermark(visible, color);
        }, { signal });

        document.addEventListener('chart-setting-toggle', (e: Event) => {
            const { key, value } = (e as CustomEvent).detail;
            if (key === 'showBid') this.mainChart.toggleBidAsk('bid', value);
            if (key === 'showAsk') this.mainChart.toggleBidAsk('ask', value);
        }, { signal });

        document.addEventListener('indicator-added', (e: Event) => {
            const item = (e as CustomEvent).detail as LegendItem;
            if (item && this.chartLegend) {
                this.chartLegend.addItem(item);
            }
        }, { signal });

        document.addEventListener('indicator-value-update', (e: Event) => {
            const { id, values } = (e as CustomEvent).detail;
            if (!this.chartLegend) return;
            if (values) this.chartLegend.updateItemValues(id, values);
        }, { signal });

        document.addEventListener('indicator-name-update', (e: Event) => {
            const { id, name } = (e as CustomEvent).detail;
            if (this.chartLegend) {
                this.chartLegend.updateItemName(id, name);
            }
        }, { signal });

        document.addEventListener('indicator-id-updated', (e: Event) => {
            const { oldId, newId } = (e as CustomEvent).detail;
            if (oldId && newId) this.chartLegend?.updateItemId(oldId, newId);
        }, { signal });

        document.addEventListener('legend-item-settings', (e: Event) => {
            const { id, triggerRect } = (e as CustomEvent).detail;
            if (!id) return;

            const item = this.chartLegend?.getItem(id);
            if (!item) return;

            const key    = id.split('_')[0];
            const config = this.chartUI?.getConfigByKey(key);

            // ── Merge config with existing settings — existing period override wins ──
            if (config) {
                item.settings = {
                    ...config,
                    ...item.settings
                };
            }

            // ── Attach saved line settings so modal seeds correctly ──
            const saved = this.indicatorManager?.getSavedSettings(key);
            if (saved) {
                const savedLines: Record<string, any> = {};
                saved.forEach((v, k) => { savedLines[k] = v; });
                item.settings = { ...item.settings, savedLines };
            }

            import('./ui/indicator-settings-modal').then(
                ({ IndicatorSettingsModal }) => {
                    new IndicatorSettingsModal(item, triggerRect).open();
                }
            );
        }, { signal });

        document.addEventListener('legend-item-toggle', (e: Event) => {
            const { id } = (e as CustomEvent).detail;
            if (!id) return;
            this.indicatorManager?.toggleVisibility(id);
            const visible = this.toggleVisibilityState(id);
            if (this.chartLegend) {
                this.chartLegend.setItemVisible(id, visible);
            }
        }, { signal });

        // ── Legend item remove — handles both indicators and strategies ──
        document.addEventListener('legend-item-remove', async (e: Event) => {
            const { id } = (e as CustomEvent).detail;
            console.log('🔵 LEGEND REMOVE ID:', id);  // ADDED CONSOLE LOG
            
            if (!id) return;

            if (id === 'volume') {
                await this.mainChart.toggleVolume();
                return;
            }

            // Check if this is a strategy by looking it up in chartLegend
            const item = this.chartLegend?.getItem(id);
            if (item?.icon === 'fa-robot') {
                // Strategy - dispatch remove-strategy event
                const parts = id.split('_');
                // id format: STRATEGYKEY_SYMBOL_TIMEFRAME
                // Example: EMA_CROSS_BTCUSDm_M15
                const strategyType = parts[0];      // EMA_CROSS
                const symbol       = parts[1];      // BTCUSDm
                const timeframe    = parts[2];      // M15
                
                console.log('🔵 REMOVE STRATEGY - parsed:', { strategyType, symbol, timeframe });
                
                document.dispatchEvent(new CustomEvent('remove-strategy', {
                    detail: { strategyType, symbol, timeframe }
                }));
            } else {
                // Indicator - normal removal
                this.indicatorManager?.removeIndicator(id);
            }
        }, { signal });

        document.addEventListener('add-indicator', async (e: Event) => {
            const { type } = (e as CustomEvent).detail;
            if (!type) return;
            if (type === 'VOLUME') {
                await this.mainChart.toggleVolume();
                return;
            }
        }, { signal });

        document.addEventListener('deploy-strategy', async (e: Event) => {
        }, { signal });
    }

    // ==================== FULLSCREEN ====================

    private toggleFullscreen(): void {
        const chartContainer = document.getElementById('tvChart');
        if (!chartContainer) return;

        if (!document.fullscreenElement) {
            if (chartContainer.requestFullscreen) {
                chartContainer.requestFullscreen();
            } else if ((chartContainer as any).webkitRequestFullscreen) {
                (chartContainer as any).webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            }
        }
    }

    // ==================== VISIBILITY TRACKING ====================

    private toggleVisibilityState(id: string): boolean {
        const current = this.visibilityMap.get(id) ?? true;
        const next    = !current;
        this.visibilityMap.set(id, next);
        return next;
    }

    // ==================== PUBLIC API ====================

    public startDrawing(toolType: string): void {
        this.drawingModule?.startDrawing(toolType);
    }

    public clearAllDrawings(): void {
        this.drawingModule?.clearAllDrawings();
    }

    public removeSelectedDrawings(): void {
        this.drawingModule?.removeSelectedDrawings();
    }

    public exportDrawings(): string {
        return this.drawingModule
            ? this.drawingModule.exportDrawings() : '[]';
    }

    public importDrawings(json: string): void {
        this.drawingModule?.importDrawings(json);
    }

    public getChart(): any                               { return this.mainChart.getChart(); }
    public getDrawingModule(): ChartDrawingModule | null { return this.drawingModule; }
    public getLineTools(): any                           { return this.drawingModule ? this.drawingModule.getLineTools() : null; }
    public isReady(): boolean                            { return this.mainChart.isReady(); }
    public isVolumeVisible(): boolean                    { return this.mainChart.isVolumeVisible(); }

    // ==================== DESTROY ====================

    public async destroy(): Promise<void> {
        this.abortController?.abort();
        this.abortController = null;
        this._onChartReadyCb = null;

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.contextMenu) {
            this.contextMenu.destroy();
            this.contextMenu = null;
        }
        if (this.chartUI) {
            this.chartUI.destroy();
            this.chartUI = null;
        }
        if (this.drawingModule) {
            this.drawingModule.destroy();
            this.drawingModule = null;
        }
        if (this.chartLegend) {
            this.chartLegend.destroy();
            this.chartLegend = null;
        }
        if (this.indicatorManager) {
            await this.indicatorManager.destroy();
            this.indicatorManager = null;
        }

        if (this.chartDataManager) this.chartDataManager.clear();

        this.mainChart.destroy();
    }
}
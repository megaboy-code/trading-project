// ================================================================
// ⚡ MAIN CHART - Internal Orchestrator 
// ================================================================

import { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import { ChartDataManager } from '../chart-data-manager';
import { ChartInstance } from './chart-instance';
import { ChartStateManager } from './chart-state';
import { SeriesManager } from './series-manager';
import { OHLCData, ChartColors } from '../chart-types';

export interface InitialDataParams {
    data:       OHLCData[];
    symbol?:    string;
    timeframe?: string;
}

export interface UpdateDataParams {
    data:       OHLCData;
    symbol?:    string;
    timeframe?: string;
}

export class MainChart {
    private chartInstance:  ChartInstance;
    private stateManager:   ChartStateManager;
    private seriesManager:  SeriesManager;
    private dataManager:    ChartDataManager;

    // ==================== LAZY MODULES ====================
    private paneManager:   any | null = null;
    private volumeManager: any | null = null;

    private paneLoading:   boolean = false;
    private volumeLoading: boolean = false;
    private _destroyed:    boolean = false;

    private _currentSymbol:    string;
    private _currentTimeframe: string;

    public currentChartType: string = 'candlestick';
    private volumeVisible:   boolean = false;

    // ==================== CALLBACKS ====================
    public onChartReady:          (() => void) | null = null;
    public onInitialDataLoaded:   ((detail: any) => void) | null = null;
    public onPriceUpdate:         ((price: number) => void) | null = null;
    public onSymbolChange:        ((symbol: string) => void) | null = null;
    public onTimeframeChange:     ((timeframe: string) => void) | null = null;
    public onStateChange:         ((state: string) => void) | null = null;
    public onVolumeUpdate:        ((volume: number, isBullish: boolean) => void) | null = null;
    public onVolumeToggle:        ((visible: boolean) => void) | null = null;
    public onSeriesDataReady:     (() => void) | null = null;
    public onBeforeSeriesRemoved: (() => void) | null = null;

    public get currentSymbol(): string    { return this._currentSymbol; }
    public get currentTimeframe(): string { return this._currentTimeframe; }

    constructor(
        symbol:            string,
        timeframe:         string,
        sharedDataManager: ChartDataManager
    ) {
        this._currentSymbol    = symbol;
        this._currentTimeframe = timeframe;
        this.dataManager       = sharedDataManager;
        this.dataManager.setChartType(this.currentChartType as any);

        this.chartInstance = new ChartInstance(symbol);
        this.stateManager  = new ChartStateManager();

        this.seriesManager = new SeriesManager(
            {
                bull:       this.chartInstance.getColors().bull,
                bear:       this.chartInstance.getColors().bear,
                line:       this.chartInstance.getColors().line,
                wickBull:   this.chartInstance.getColors().wickBull,
                wickBear:   this.chartInstance.getColors().wickBear,
                borderBull: this.chartInstance.getColors().borderBull,
                borderBear: this.chartInstance.getColors().borderBear,
            },
            symbol
        );

        this.seriesManager.onDataReady = () => {
            this.onSeriesDataReady?.();
        };

        this.seriesManager.onBeforeSeriesRemoved = () => {
            this.onBeforeSeriesRemoved?.();
        };

        this.stateManager.onStateChange((state) => {
            if (this.onStateChange) this.onStateChange(state);
        });

        this.loadVolumeState();
    }

    // ==================== LAZY LOADERS ====================

    private async loadVolumeManager(): Promise<void> {
        if (this.volumeManager || this.volumeLoading) return;
        this.volumeLoading = true;

        try {
            const { VolumeManager } = await import('./volume-manager');

            if (this._destroyed) return;

            this.volumeManager = new VolumeManager({
                bull: this.chartInstance.getColors().volumeBull,
                bear: this.chartInstance.getColors().volumeBear
            });

            const chart = this.chartInstance.getChart();
            if (chart) this.volumeManager.setChart(chart);

            this.volumeManager.onVolumeUpdate = (volume: number, isBullish: boolean) => {
                if (this.onVolumeUpdate) this.onVolumeUpdate(volume, isBullish);
            };

            this.volumeManager.setTimeframe(this._currentTimeframe);

        } catch (error) {
            console.error('❌ Failed to load Volume Manager:', error);
        } finally {
            this.volumeLoading = false;
        }
    }

    private async loadPaneManager(): Promise<void> {
        if (this.paneManager || this.paneLoading) return;
        this.paneLoading = true;

        try {
            const { PaneManager } = await import('./pane-manager');

            if (this._destroyed) return;

            this.paneManager = new PaneManager();

            const chart = this.chartInstance.getChart();
            if (chart) this.paneManager.setChart(chart);

        } catch (error) {
            console.error('❌ Failed to load Pane Manager:', error);
        } finally {
            this.paneLoading = false;
        }
    }

    // ==================== SYMBOL / TIMEFRAME ====================

    public handleSymbolChange(symbol: string): void {
        if (this._currentSymbol === symbol) return;
        this._currentSymbol = symbol;
        this.chartInstance.updateSymbol(symbol);
        this.seriesManager.setSymbol(symbol);
        this.resetChartDataState();
        if (this.onSymbolChange) this.onSymbolChange(symbol);
    }

    public handleTimeframeChange(timeframe: string): void {
        if (this._currentTimeframe === timeframe) return;
        this._currentTimeframe = timeframe;
        this.volumeManager?.setTimeframe(timeframe);
        this.resetChartDataState();
        if (this.onTimeframeChange) this.onTimeframeChange(timeframe);
    }

    // ==================== LOAD CHART ====================

    public async loadChart(container: HTMLElement): Promise<void> {
        this.stateManager.setContainer(container);
        this.stateManager.setState('LOADING');

        try {
            const chart = await this.chartInstance.create(container);
            if (!chart) throw new Error('Failed to create chart');

            this.seriesManager.setChart(chart);
            const series = this.seriesManager.createSeries(this.currentChartType);

            if (this.volumeVisible && series) {
                await this.loadVolumeManager();
                if (!this._destroyed) {
                    this.volumeManager?.createSeries(series);
                }
            }

            if (this._destroyed) return;

            this.stateManager.setState('READY');

            if (this.onChartReady) this.onChartReady();

        } catch (error) {
            console.error('❌ Failed to load chart:', error);
            this.stateManager.setState('IDLE');
        }
    }

    // ==================== CHART TYPE ====================

    public setChartType(chartType: string): void {
        if (chartType === this.currentChartType || !this.chartInstance.getChart()) return;

        this.currentChartType = chartType;
        this.dataManager.setChartType(chartType as any);
        this.seriesManager.createSeries(chartType);

        if (this.dataManager.hasData()) {
            const convertedData = this.dataManager.getDataForCurrentType();

            console.log('hasData:', this.dataManager.hasData());
            console.log('convertedData length:', convertedData?.length);
            console.log('convertedData sample:', convertedData?.[0]);

            if (convertedData && convertedData.length > 0) {
                this.seriesManager.setData(convertedData);
            }
        } else {
            console.log('hasData: FALSE — no data in manager');
        }
    }

    // ==================== DATA HANDLING ====================

    public handleInitialData(params: InitialDataParams): void {
        if (!params.data || !Array.isArray(params.data)) {
            console.warn('⚠️ Initial data missing or invalid');
            return;
        }

        const dataSymbol    = params.symbol    || this._currentSymbol;
        const dataTimeframe = params.timeframe || this._currentTimeframe;

        if (dataSymbol !== this._currentSymbol || dataTimeframe !== this._currentTimeframe) {
            this._currentSymbol    = dataSymbol;
            this._currentTimeframe = dataTimeframe;
        }

        const ohlcData      = params.data;
        this.dataManager.addOHLCData(ohlcData);

        const convertedData = this.dataManager.getDataForCurrentType();

        if (this.volumeVisible && ohlcData.length > 0) {
            this.volumeManager?.setData(ohlcData);
        }

        if (convertedData && convertedData.length > 0) {
            this.seriesManager.setData(convertedData);

            if (this.onInitialDataLoaded) {
                this.onInitialDataLoaded({
                    count:     convertedData.length,
                    symbol:    this._currentSymbol,
                    timeframe: this._currentTimeframe,
                    chartType: this.currentChartType
                });
            }
        } else {
            console.warn('⚠️ No converted data to set');
        }

        this.stateManager.setState('READY');
    }

    public handleUpdate(params: UpdateDataParams): void {
        if (!this.seriesManager.getSeries() || !params.data) return;
        if (!this.stateManager.isReady()) return;
        if (params.symbol    && params.symbol    !== this._currentSymbol)    return;
        if (params.timeframe && params.timeframe !== this._currentTimeframe) return;

        try {
            const ohlcUpdate = params.data;
            this.dataManager.updateOHLCData(ohlcUpdate);

            const latestData = this.dataManager.getLatestUpdateForCurrentType();

            if (latestData) {
                this.seriesManager.updateData(latestData);
                if (this.onPriceUpdate && 'close' in ohlcUpdate) {
                    this.onPriceUpdate(ohlcUpdate.close);
                }
            }

            if (this.volumeVisible && ohlcUpdate.volume !== undefined) {
                this.volumeManager?.updateCandle(ohlcUpdate);
            }

        } catch (error: any) {
            console.warn('⚠️ Update failed:', error.message);
        }
    }

    public resetChartDataState(): void {
        this.stateManager.setState('LOADING');
    }

    // ✅ Fix — expose setReady for ModuleManager to clear loading after data arrives
    public setReady(): void {
        this.stateManager.setState('READY');
    }

    // ==================== VOLUME ====================

    public async toggleVolume(): Promise<void> {
        this.volumeVisible = !this.volumeVisible;

        if (this.volumeVisible) {
            const mainSeries = this.seriesManager.getSeries();
            if (!mainSeries) {
                console.error('❌ Cannot create volume: main series not available');
                this.volumeVisible = false;
                return;
            }

            await this.loadVolumeManager();

            if (this._destroyed) return;

            this.volumeManager?.createSeries(mainSeries);
            const ohlcData = this.dataManager.getOHLCData();
            if (ohlcData && ohlcData.length > 0) {
                this.volumeManager?.setData(ohlcData);
            }
        } else {
            const mainSeries = this.seriesManager.getSeries();
            if (mainSeries) this.volumeManager?.resetScaleMargins(mainSeries);
            this.volumeManager?.removeSeries();
        }

        if (this.onVolumeToggle) this.onVolumeToggle(this.volumeVisible);

        this.saveVolumeState();
    }

    public isVolumeVisible(): boolean {
        return this.volumeVisible;
    }

    private saveVolumeState(): void {
        try {
            localStorage.setItem('megaflowz_volume_visible', JSON.stringify(this.volumeVisible));
        } catch (e) {}
    }

    private loadVolumeState(): void {
        try {
            const saved = localStorage.getItem('megaflowz_volume_visible');
            if (saved !== null) this.volumeVisible = JSON.parse(saved);
        } catch (e) {
            this.volumeVisible = false;
        }
    }

    // ==================== COLORS ====================

    public getColors(): ChartColors {
        return this.chartInstance.getColors();
    }

    public updateChartColors(colors: Partial<ChartColors>): void {
        this.chartInstance.applyColors(colors);
        this.seriesManager.updateColors({
            bull:       colors.bull,
            bear:       colors.bear,
            line:       colors.line,
            wickBull:   colors.wickBull,
            wickBear:   colors.wickBear,
            borderBull: colors.borderBull,
            borderBear: colors.borderBear,
        });
        this.volumeManager?.updateColors(
            colors.volumeBull,
            colors.volumeBear,
            this.dataManager.getOHLCData()
        );
    }

    // ==================== SCALE OPTIONS ====================

    public applyScaleOptions(detail: {
        logScale?:     boolean;
        percentScale?: boolean;
        autoScale?:    boolean;
    }): void {
        const chart = this.chartInstance.getChart();
        if (!chart) return;

        if (detail.logScale !== undefined) {
            chart.applyOptions({ rightPriceScale: { mode: detail.logScale ? 1 : 0 } });
        }
        if (detail.percentScale !== undefined) {
            chart.applyOptions({ rightPriceScale: { mode: detail.percentScale ? 2 : 0 } });
        }
        if (detail.autoScale !== undefined) {
            chart.applyOptions({ rightPriceScale: { autoScale: detail.autoScale } });
        }
    }

    public applyScaleMargins(top: number, bottom: number): void {
        const chart = this.chartInstance.getChart();
        if (!chart) return;
        chart.applyOptions({ rightPriceScale: { scaleMargins: { top, bottom } } });
    }

    public applyScalePosition(position: 'left' | 'right'): void {
        const chart = this.chartInstance.getChart();
        if (!chart) return;
        chart.applyOptions({
            leftPriceScale:  { visible: position === 'left' },
            rightPriceScale: { visible: position === 'right' }
        });
    }

    // ==================== GRID / CROSSHAIR / FONT ====================

    public toggleGridVertical():   void { this.chartInstance.toggleGridVertical(); }
    public toggleGridHorizontal(): void { this.chartInstance.toggleGridHorizontal(); }
    public applyFontSize(size: number): void { this.chartInstance.applyFontSize(size); }
    public applyCrosshairColor(color: string): void { this.chartInstance.applyCrosshairColor(color); }
    public applyCrosshairStyle(style: 'dotted' | 'dashed' | 'solid'): void {
        this.chartInstance.applyCrosshairStyle(style);
    }

    // ==================== BAR SPACING / TIME VISIBLE / WATERMARK ====================

    public applyBarSpacing(spacing: number): void { this.chartInstance.applyBarSpacing(spacing); }
    public applyTimeVisible(visible: boolean): void { this.chartInstance.applyTimeVisible(visible); }
    public applyWatermark(visible: boolean, color?: string): void {
        this.chartInstance.applyWatermark(visible, color);
    }

    // ==================== BID / ASK ====================

    public updateBidAsk(bid: number, ask: number): void {
        this.seriesManager.updateBidAsk(bid, ask);
    }

    public toggleBidAsk(key: 'bid' | 'ask', visible: boolean): void {
        this.seriesManager.toggleBidAsk(key, visible);
    }

    // ==================== PANE METHODS ====================

    public async addPane(height: number = 120, id?: string): Promise<any> {
        await this.loadPaneManager();
        if (this._destroyed) return null;
        return this.paneManager?.addPane(height, id) ?? null;
    }

    public async removePane(pane: any): Promise<boolean> {
        if (!this.paneManager) return false;
        return this.paneManager.removePane(pane);
    }

    public async addSeriesToPane(pane: any, seriesType: any, options?: any, seriesId?: string): Promise<any> {
        if (!this.paneManager) return null;
        return this.paneManager.addSeriesToPane(pane, seriesType, options, seriesId);
    }

    // ==================== GETTERS ====================

    public getChart(): IChartApi | null               { return this.chartInstance.getChart(); }
    public getSeries(): ISeriesApi<SeriesType> | null  { return this.seriesManager.getSeries(); }
    public getVolumeSeries()                           { return this.volumeManager?.getSeries() ?? null; }
    public isReady(): boolean                          { return this.stateManager.isReady(); }
    public getState()                                  { return this.stateManager.getState(); }

    // ✅ Fix #P7 — expose SeriesManager for ModuleManager direct wiring
    public getSeriesManager(): SeriesManager           { return this.seriesManager; }

    public toggleGrid():      void { this.chartInstance.toggleGrid(); }
    public toggleCrosshair(): void { this.chartInstance.toggleCrosshair(); }
    public toggleTimeScale(): void { this.chartInstance.toggleTimeScale(); }
    public resetView():       void { this.chartInstance.resetView(); }

    public downloadChart(): string | null {
        return this.chartInstance.downloadChart();
    }

    // ==================== DESTROY ====================

    public destroy(): void {
        this._destroyed = true;

        this.chartInstance.destroy();
        this.stateManager.destroy();
        this.paneManager?.clearAllPanes();
        this.seriesManager.destroy();
        this.volumeManager?.destroy();

        this.paneManager   = null;
        this.volumeManager = null;

        this.onChartReady          = null;
        this.onInitialDataLoaded   = null;
        this.onPriceUpdate         = null;
        this.onSymbolChange        = null;
        this.onTimeframeChange     = null;
        this.onStateChange         = null;
        this.onVolumeUpdate        = null;
        this.onVolumeToggle        = null;
        this.onSeriesDataReady     = null;
        this.onBeforeSeriesRemoved = null;
    }
}
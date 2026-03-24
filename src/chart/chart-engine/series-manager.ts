// ================================================================
// ⚡ SERIES MANAGER - Handle main price series
// ================================================================

import {
    IChartApi,
    ISeriesApi,
    SeriesType,
    CandlestickSeries,
    LineSeries,
    AreaSeries,
    BaselineSeries
} from 'lightweight-charts';
import { getDecimalPrecision, getMinMove, getPriceFormatter, hexToRgba } from '../chart-utils';

export interface SeriesColors {
    bull:         string;
    bear:         string;
    line:         string;
    wickBull?:    string;
    wickBear?:    string;
    borderBull?:  string;
    borderBear?:  string;
}

export type SeriesData = {
    time:   any;
    open?:  number;
    high?:  number;
    low?:   number;
    close?: number;
    value?: number;
};

export class SeriesManager {
    private chart:            IChartApi | null = null;
    private currentSeries:    ISeriesApi<SeriesType> | null = null;
    private colors:           SeriesColors;
    private currentSymbol:    string;
    private currentChartType: string = 'candlestick';

    private bidLine: any = null;
    private askLine: any = null;
    private bidAskVisible: { bid: boolean; ask: boolean } = { bid: true, ask: true };

    public onDataReady:           (() => void) | null = null;
    public onBeforeSeriesRemoved: (() => void) | null = null;

    constructor(colors: SeriesColors, symbol: string) {
        this.colors        = colors;
        this.currentSymbol = symbol;
    }

    public setChart(chart: IChartApi): void {
        this.chart = chart;
    }

    public setSymbol(symbol: string): void {
        this.currentSymbol = symbol;
    }

    public createSeries(chartType: string): ISeriesApi<SeriesType> | null {
        if (!this.chart) {
            console.error('❌ Chart not initialized for series creation');
            return null;
        }

        this.removeBidAskLines();

        if (this.currentSeries) {
            this.onBeforeSeriesRemoved?.();
            this.chart.removeSeries(this.currentSeries);
            this.currentSeries = null;
        }

        try {
            const precision = getDecimalPrecision(this.currentSymbol);
            const minMove   = getMinMove(this.currentSymbol);

            // ✅ Use type: 'price' for correct coordinate mapping
            // type: 'custom' breaks priceToCoordinate() used by line tools core
            // localization.priceFormatter handles visual display separately
            const priceFormat = {
                type:      'price' as const,
                precision,
                minMove
            };

            // ✅ Apply chart localization formatter for visual display
            this.chart.applyOptions({
                localization: {
                    priceFormatter: getPriceFormatter(this.currentSymbol)
                }
            });

            switch (chartType) {
                case 'candlestick':
                    this.currentSeries = this.chart.addSeries(CandlestickSeries, {
                        upColor:         this.colors.bull,
                        downColor:       this.colors.bear,
                        wickUpColor:     this.colors.wickBull   || this.colors.bull,
                        wickDownColor:   this.colors.wickBear   || this.colors.bear,
                        borderUpColor:   this.colors.borderBull || this.colors.bull,
                        borderDownColor: this.colors.borderBear || this.colors.bear,
                        priceFormat
                    });
                    break;

                case 'line':
                    this.currentSeries = this.chart.addSeries(LineSeries, {
                        color:     this.colors.line,
                        lineWidth: 2,
                        priceFormat
                    });
                    break;

                case 'area':
                    this.currentSeries = this.chart.addSeries(AreaSeries, {
                        lineColor:   this.colors.line,
                        topColor:    hexToRgba(this.colors.line, 0.4),
                        bottomColor: hexToRgba(this.colors.line, 0.1),
                        lineWidth:   2,
                        priceFormat
                    });
                    break;

                case 'baseline':
                    this.currentSeries = this.chart.addSeries(BaselineSeries, {
                        baseValue:        { type: 'price', price: 0 },
                        topLineColor:     'rgba(38, 166, 154, 1)',
                        topFillColor1:    'rgba(38, 166, 154, 0.28)',
                        topFillColor2:    'rgba(38, 166, 154, 0.05)',
                        bottomLineColor:  'rgba(239, 83, 80, 1)',
                        bottomFillColor1: 'rgba(239, 83, 80, 0.05)',
                        bottomFillColor2: 'rgba(239, 83, 80, 0.28)',
                        lineWidth:        2,
                        priceFormat
                    });
                    break;

                default:
                    return null;
            }

            this.currentChartType = chartType;
            return this.currentSeries;

        } catch (error) {
            console.error('❌ Failed to create series:', error);
            return null;
        }
    }

    public setData(data: any[]): void {
        if (!this.currentSeries || !data.length) return;
        try {
            this.currentSeries.setData(data);
            this.onDataReady?.();
        } catch (error) {
            console.error('❌ Failed to set series data:', error);
        }
    }

    public updateData(data: any): void {
        if (!this.currentSeries) return;
        try {
            this.currentSeries.update(data);
        } catch (error) {
            console.error('❌ Failed to update series data:', error);
        }
    }

    public clearData(): void {
        if (!this.currentSeries) return;
        try {
            this.currentSeries.setData([]);
        } catch (error) {
            console.error('❌ Failed to clear series data:', error);
        }
    }

    public getSeries(): ISeriesApi<SeriesType> | null {
        return this.currentSeries;
    }

    public updateColors(colors: Partial<SeriesColors>): void {
        if (!this.currentSeries) return;

        const updated: SeriesColors = {
            bull:        colors.bull        ?? this.colors.bull,
            bear:        colors.bear        ?? this.colors.bear,
            line:        colors.line        ?? this.colors.line,
            wickBull:    colors.wickBull    ?? this.colors.wickBull,
            wickBear:    colors.wickBear    ?? this.colors.wickBear,
            borderBull:  colors.borderBull  ?? this.colors.borderBull,
            borderBear:  colors.borderBear  ?? this.colors.borderBear,
        };

        Object.assign(this.colors, updated);

        try {
            switch (this.currentChartType) {
                case 'candlestick':
                    this.currentSeries.applyOptions({
                        upColor:         updated.bull,
                        downColor:       updated.bear,
                        wickUpColor:     updated.wickBull   || updated.bull,
                        wickDownColor:   updated.wickBear   || updated.bear,
                        borderUpColor:   updated.borderBull || updated.bull,
                        borderDownColor: updated.borderBear || updated.bear,
                    });
                    break;

                case 'line':
                    this.currentSeries.applyOptions({
                        color: updated.line
                    });
                    break;

                case 'area':
                    this.currentSeries.applyOptions({
                        lineColor:   updated.line,
                        topColor:    hexToRgba(updated.line, 0.4),
                        bottomColor: hexToRgba(updated.line, 0.1)
                    });
                    break;

                case 'baseline':
                    this.currentSeries.applyOptions({
                        topLineColor:     updated.bull,
                        bottomLineColor:  updated.bear,
                        topFillColor1:    hexToRgba(updated.bull, 0.28),
                        topFillColor2:    hexToRgba(updated.bull, 0.05),
                        bottomFillColor1: hexToRgba(updated.bear, 0.05),
                        bottomFillColor2: hexToRgba(updated.bear, 0.28),
                    });
                    break;
            }
            console.log('🎨 Series colors updated');
        } catch (error) {
            console.error('❌ Failed to update series colors:', error);
        }
    }

    // ==================== BID / ASK ====================

    public updateBidAsk(bid: number, ask: number): void {
        if (!this.currentSeries) return;

        if (!this.bidLine && !this.askLine) {
            this.initBidAskLines(bid, ask);
            return;
        }

        try {
            if (this.bidLine && this.bidAskVisible.bid) {
                this.bidLine.applyOptions({ price: bid });
            }
            if (this.askLine && this.bidAskVisible.ask) {
                this.askLine.applyOptions({ price: ask });
            }
        } catch (error) {}
    }

    public toggleBidAsk(key: 'bid' | 'ask', visible: boolean): void {
        this.bidAskVisible[key] = visible;

        try {
            if (key === 'bid' && !visible && this.bidLine) {
                this.currentSeries?.removePriceLine(this.bidLine);
                this.bidLine = null;
            }
            if (key === 'ask' && !visible && this.askLine) {
                this.currentSeries?.removePriceLine(this.askLine);
                this.askLine = null;
            }
        } catch (error) {}
    }

    private initBidAskLines(bid: number, ask: number): void {
        if (!this.currentSeries) return;

        if (this.bidAskVisible.bid) {
            this.bidLine = this.currentSeries.createPriceLine({
                price:            bid,
                color:            this.colors.bear || '#ef4444',
                lineWidth:        1,
                lineStyle:        3,
                axisLabelVisible: true,
                title:            'Bid',
            });
        }

        if (this.bidAskVisible.ask) {
            this.askLine = this.currentSeries.createPriceLine({
                price:            ask,
                color:            this.colors.bull || '#10b981',
                lineWidth:        1,
                lineStyle:        3,
                axisLabelVisible: true,
                title:            'Ask',
            });
        }
    }

    private removeBidAskLines(): void {
        try {
            if (this.bidLine && this.currentSeries) {
                this.currentSeries.removePriceLine(this.bidLine);
                this.bidLine = null;
            }
            if (this.askLine && this.currentSeries) {
                this.currentSeries.removePriceLine(this.askLine);
                this.askLine = null;
            }
        } catch (error) {}
    }

    // ==================== DESTROY ====================

    public destroy(): void {
        this.onBeforeSeriesRemoved?.();
        if (this.chart && this.currentSeries) {
            try {
                this.chart.removeSeries(this.currentSeries);
            } catch (error) {}
        }
        this.currentSeries         = null;
        this.chart                 = null;
        this.onDataReady           = null;
        this.onBeforeSeriesRemoved = null;
    }
}
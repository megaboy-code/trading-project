// ================================================================
// ⚡ CHART DATA MANAGER - OPTIMIZED with Running Total
// ================================================================

import { OHLCData, ChartType } from './chart-types';

// Lightweight Charts compatible data types
export interface CandlestickChartData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface LineChartData {
    time: number;
    value: number;
}

export interface AreaChartData {
    time: number;
    value: number;
}

export interface BaselineChartData {
    time: number;
    value: number;
}

export type ChartData = CandlestickChartData | LineChartData | AreaChartData | BaselineChartData;

export class ChartDataManager {
    private ohlcData: OHLCData[] = [];
    private currentType: ChartType = 'candlestick';
    private baselineValue: number = 0;

    // 🚀 OPTIMIZATION: Running total for O(1) baseline calculation
    private runningSum: number = 0;

    // 🚀 Track if we're actively maintaining running sum
    private isBaselineActive: boolean = false;

    // ==================== PUBLIC METHODS ====================

    public setChartType(type: ChartType): void {
        if (type === this.currentType) return;

        this.currentType = type;

        if (type === 'baseline') {
            if (!this.isBaselineActive) {
                this.initializeBaseline();
                this.isBaselineActive = true;
            }
            this.calculateBaseline();
        } else {
            this.isBaselineActive = false;
        }
    }

    public getChartType(): ChartType {
        return this.currentType;
    }

    public addOHLCData(data: OHLCData[]): void {
        this.ohlcData = data;

        if (this.isBaselineActive) {
            this.runningSum = this.ohlcData.reduce((acc, candle) => acc + candle.close, 0);
            this.calculateBaseline();
        }
    }

    public updateOHLCData(update: OHLCData): void {
        const lastIndex = this.ohlcData.length - 1;

        if (lastIndex >= 0 && this.ohlcData[lastIndex].time === update.time) {
            if (this.isBaselineActive) {
                this.runningSum = this.runningSum - this.ohlcData[lastIndex].close + update.close;
                this.calculateBaseline();
            }
            this.ohlcData[lastIndex] = update;
        } else {
            this.ohlcData.push(update);

            if (this.isBaselineActive) {
                this.runningSum += update.close;
                this.calculateBaseline();
            }
        }
    }

    private initializeBaseline(): void {
        if (this.ohlcData.length === 0) {
            this.runningSum = 0;
            this.baselineValue = 0;
            return;
        }

        this.runningSum = this.ohlcData.reduce((acc, candle) => acc + candle.close, 0);
    }

    private calculateBaseline(): void {
        if (this.ohlcData.length === 0) {
            this.baselineValue = 0;
            return;
        }

        this.baselineValue = this.runningSum / this.ohlcData.length;
    }

    public getDataForCurrentType(): ChartData[] {
        switch (this.currentType) {
            case 'candlestick': return this.convertToCandlestick();
            case 'line':        return this.convertToLine();
            case 'area':        return this.convertToArea();
            case 'baseline':    return this.convertToBaseline();
            default:            return this.convertToCandlestick();
        }
    }

    public getLatestUpdateForCurrentType(): ChartData | null {
        if (this.ohlcData.length === 0) return null;

        const latestCandle = this.ohlcData[this.ohlcData.length - 1];

        switch (this.currentType) {
            case 'candlestick':
                return {
                    time:  latestCandle.time,
                    open:  latestCandle.open,
                    high:  latestCandle.high,
                    low:   latestCandle.low,
                    close: latestCandle.close
                };
            case 'line':
            case 'area':
            case 'baseline':
                return {
                    time:  latestCandle.time,
                    value: latestCandle.close
                };
            default:
                return null;
        }
    }

    public getLatestOHLC(): OHLCData | null {
        return this.ohlcData.length > 0 ? this.ohlcData[this.ohlcData.length - 1] : null;
    }

    // ✅ Binary search for O(log n) performance on large datasets
    public getOHLCAtTime(time: number): OHLCData | null {
        if (this.ohlcData.length === 0) return null;
        let low = 0, high = this.ohlcData.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            const t   = this.ohlcData[mid].time as number;
            if (t === time)    return this.ohlcData[mid];
            else if (t < time) low = mid + 1;
            else               high = mid - 1;
        }
        return null;
    }

    public getOHLCData(): OHLCData[] {
        return this.ohlcData;
    }

    public clear(): void {
        this.ohlcData = [];
        this.baselineValue = 0;
        this.runningSum = 0;
        this.isBaselineActive = false;
    }

    public hasData(): boolean {
        return this.ohlcData.length > 0;
    }

    public getDataCount(): number {
        return this.ohlcData.length;
    }

    public getBaselineValue(): number {
        return this.baselineValue;
    }

    public getRunningSum(): number {
        return this.runningSum;
    }

    // ==================== PRIVATE CONVERSION METHODS ====================

    private convertToCandlestick(): CandlestickChartData[] {
        return this.ohlcData.map(candle => ({
            time:  candle.time,
            open:  candle.open,
            high:  candle.high,
            low:   candle.low,
            close: candle.close
        }));
    }

    private convertToLine(): LineChartData[] {
        return this.ohlcData.map(candle => ({
            time:  candle.time,
            value: candle.close
        }));
    }

    private convertToArea(): AreaChartData[] {
        return this.ohlcData.map(candle => ({
            time:  candle.time,
            value: candle.close
        }));
    }

    private convertToBaseline(): BaselineChartData[] {
        return this.ohlcData.map(candle => ({
            time:  candle.time,
            value: candle.close
        }));
    }
}
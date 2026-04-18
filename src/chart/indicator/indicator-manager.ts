// ================================================================
// ⚡ INDICATOR MANAGER - Backend Driven
// Handles both indicators and strategies — one manager
// Backend computes all values + timestamps — frontend renders only
// Series never removed — hide/show/reuse for performance
// One series per line in IndicatorUpdate.lines[]
// Colors and line width owned by frontend
// ================================================================

import { LineSeries, ISeriesApi, SeriesType } from 'lightweight-charts';
import { getDecimalPrecision }                from '../chart-utils';

// ================================================================
// DEFAULT LINE COLORS — cycled per line index
// ================================================================
const LINE_COLORS = [
    '#00d394',
    '#ff4d6b',
    '#3a86ff',
    '#ffbe0b',
    '#8338ec',
    '#ff006e',
    '#06d6a0',
    '#ef476f'
];

// ================================================================
// TYPES
// ================================================================
interface IndicatorLine {
    name:    string;
    series:  ISeriesApi<SeriesType>;
    color:   string;
    width:   number;
    visible: boolean;
}

interface ActiveIndicator {
    id:         string;
    key:        string;
    label:      string;
    symbol:     string;
    timeframe:  string;
    lines:      Map<string, IndicatorLine>;
    isStrategy: boolean;
    active:     boolean;
}

export interface IndicatorUpdatePayload {
    key:       string;
    label:     string;
    symbol:    string;
    timeframe: string;
    lines:     Array<{
        name:       string;
        timestamps: number[];
        values:     number[];
    }>;
}

// ================================================================
// INDICATOR MANAGER
// ================================================================
export class IndicatorManager {
    private chart:         any    = null;
    private mainChart:     any    = null;
    private currentSymbol: string = '';

    private pool: Map<string, ActiveIndicator> = new Map();

    private abortController: AbortController | null = null;

    public onPaneCreated: ((pane: any) => Promise<void>) | null = null;

    // ==================== SETUP ====================

    public setChart(chart: any):         void { this.chart         = chart; }
    public setMainChart(mainChart: any): void { this.mainChart     = mainChart; }
    public setSymbol(symbol: string):    void { this.currentSymbol = symbol; }

    public initialize(): void {
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        document.addEventListener('indicator-settings-changed', (e: Event) => {
            const { indicatorId, lines } = (e as CustomEvent).detail;
            if (indicatorId && lines) this.updateLines(indicatorId, lines);
        }, { signal });
    }

    // ================================================================
    // ON INDICATOR UPDATE — direct call from ModuleManager hot path
    // Initial: timestamps.length > 1
    // Live:    timestamps.length === 1
    // ================================================================
    public onIndicatorUpdate(data: IndicatorUpdatePayload): void {
        if (!this.chart) return;

        const id        = `${data.key}_${data.symbol}_${data.timeframe}`;
        const isInitial = data.lines.some(l => l.timestamps.length > 1);
        const existing  = this.pool.get(id);

        if (!existing) {
            this.createIndicator(id, data);
        } else {
            this.updateIndicator(existing, data, isInitial);
        }
    }

    // ================================================================
    // CREATE — first time this id is seen
    // ================================================================
    private createIndicator(
        id:   string,
        data: IndicatorUpdatePayload
    ): void {
        const precision  = getDecimalPrecision(data.symbol);
        const minMove    = 1 / Math.pow(10, precision);
        const isStrategy = data.lines.length > 1;

        const indicator: ActiveIndicator = {
            id,
            key:       data.key,
            label:     data.label,
            symbol:    data.symbol,
            timeframe: data.timeframe,
            lines:     new Map(),
            isStrategy,
            active:    true
        };

        const legendValues: Array<{
            label: string;
            value: string;
            color: string;
        }> = [];

        data.lines.forEach((line, index) => {
            const color = LINE_COLORS[index % LINE_COLORS.length];

            try {
                const series = this.chart.addSeries(LineSeries, {
                    color,
                    lineWidth:              1,
                    lastValueVisible:       true,
                    priceLineVisible:       false,
                    crosshairMarkerVisible: true,
                    priceFormat: { type: 'price', precision, minMove }
                });

                const chartData = line.timestamps
                    .map((t, i) => ({ time: t, value: line.values[i] }))
                    .filter(p => !isNaN(p.value));

                if (chartData.length > 0) {
                    series.setData(chartData as any);
                }

                indicator.lines.set(line.name, {
                    name:    line.name,
                    series,
                    color,
                    width:   1,
                    visible: true
                });

                const lastVal = line.values[line.values.length - 1] ?? 0;
                legendValues.push({
                    label: line.name,
                    value: lastVal.toFixed(precision),
                    color
                });

            } catch (e) {}
        });

        this.pool.set(id, indicator);

        document.dispatchEvent(new CustomEvent('indicator-added', {
            detail: {
                id,
                name:   data.label,
                color:  legendValues[0]?.color ?? LINE_COLORS[0],
                icon:   isStrategy ? 'fa-robot' : undefined,
                pane:   null,
                values: legendValues
            }
        }));
    }

    // ================================================================
    // UPDATE — handles both initial burst and live single point
    // ================================================================
    private updateIndicator(
        indicator: ActiveIndicator,
        data:      IndicatorUpdatePayload,
        isInitial: boolean
    ): void {
        const precision    = getDecimalPrecision(data.symbol);
        const legendValues: Array<{
            label: string;
            value: string;
            color: string;
        }> = [];

        data.lines.forEach(line => {
            const activeLine = indicator.lines.get(line.name);
            if (!activeLine) return;
            if (line.timestamps.length === 0) return;

            try {
                if (isInitial) {
                    const chartData = line.timestamps
                        .map((t, i) => ({ time: t, value: line.values[i] }))
                        .filter(p => !isNaN(p.value));
                    if (chartData.length > 0) {
                        activeLine.series.setData(chartData as any);
                    }
                } else {
                    const t = line.timestamps[0];
                    const v = line.values[0];
                    if (!isNaN(v)) {
                        activeLine.series.update({ time: t, value: v } as any);
                    }
                }
            } catch (e) {}

            const lastVal = line.values[line.values.length - 1] ?? 0;
            legendValues.push({
                label: line.name,
                value: lastVal.toFixed(precision),
                color: activeLine.color
            });
        });

        indicator.active = true;

        if (legendValues.length > 0) {
            document.dispatchEvent(new CustomEvent('indicator-value-update', {
                detail: { id: indicator.id, values: legendValues }
            }));
        }
    }

    // ================================================================
    // CLEAR SERIES DATA — setData([]) only, no hide, no remove
    // ================================================================
    private clearSeriesData(indicator: ActiveIndicator): void {
        indicator.lines.forEach(line => {
            try {
                line.series.setData([]);
            } catch (e) {}
        });
        indicator.active = false;
    }

    // ================================================================
    // ON TIMEFRAME CHANGE
    // Indicators — clear data, delete from pool, remove legend item
    //              backend sends fresh data with new TF id
    // Strategies  — clear data only, pool entry stays
    //              backend sends cached history on TF return
    // ================================================================
    public onTimeframeChange(): void {
        const toDelete: string[] = [];

        this.pool.forEach((indicator, id) => {
            if (indicator.isStrategy) {
                this.clearSeriesData(indicator);
                document.dispatchEvent(new CustomEvent('indicator-tf-inactive', {
                    detail: { id, deployedTF: indicator.timeframe }
                }));
            } else {
                this.clearSeriesData(indicator);
                toDelete.push(id);
                document.dispatchEvent(new CustomEvent('legend-item-remove', {
                    detail: { id }
                }));
            }
        });

        toDelete.forEach(id => this.pool.delete(id));
    }

    // ================================================================
    // ON SYMBOL CHANGE — clear everything including pool
    // ================================================================
    public onSymbolChange(): void {
        this.pool.forEach(indicator => {
            this.clearSeriesData(indicator);
        });
        this.pool.clear();
    }

    public clearAll(): void {
        this.onSymbolChange();
    }

    // ================================================================
    // REMOVE — user clicks remove on legend
    // Clears series data, keeps in pool for reuse
    // Dispatches indicator-removed so backend unsubscribes
    // ================================================================
    public removeIndicator(id: string): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        this.clearSeriesData(indicator);

        document.dispatchEvent(new CustomEvent('indicator-removed', {
            detail: {
                key:       indicator.key,
                symbol:    indicator.symbol,
                timeframe: indicator.timeframe
            }
        }));
    }

    // ================================================================
    // VISIBILITY TOGGLE
    // ================================================================
    public toggleVisibility(id: string): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        indicator.lines.forEach(line => {
            line.visible = !line.visible;
            try {
                line.series.applyOptions({ visible: line.visible });
            } catch (e) {}
        });
    }

    // ================================================================
    // UPDATE LINES — color + lineWidth per line from settings modal
    // ================================================================
    private updateLines(
        id:    string,
        lines: Record<string, { color?: string; lineWidth?: number }>
    ): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        Object.entries(lines).forEach(([name, opts]) => {
            const line = indicator.lines.get(name);
            if (!line) return;
            const apply: any = {};
            if (opts.color)     { apply.color     = opts.color;     line.color = opts.color; }
            if (opts.lineWidth) { apply.lineWidth = opts.lineWidth; line.width = opts.lineWidth; }
            try { line.series.applyOptions(apply); } catch (e) {}
        });
    }

    // ================================================================
    // GETTERS
    // ================================================================
    public hasIndicator(id: string): boolean {
        return this.pool.has(id);
    }

    // ================================================================
    // DESTROY — called on page reload / logout
    // Removes all series from chart, clears pool
    // ================================================================
    public async destroy(): Promise<void> {
        this.abortController?.abort();
        this.abortController = null;

        if (this.chart) {
            this.pool.forEach(indicator => {
                indicator.lines.forEach(line => {
                    try { this.chart.removeSeries(line.series); } catch (e) {}
                });
            });
        }

        this.pool.clear();
        this.chart     = null;
        this.mainChart = null;
    }
}

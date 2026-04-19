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

// ── Indicator params from AvailableConfig ──
interface IndicatorParams {
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
    is_strategy:   boolean;
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

    private pool:      Map<string, ActiveIndicator> = new Map();
    private legendIds: Set<string>                  = new Set();

    // ── Params map — keyed by indicator key e.g. "EMA" ──
    // Populated from available-config-received DOM event
    private paramsMap: Map<string, IndicatorParams> = new Map();

    private abortController: AbortController | null = null;

    public onPaneCreated: ((pane: any) => Promise<void>) | null = null;

    // ==================== SETUP ====================

    public setChart(chart: any):         void { this.chart         = chart; }
    public setMainChart(mainChart: any): void { this.mainChart     = mainChart; }
    public setSymbol(symbol: string):    void { this.currentSymbol = symbol; }

    public initialize(): void {
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        // ── Listen for indicator settings changes ──
        document.addEventListener('indicator-settings-changed', (e: Event) => {
            const { indicatorId, lines } = (e as CustomEvent).detail;
            if (indicatorId && lines) this.updateLines(indicatorId, lines);
        }, { signal });

        // ── Listen for period change — resubscribe with new period ──
        document.addEventListener('indicator-period-changed', (e: Event) => {
            const { indicatorId, periodOverrides } = (e as CustomEvent).detail;
            if (!indicatorId || !periodOverrides) return;

            const indicator = this.pool.get(indicatorId);
            if (!indicator) return;

            const period = Object.values(periodOverrides as Record<string, number>)
                .find(v => v > 0) ?? 0;

            if (period === 0) return;

            document.dispatchEvent(new CustomEvent('resubscribe-indicator', {
                detail: {
                    key:       indicator.key,
                    symbol:    indicator.symbol,
                    timeframe: indicator.timeframe,
                    period
                }
            }));
        }, { signal });

        // ── Listen for available config — store params map ──
        document.addEventListener('available-config-received', (e: Event) => {
            const config = (e as CustomEvent).detail;
            if (!config) return;

            const allItems = [
                ...(config.indicators || []),
                ...(config.strategies || []),
                ...(config.patterns   || [])
            ];

            allItems.forEach((item: any) => {
                if (!item.key) return;
                this.paramsMap.set(item.key, {
                    period:        item.period        ?? 0,
                    fast_period:   item.fast_period   ?? 0,
                    slow_period:   item.slow_period   ?? 0,
                    signal_period: item.signal_period ?? 0,
                    k_period:      item.k_period      ?? 0,
                    d_period:      item.d_period      ?? 0,
                    slowing:       item.slowing       ?? 0,
                    deviation:     item.deviation     ?? 0.0,
                    overbought:    item.overbought    ?? 0,
                    oversold:      item.oversold      ?? 0,
                    volume:        item.volume        ?? 0.0,
                    price_type:    item.price_type    ?? 'close',
                    is_strategy:   item.is_strategy   ?? false
                });
            });
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
    // If legend item already exists — update values only, no duplicate
    // ================================================================
    private createIndicator(
        id:   string,
        data: IndicatorUpdatePayload
    ): void {
        const precision  = getDecimalPrecision(data.symbol);
        const minMove    = 1 / Math.pow(10, precision);

        // ── Use is_strategy from params — lines count is unreliable ──
        const params     = this.paramsMap.get(data.key) ?? null;
        const isStrategy = params?.is_strategy ?? data.lines.length > 1;

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
                    .filter(p => !isNaN(p.value) && p.value !== 0);

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
                    label: isStrategy ? line.name : '',
                    value: lastVal.toFixed(precision),
                    color
                });

            } catch (e) {}
        });

        this.pool.set(id, indicator);

        // ── Legend item already exists — update values only ──
        if (this.legendIds.has(data.key)) {
            document.dispatchEvent(new CustomEvent('indicator-value-update', {
                detail: { id, values: legendValues }
            }));
        } else {
            this.legendIds.add(data.key);
            document.dispatchEvent(new CustomEvent('indicator-added', {
                detail: {
                    id,
                    name:     data.label,
                    color:    legendValues[0]?.color ?? LINE_COLORS[0],
                    icon:     isStrategy ? 'fa-robot' : undefined,
                    pane:     null,
                    values:   legendValues,
                    settings: params ? { ...params } : {}
                }
            }));
        }
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
                        .filter(p => !isNaN(p.value) && p.value !== 0);
                    if (chartData.length > 0) {
                        activeLine.series.setData(chartData as any);
                    }
                } else {
                    const t = line.timestamps[0];
                    const v = line.values[0];
                    if (!isNaN(v) && v !== 0) {
                        activeLine.series.update({ time: t, value: v } as any);
                    }
                }
            } catch (e) {}

            const lastVal = line.values[line.values.length - 1] ?? 0;
            legendValues.push({
                label: indicator.isStrategy ? line.name : '',
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
    // Indicators — clear data, delete from pool, delete from legendIds
    //              legend stays — no X was clicked
    //              legendIds cleared so createIndicator fires indicator-added
    // Strategies  — clear data only, pool entry stays
    //              legend stays showing deployed TF
    // ================================================================
    public onTimeframeChange(): void {
        const toDelete:      string[] = [];
        const toResubscribe: Array<{ key: string; symbol: string }> = [];

        this.pool.forEach((indicator, id) => {
            if (indicator.isStrategy) {
                this.clearSeriesData(indicator);
                document.dispatchEvent(new CustomEvent('indicator-tf-inactive', {
                    detail: { id, deployedTF: indicator.timeframe }
                }));
            } else {
                this.clearSeriesData(indicator);
                toResubscribe.push({
                    key:    indicator.key,
                    symbol: indicator.symbol
                });
                toDelete.push(id);
                // ── Remove from legendIds so createIndicator
                //    dispatches indicator-added on new TF data ──
                this.legendIds.delete(indicator.key);
            }
        });

        toDelete.forEach(id => this.pool.delete(id));

        toResubscribe.forEach(({ key, symbol }) => {
            document.dispatchEvent(new CustomEvent('resubscribe-indicator', {
                detail: { key, symbol }
            }));
        });
    }

    // ================================================================
    // ON SYMBOL CHANGE — clear everything including legend tracker
    // ================================================================
    public onSymbolChange(): void {
        this.pool.forEach(indicator => {
            this.clearSeriesData(indicator);
        });
        this.pool.clear();
        this.legendIds.clear();
    }

    public clearAll(): void {
        this.onSymbolChange();
    }

    // ================================================================
    // REMOVE — user clicks X on legend
    // Clears series data, removes from pool and legend tracker
    // Dispatches indicator-removed so backend unsubscribes
    // ================================================================
    public removeIndicator(id: string): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        this.clearSeriesData(indicator);
        this.pool.delete(id);
        this.legendIds.delete(indicator.key);

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
    // DESTROY
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
        this.legendIds.clear();
        this.paramsMap.clear();
        this.chart     = null;
        this.mainChart = null;
    }
}

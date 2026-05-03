// ================================================================
// ⚡ INDICATOR MANAGER - Backend Driven
// Handles both indicators and strategies — one manager
// Backend computes all values + timestamps — frontend renders only
// Series never removed — hide/show/reuse for performance
// One series per line in IndicatorUpdate.lines[]
// Colors and line width owned by frontend
// Persistence — active subs + period overrides in localStorage
// Single owner of all legend adds — indicators + strategies
// Settings modal owned here — reads paramsMap directly
// ================================================================

import { LineSeries, ISeriesApi, SeriesType } from 'lightweight-charts';
import { getDecimalPrecision }                from '../chart-utils';

// ================================================================
// LOCALSTORAGE KEYS
// ================================================================
const LS_PERIOD_OVERRIDES = 'indicator_period_overrides';
const LS_ACTIVE_SUBS      = 'indicator_active_subs';

// ================================================================
// DEFAULT COLORS — per indicator key, fallback to cycle
// ================================================================
const INDICATOR_COLORS: Record<string, string> = {
    'EMA':  '#00d394',
    'SMA':  '#3a86ff',
    'RSI':  '#ffbe0b',
    'MACD': '#8338ec',
    'BB':   '#ff4d6b',
    'STOCH':'#ff006e',
    'ATR':  '#06d6a0',
};

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
    name:                   string;
    series:                 ISeriesApi<SeriesType>;
    color:                  string;
    width:                  number;
    visible:                boolean;
    priceLineVisible:       boolean;
    lastValueVisible:       boolean;
    crosshairMarkerVisible: boolean;
    lastValue:              number;
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

// ================================================================
// INDICATOR PARAMS — full config from backend
// period_fields — drives input rows in settings modal
// line_labels   — drives line display names in settings modal
// ================================================================
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
    description:   string;
    period_fields: Array<{ field: string; label: string }>;
    line_labels:   Record<string, string>;
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
// ACTIVE SUB — persisted to localStorage
// ================================================================
interface ActiveSub {
    key:       string;
    symbol:    string;
    timeframe: string;
    period:    number;
}

// ================================================================
// SAVED LINE SETTINGS — persisted across TF changes
// ================================================================
interface SavedLineSettings {
    color:                  string;
    width:                  number;
    priceLineVisible:       boolean;
    lastValueVisible:       boolean;
    crosshairMarkerVisible: boolean;
}

// ================================================================
// PENDING SET DATA — buffer for data arriving before chart ready
// ================================================================
interface PendingSetData {
    series:    ISeriesApi<SeriesType>;
    chartData: Array<{ time: number; value: number }>;
}

// ================================================================
// INDICATOR MANAGER
// ================================================================
export class IndicatorManager {
    private chart:            any    = null;
    private mainChart:        any    = null;
    private currentSymbol:    string = '';
    private currentTimeframe: string = '';

    private pool:      Map<string, ActiveIndicator> = new Map();
    private legendIds: Set<string>                  = new Set();

    private paramsMap: Map<string, IndicatorParams> = new Map();

    // ── Period overrides — persisted to localStorage ──
    private periodOverrides: Map<string, number> = new Map();

    // ── Active subs — persisted to localStorage ──
    private activeSubs: Map<string, ActiveSub> = new Map();

    // ── Persisted line settings — key = indicator key (e.g. 'EMA') ──
    private savedSettings: Map<string, Map<string, SavedLineSettings>> = new Map();

    // ── Pending setData — keyed by indicator id ──
    private pendingSetData: Map<string, PendingSetData[]> = new Map();

    // ── Chart ready flag ──
    private chartReady: boolean = false;

    private abortController: AbortController | null = null;

    public onPaneCreated: ((pane: any) => Promise<void>) | null = null;

    // ==================== SETUP ====================

    public setChart(chart: any):            void { this.chart            = chart; }
    public setMainChart(mainChart: any):    void { this.mainChart        = mainChart; }
    public setSymbol(symbol: string):       void { this.currentSymbol    = symbol; }
    public setTimeframe(timeframe: string): void { this.currentTimeframe = timeframe; }

    public initialize(): void {
        try {
            const saved = localStorage.getItem(LS_PERIOD_OVERRIDES);
            if (saved) {
                const parsed = JSON.parse(saved) as Record<string, number>;
                Object.entries(parsed).forEach(([key, period]) => {
                    this.periodOverrides.set(key, period);
                });
            }
        } catch (e) {}

        try {
            const saved = localStorage.getItem(LS_ACTIVE_SUBS);
            if (saved) {
                const parsed = JSON.parse(saved) as ActiveSub[];
                parsed.forEach(sub => {
                    this.activeSubs.set(sub.key, sub);
                });
            }
        } catch (e) {}

        this.abortController = new AbortController();
        const { signal } = this.abortController;

        // ── Chart initial data loaded — resubscribe all active subs ──
        document.addEventListener('chart-initial-data-loaded', (e: Event) => {
            const { symbol, timeframe } = (e as CustomEvent).detail;
            if (!symbol || !timeframe) return;

            this.chartReady = false;

            this.activeSubs.forEach(sub => {
                const period = this.periodOverrides.get(sub.key) ?? sub.period;
                document.dispatchEvent(new CustomEvent('resubscribe-indicator', {
                    detail: { key: sub.key, symbol, timeframe, period }
                }));
            });

            this.flushPendingSetData();

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.chartReady = true;
                });
            });

        }, { signal });

        // ── Settings changed — live preview ──
        document.addEventListener('indicator-settings-changed', (e: Event) => {
            const { indicatorId, lines } = (e as CustomEvent).detail;
            if (indicatorId && lines) this.updateLines(indicatorId, lines);
        }, { signal });

        // ── Period changed — resubscribe ──
        document.addEventListener('indicator-period-changed', (e: Event) => {
            const { indicatorId, periodOverrides } = (e as CustomEvent).detail;
            if (!indicatorId || !periodOverrides) return;

            const indicator = this.pool.get(indicatorId);
            if (!indicator) return;

            const period = Object.values(periodOverrides as Record<string, number>)
                .find(v => v > 0) ?? 0;

            if (period === 0) return;

            this.periodOverrides.set(indicator.key, period);
            this.persistPeriodOverrides();

            const sub = this.activeSubs.get(indicator.key);
            if (sub) {
                sub.period = period;
                this.persistActiveSubs();
            }

            document.dispatchEvent(new CustomEvent('indicator-settings-update', {
                detail: {
                    id:       indicatorId,
                    settings: this.getEffectiveSettings(indicator.key)
                }
            }));

            document.dispatchEvent(new CustomEvent('indicator-removed', {
                detail: {
                    key:       indicator.key,
                    symbol:    indicator.symbol,
                    timeframe: indicator.timeframe
                }
            }));

            document.dispatchEvent(new CustomEvent('resubscribe-indicator', {
                detail: {
                    key:       indicator.key,
                    symbol:    indicator.symbol,
                    timeframe: indicator.timeframe,
                    period
                }
            }));
        }, { signal });

        // ── Available config — populate paramsMap ──
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
                    is_strategy:   item.is_strategy   ?? false,
                    description:   item.description   ?? '',
                    // ── New fields from decoder ──
                    period_fields: item.period_fields ?? [],
                    line_labels:   item.line_labels   ?? {}
                });
            });
        }, { signal });

        // ── Settings modal request — owned here ──
        // chart-core fires this, indicator-manager handles it
        document.addEventListener('indicator-settings-request', (e: Event) => {
            const { indicatorId, triggerRect } = (e as CustomEvent).detail;
            if (!indicatorId) return;
            this.openSettingsModal(indicatorId, triggerRect);
        }, { signal });

        // ── Strategy legend add — fired by strategy-drawing-manager ──
        // Guard: skip if legendId already exists
        document.addEventListener('strategy-legend-add', (e: Event) => {
            const { legendId, strategyKey, symbol, timeframe, color } =
                (e as CustomEvent).detail;
            if (!legendId || !strategyKey) return;

            // ── Guard — prevent duplicate legend entries ──
            if (this.legendIds.has(legendId)) return;

            this.legendIds.add(legendId);

            const params = this.paramsMap.get(strategyKey);

            document.dispatchEvent(new CustomEvent('indicator-added', {
                detail: {
                    id:       legendId,
                    name:     strategyKey,
                    color,
                    icon:     'fa-robot',
                    pane:     null,
                    values:   [],
                    settings: params ? this.getEffectiveSettings(strategyKey) : {}
                }
            }));
        }, { signal });

        // ── Strategy legend remove — fired by strategy-drawing-manager ──
        document.addEventListener('strategy-legend-remove', (e: Event) => {
            const { legendId } = (e as CustomEvent).detail;
            if (!legendId) return;
            this.legendIds.delete(legendId);
        }, { signal });
    }

    // ================================================================
    // OPEN SETTINGS MODAL — owned by indicator-manager
    // Reads paramsMap directly — no dependency on chart-ui
    // ================================================================
    private openSettingsModal(indicatorId: string, triggerRect?: DOMRect): void {
        const indicator = this.pool.get(indicatorId);

        // ── Strategy legend — no series in pool, build item from paramsMap ──
        const isStrategyLegend = !indicator && this.legendIds.has(indicatorId);

        let item: any;

        if (indicator) {
            const params  = this.paramsMap.get(indicator.key);
            const keySaved = this.savedSettings.get(indicator.key);

            const savedLines: Record<string, any> = {};
            if (keySaved) {
                keySaved.forEach((v, k) => { savedLines[k] = v; });
            }

            const values = Array.from(indicator.lines.values()).map(line => ({
                key:   line.name,
                label: this.getLineLabel(indicator.key, line.name),
                value: line.lastValue.toFixed(getDecimalPrecision(indicator.symbol)),
                color: line.color
            }));

            item = {
                id:       indicatorId,
                name:     indicator.label,
                color:    values[0]?.color ?? LINE_COLORS[0],
                icon:     indicator.isStrategy ? 'fa-robot' : undefined,
                pane:     null,
                values,
                settings: {
                    ...this.getEffectiveSettings(indicator.key),
                    savedLines
                }
            };

        } else if (isStrategyLegend) {
            // ── Extract key from legendId: strategyKey_symbol_tf ──
            const parts       = indicatorId.split('_');
            const strategyKey = parts.slice(0, -2).join('_');
            const params      = this.paramsMap.get(strategyKey);

            item = {
                id:       indicatorId,
                name:     strategyKey,
                color:    LINE_COLORS[0],
                icon:     'fa-robot',
                pane:     null,
                values:   [],
                settings: params ? this.getEffectiveSettings(strategyKey) : {}
            };
        } else {
            return;
        }

        import('../ui/indicator-settings-modal').then(
            ({ IndicatorSettingsModal }) => {
                new IndicatorSettingsModal(item, triggerRect).open();
            }
        );
    }

    // ================================================================
    // PERSIST HELPERS
    // ================================================================
    private persistPeriodOverrides(): void {
        try {
            localStorage.setItem(
                LS_PERIOD_OVERRIDES,
                JSON.stringify(Object.fromEntries(this.periodOverrides))
            );
        } catch (e) {}
    }

    private persistActiveSubs(): void {
        try {
            localStorage.setItem(
                LS_ACTIVE_SUBS,
                JSON.stringify(Array.from(this.activeSubs.values()))
            );
        } catch (e) {}
    }

    // ================================================================
    // GET LINE LABEL — reads from paramsMap line_labels
    // ================================================================
    private getLineLabel(key: string, lineName: string): string {
        const params = this.paramsMap.get(key);
        if (!params) return '';
        return params.line_labels[lineName] ?? '';
    }

    // ================================================================
    // GET PERIOD LABEL — for legend value display
    // ================================================================
    private getPeriodLabel(key: string, lineName: string): string {
        const params = this.paramsMap.get(key);
        if (!params) return '';

        const lineLabel = params.line_labels[lineName] ?? lineName;
        const override  = this.periodOverrides.get(key);

        // ── Only show period label for single-period indicators ──
        if (params.period_fields.length === 1 &&
            params.period_fields[0].field === 'period')
        {
            const period = override ?? params.period;
            return period > 0 ? `(${period})` : '';
        }

        return '';
    }

    // ================================================================
    // GET EFFECTIVE SETTINGS — merges params + period overrides
    // ================================================================
    private getEffectiveSettings(key: string): Record<string, any> {
        const params = this.paramsMap.get(key);
        if (!params) return {};
        const override = this.periodOverrides.get(key);
        return {
            ...params,
            period: override ?? params.period
        };
    }

    // ================================================================
    // FLUSH PENDING SET DATA
    // ================================================================
    private flushPendingSetData(): void {
        if (this.pendingSetData.size === 0) return;

        const snapshot = new Map(this.pendingSetData);
        this.pendingSetData.clear();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                snapshot.forEach((entries, id) => {
                    const indicator = this.pool.get(id);
                    if (!indicator) return;

                    entries.forEach(({ series, chartData }) => {
                        if (chartData.length > 0) {
                            try { series.setData(chartData as any); } catch (e) {}
                        }
                    });

                    indicator.active = true;
                });
            });
        });
    }

    // ================================================================
    // ON INDICATOR UPDATE
    // ================================================================
    public onIndicatorUpdate(data: IndicatorUpdatePayload): void {
        if (!this.chart) return;

        if (this.currentTimeframe && data.timeframe !== this.currentTimeframe) return;

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
    // CREATE
    // ================================================================
    private createIndicator(
        id:   string,
        data: IndicatorUpdatePayload
    ): void {
        if (this.pool.has(id)) return;

        const precision  = getDecimalPrecision(data.symbol);
        const minMove    = 1 / Math.pow(10, precision);

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
            active:    false
        };

        if (!this.savedSettings.has(data.key)) {
            this.savedSettings.set(data.key, new Map());
        }
        const keySaved = this.savedSettings.get(data.key)!;

        const legendValues: Array<{
            key:   string;
            label: string;
            value: string;
            color: string;
        }> = [];

        const pendingEntries: PendingSetData[] = [];

        data.lines.forEach((line, index) => {
            const saved = keySaved.get(line.name);

            const color = saved?.color
                ?? INDICATOR_COLORS[data.key]
                ?? LINE_COLORS[index % LINE_COLORS.length];

            const width                  = saved?.width                  ?? 1;
            const priceLineVisible       = saved?.priceLineVisible       ?? false;
            const lastValueVisible       = saved?.lastValueVisible       ?? true;
            const crosshairMarkerVisible = saved?.crosshairMarkerVisible ?? true;
            const lastValue              = line.values[line.values.length - 1] ?? 0;

            if (!saved) {
                keySaved.set(line.name, {
                    color,
                    width,
                    priceLineVisible,
                    lastValueVisible,
                    crosshairMarkerVisible
                });
            }

            try {
                const series = this.chart.addSeries(LineSeries, {
                    color,
                    lineWidth:              width,
                    lastValueVisible,
                    priceLineVisible,
                    crosshairMarkerVisible,
                    priceFormat: { type: 'price', precision, minMove }
                });

                const chartData = line.timestamps
                    .map((t, i) => ({ time: t, value: line.values[i] }))
                    .filter(p => !isNaN(p.value) && p.value !== 0);

                pendingEntries.push({ series, chartData });

                indicator.lines.set(line.name, {
                    name:                   line.name,
                    series,
                    color,
                    width,
                    visible:                true,
                    priceLineVisible,
                    lastValueVisible,
                    crosshairMarkerVisible,
                    lastValue
                });

                legendValues.push({
                    key:   line.name,
                    label: this.getPeriodLabel(data.key, line.name),
                    value: lastValue.toFixed(precision),
                    color
                });

            } catch (e) {}
        });

        this.pool.set(id, indicator);

        if (pendingEntries.length > 0) {
            this.pendingSetData.set(id, pendingEntries);
        }

        if (this.chartReady) {
            this.flushPendingSetData();
        }

        if (!isStrategy) {
            const period = this.periodOverrides.get(data.key) ?? 0;
            this.activeSubs.set(data.key, {
                key:       data.key,
                symbol:    data.symbol,
                timeframe: data.timeframe,
                period
            });
            this.persistActiveSubs();
        }

        // ── Guard — prevent duplicate legend entries ──
        if (this.legendIds.has(id)) {
            document.dispatchEvent(new CustomEvent('indicator-value-update', {
                detail: { id, values: legendValues }
            }));
        } else {
            this.legendIds.add(id);
            document.dispatchEvent(new CustomEvent('indicator-added', {
                detail: {
                    id,
                    name:     data.label,
                    color:    legendValues[0]?.color ?? LINE_COLORS[0],
                    icon:     isStrategy ? 'fa-robot' : undefined,
                    pane:     null,
                    values:   legendValues,
                    settings: this.getEffectiveSettings(data.key)
                }
            }));
        }
    }

    // ================================================================
    // UPDATE
    // ================================================================
    private updateIndicator(
        indicator: ActiveIndicator,
        data:      IndicatorUpdatePayload,
        isInitial: boolean
    ): void {
        if (!indicator.active && !isInitial) return;

        const precision = getDecimalPrecision(data.symbol);
        const legendValues: Array<{
            key:   string;
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
                        const existing = this.pendingSetData.get(indicator.id) ?? [];
                        existing.push({ series: activeLine.series, chartData });
                        this.pendingSetData.set(indicator.id, existing);

                        if (this.chartReady) {
                            this.flushPendingSetData();
                        }
                    }
                } else {
                    const t = line.timestamps[0];
                    const v = line.values[0];
                    if (!isNaN(v) && v !== 0) {
                        activeLine.series.update({ time: t, value: v } as any);
                    }
                }
            } catch (e) {}

            const lastVal = line.values[line.values.length - 1];
            if (lastVal !== undefined && lastVal !== 0) {
                activeLine.lastValue = lastVal;
            }

            legendValues.push({
                key:   line.name,
                label: this.getPeriodLabel(indicator.key, line.name),
                value: activeLine.lastValue.toFixed(precision),
                color: activeLine.color
            });
        });

        if (legendValues.length > 0) {
            document.dispatchEvent(new CustomEvent('indicator-value-update', {
                detail: { id: indicator.id, values: legendValues }
            }));
        }

        if (!indicator.active && indicator.isStrategy) {
            // ── Guard — prevent duplicate legend entries ──
            if (!this.legendIds.has(indicator.id)) {
                this.legendIds.add(indicator.id);
                document.dispatchEvent(new CustomEvent('indicator-added', {
                    detail: {
                        id:       indicator.id,
                        name:     indicator.label,
                        color:    legendValues[0]?.color,
                        icon:     'fa-robot',
                        pane:     null,
                        values:   legendValues,
                        settings: this.getEffectiveSettings(indicator.key)
                    }
                }));
            }
        }
    }

    // ================================================================
    // CLEAR SERIES DATA
    // ================================================================
    private clearSeriesData(indicator: ActiveIndicator): void {
        indicator.lines.forEach(line => {
            try { line.series.setData([]); } catch (e) {}
        });
        indicator.active = false;
    }

    // ================================================================
    // ON TIMEFRAME CHANGE
    // ================================================================
    public onTimeframeChange(newTimeframe: string): void {
        this.currentTimeframe = newTimeframe;

        this.chartReady = false;
        this.pendingSetData.clear();

        const toUpdate: Array<{
            oldId:     string;
            newId:     string;
            indicator: ActiveIndicator;
            key:       string;
            symbol:    string;
        }> = [];

        const toHide: string[] = [];

        this.pool.forEach((indicator, id) => {
            if (indicator.isStrategy) {
                this.clearSeriesData(indicator);
                toHide.push(id);
            } else {
                document.dispatchEvent(new CustomEvent('indicator-removed', {
                    detail: {
                        key:       indicator.key,
                        symbol:    indicator.symbol,
                        timeframe: indicator.timeframe
                    }
                }));

                this.clearSeriesData(indicator);

                toUpdate.push({
                    oldId:     id,
                    newId:     `${indicator.key}_${indicator.symbol}_${newTimeframe}`,
                    indicator,
                    key:       indicator.key,
                    symbol:    indicator.symbol
                });
            }
        });

        toHide.forEach(id => {
            this.legendIds.delete(id);
            document.dispatchEvent(new CustomEvent('indicator-tf-inactive', {
                detail: { id, deployedTF: this.pool.get(id)?.timeframe }
            }));
        });

        toUpdate.forEach(({ oldId, newId, indicator, key, symbol }) => {
            this.pool.delete(oldId);
            indicator.id        = newId;
            indicator.timeframe = newTimeframe;
            indicator.active    = false;
            this.pool.set(newId, indicator);

            this.legendIds.delete(oldId);
            this.legendIds.add(newId);

            const sub = this.activeSubs.get(key);
            if (sub) {
                sub.timeframe = newTimeframe;
                this.persistActiveSubs();
            }

            document.dispatchEvent(new CustomEvent('indicator-id-updated', {
                detail: { oldId, newId }
            }));

            document.dispatchEvent(new CustomEvent('resubscribe-indicator', {
                detail: {
                    key,
                    symbol,
                    timeframe: newTimeframe,
                    period:    this.periodOverrides.get(key) ?? 0
                }
            }));
        });
    }

    // ================================================================
    // ON SYMBOL CHANGE
    // ================================================================
    public onSymbolChange(newSymbol: string): void {
        this.currentSymbol = newSymbol;

        this.chartReady = false;
        this.pendingSetData.clear();

        const toUpdate: Array<{
            oldId:     string;
            newId:     string;
            indicator: ActiveIndicator;
            key:       string;
            timeframe: string;
        }> = [];

        const toHide: string[] = [];

        this.pool.forEach((indicator, id) => {
            if (indicator.isStrategy) {
                this.clearSeriesData(indicator);
                toHide.push(id);
            } else {
                document.dispatchEvent(new CustomEvent('indicator-removed', {
                    detail: {
                        key:       indicator.key,
                        symbol:    indicator.symbol,
                        timeframe: indicator.timeframe
                    }
                }));

                this.clearSeriesData(indicator);

                toUpdate.push({
                    oldId:     id,
                    newId:     `${indicator.key}_${newSymbol}_${indicator.timeframe}`,
                    indicator,
                    key:       indicator.key,
                    timeframe: indicator.timeframe
                });
            }
        });

        toHide.forEach(id => {
            this.legendIds.delete(id);
            document.dispatchEvent(new CustomEvent('indicator-tf-inactive', {
                detail: { id }
            }));
        });

        toUpdate.forEach(({ oldId, newId, indicator, key, timeframe }) => {
            this.pool.delete(oldId);
            indicator.id     = newId;
            indicator.symbol = newSymbol;
            indicator.active = false;
            this.pool.set(newId, indicator);

            this.legendIds.delete(oldId);
            this.legendIds.add(newId);

            const sub = this.activeSubs.get(key);
            if (sub) {
                sub.symbol = newSymbol;
                this.persistActiveSubs();
            }

            document.dispatchEvent(new CustomEvent('indicator-id-updated', {
                detail: { oldId, newId }
            }));

            document.dispatchEvent(new CustomEvent('resubscribe-indicator', {
                detail: {
                    key,
                    symbol:    newSymbol,
                    timeframe,
                    period:    this.periodOverrides.get(key) ?? 0
                }
            }));
        });
    }

    // ================================================================
    // CLEAR ALL
    // ================================================================
    public clearAll(): void {
        this.pool.forEach(indicator => { this.clearSeriesData(indicator); });
        this.pool.clear();
        this.legendIds.clear();
        this.savedSettings.clear();
        this.periodOverrides.clear();
        this.activeSubs.clear();
        this.pendingSetData.clear();
        this.chartReady = false;
    }

    // ================================================================
    // REMOVE INDICATOR
    // ================================================================
    public removeIndicator(id: string): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        this.clearSeriesData(indicator);
        this.pool.delete(id);
        this.legendIds.delete(id);
        this.savedSettings.delete(indicator.key);
        this.periodOverrides.delete(indicator.key);
        this.activeSubs.delete(indicator.key);
        this.pendingSetData.delete(id);
        this.persistPeriodOverrides();
        this.persistActiveSubs();

        document.dispatchEvent(new CustomEvent('indicator-removed', {
            detail: {
                key:       indicator.key,
                symbol:    indicator.symbol,
                timeframe: indicator.timeframe
            }
        }));
    }

    // ================================================================
    // REMOVE STRATEGY FROM CHART — frontend only, no backend call
    // ================================================================
    public removeStrategyFromChart(id: string): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        indicator.lines.forEach(line => {
            try { line.series.setData([]); } catch (e) {}
        });

        this.pool.delete(id);
        this.legendIds.delete(id);
        this.savedSettings.delete(indicator.key);
        this.periodOverrides.delete(indicator.key);
        this.activeSubs.delete(indicator.key);
        this.pendingSetData.delete(id);
        this.persistPeriodOverrides();
        this.persistActiveSubs();
    }

    // ================================================================
    // VISIBILITY TOGGLE
    // ================================================================
    public toggleVisibility(id: string): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        indicator.lines.forEach(line => {
            line.visible = !line.visible;
            try { line.series.applyOptions({ visible: line.visible }); } catch (e) {}
        });
    }

    // ================================================================
    // UPDATE LINES
    // ================================================================
    private updateLines(
        id:    string,
        lines: Record<string, {
            color?:                  string;
            lineWidth?:              number;
            priceLineVisible?:       boolean;
            lastValueVisible?:       boolean;
            crosshairMarkerVisible?: boolean;
        }>
    ): void {
        const indicator = this.pool.get(id);
        if (!indicator) return;

        if (!this.savedSettings.has(indicator.key)) {
            this.savedSettings.set(indicator.key, new Map());
        }
        const keySaved   = this.savedSettings.get(indicator.key)!;
        const precision  = getDecimalPrecision(indicator.symbol);
        const legendValues: Array<{
            key:   string;
            label: string;
            value: string;
            color: string;
        }> = [];

        Object.entries(lines).forEach(([name, opts]) => {
            const line = indicator.lines.get(name);
            if (!line) return;

            const apply: any = {};

            if (opts.color                  !== undefined) { apply.color                  = opts.color;                 line.color                  = opts.color; }
            if (opts.lineWidth              !== undefined) { apply.lineWidth              = opts.lineWidth;              line.width                  = opts.lineWidth; }
            if (opts.priceLineVisible       !== undefined) { apply.priceLineVisible       = opts.priceLineVisible;       line.priceLineVisible       = opts.priceLineVisible; }
            if (opts.lastValueVisible       !== undefined) { apply.lastValueVisible       = opts.lastValueVisible;       line.lastValueVisible       = opts.lastValueVisible; }
            if (opts.crosshairMarkerVisible !== undefined) { apply.crosshairMarkerVisible = opts.crosshairMarkerVisible; line.crosshairMarkerVisible = opts.crosshairMarkerVisible; }

            try { line.series.applyOptions(apply); } catch (e) {}

            keySaved.set(name, {
                color:                  line.color,
                width:                  line.width,
                priceLineVisible:       line.priceLineVisible,
                lastValueVisible:       line.lastValueVisible,
                crosshairMarkerVisible: line.crosshairMarkerVisible
            });

            legendValues.push({
                key:   line.name,
                label: this.getPeriodLabel(indicator.key, line.name),
                value: line.lastValue.toFixed(precision),
                color: line.color
            });
        });

        const firstLineName = indicator.lines.keys().next().value;
        const firstLine     = firstLineName ? indicator.lines.get(firstLineName) : null;
        if (firstLine) {
            document.dispatchEvent(new CustomEvent('legend-item-color-update', {
                detail: { id: indicator.id, color: firstLine.color }
            }));
        }

        if (legendValues.length > 0) {
            document.dispatchEvent(new CustomEvent('indicator-value-update', {
                detail: { id: indicator.id, values: legendValues }
            }));
        }
    }

    // ================================================================
    // GETTERS
    // ================================================================
    public hasIndicator(id: string): boolean {
        return this.pool.has(id);
    }

    public isStrategy(id: string): boolean {
        return this.pool.get(id)?.isStrategy ?? false;
    }

    public getSavedSettings(key: string): Map<string, SavedLineSettings> | null {
        return this.savedSettings.get(key) ?? null;
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
        this.savedSettings.clear();
        this.periodOverrides.clear();
        this.activeSubs.clear();
        this.pendingSetData.clear();
        this.chartReady    = false;
        this.chart         = null;
        this.mainChart     = null;
    }
}

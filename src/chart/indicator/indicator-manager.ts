// ================================================================
// ⚡ INDICATOR MANAGER - Backend Driven
// Handles both indicators and strategies — one manager
// Backend computes all values + timestamps — frontend renders only
// Series never removed — hide/show/reuse for performance
// One series per line in IndicatorUpdate.lines[]
// Colors and line width owned by frontend
// Persistence — active subs + period overrides in localStorage
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
// INDICATOR MANAGER
// ================================================================
export class IndicatorManager {
    private chart:         any    = null;
    private mainChart:     any    = null;
    private currentSymbol: string = '';

    private pool:      Map<string, ActiveIndicator> = new Map();
    private legendIds: Set<string>                  = new Set();

    private paramsMap: Map<string, IndicatorParams> = new Map();

    // ── Period overrides — persisted to localStorage ──
    private periodOverrides: Map<string, number> = new Map();

    // ── Active subs — persisted to localStorage ──
    private activeSubs: Map<string, ActiveSub> = new Map();

    // ── Persisted line settings — key = indicator key (e.g. 'EMA') ──
    private savedSettings: Map<string, Map<string, SavedLineSettings>> = new Map();

    private abortController: AbortController | null = null;

    public onPaneCreated: ((pane: any) => Promise<void>) | null = null;

    // ==================== SETUP ====================

    public setChart(chart: any):         void { this.chart         = chart; }
    public setMainChart(mainChart: any): void { this.mainChart     = mainChart; }
    public setSymbol(symbol: string):    void { this.currentSymbol = symbol; }

    public initialize(): void {
        // ── Restore period overrides from localStorage ──
        try {
            const saved = localStorage.getItem(LS_PERIOD_OVERRIDES);
            if (saved) {
                const parsed = JSON.parse(saved) as Record<string, number>;
                Object.entries(parsed).forEach(([key, period]) => {
                    this.periodOverrides.set(key, period);
                });
            }
        } catch (e) {}

        // ── Restore active subs from localStorage ──
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

        // ── On chart initial data loaded — resubscribe persisted indicators ──
        document.addEventListener('chart-initial-data-loaded', (e: Event) => {
            const { symbol, timeframe } = (e as CustomEvent).detail;
            if (!symbol || !timeframe) return;

            this.activeSubs.forEach(sub => {
                const period = this.periodOverrides.get(sub.key) ?? sub.period;
                document.dispatchEvent(new CustomEvent('resubscribe-indicator', {
                    detail: {
                        key:      sub.key,
                        symbol,
                        timeframe,
                        period
                    }
                }));
            });
        }, { signal });

        document.addEventListener('indicator-settings-changed', (e: Event) => {
            const { indicatorId, lines } = (e as CustomEvent).detail;
            if (indicatorId && lines) this.updateLines(indicatorId, lines);
        }, { signal });

        document.addEventListener('indicator-period-changed', (e: Event) => {
            const { indicatorId, periodOverrides } = (e as CustomEvent).detail;
            if (!indicatorId || !periodOverrides) return;

            const indicator = this.pool.get(indicatorId);
            if (!indicator) return;

            const period = Object.values(periodOverrides as Record<string, number>)
                .find(v => v > 0) ?? 0;

            if (period === 0) return;

            // ── Persist override ──
            this.periodOverrides.set(indicator.key, period);
            this.persistPeriodOverrides();

            // ── Update active sub period ──
            const sub = this.activeSubs.get(indicator.key);
            if (sub) {
                sub.period = period;
                this.persistActiveSubs();
            }

            // ── Update legend item settings so modal seeds correctly ──
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
                    overbought:    item.overbought     ?? 0,
                    oversold:      item.oversold      ?? 0,
                    volume:        item.volume        ?? 0.0,
                    price_type:    item.price_type    ?? 'close',
                    is_strategy:   item.is_strategy   ?? false,
                    description:   item.description   ?? ''
                });
            });
        }, { signal });
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
    // GET PERIOD LABEL — override first, fallback to paramsMap
    // ================================================================
    private getPeriodLabel(key: string, lineName: string): string {
        const params = this.paramsMap.get(key);
        if (!params) return '';

        if (lineName === 'ema' || lineName === 'sma' || lineName === 'line') {
            const period = this.periodOverrides.get(key) ?? params.period;
            return period > 0 ? `(${period})` : '';
        }
        if (lineName === 'fast') {
            return params.fast_period > 0 ? `(${params.fast_period})` : '';
        }
        if (lineName === 'slow') {
            return params.slow_period > 0 ? `(${params.slow_period})` : '';
        }

        return '';
    }

    // ================================================================
    // GET EFFECTIVE SETTINGS — merges paramsMap with period override
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
    // ON INDICATOR UPDATE
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
    // CREATE
    // ================================================================
    private createIndicator(
        id:   string,
        data: IndicatorUpdatePayload
    ): void {
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
            active:    true
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

                if (chartData.length > 0) {
                    series.setData(chartData as any);
                }

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

        // ── Track active sub — indicators only, not strategies ──
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

        // ── legendIds uses full id (key_symbol_tf) ──
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

            // ── Store last known value ──
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

        // ── Update values on legend ──
        if (legendValues.length > 0) {
            document.dispatchEvent(new CustomEvent('indicator-value-update', {
                detail: { id: indicator.id, values: legendValues }
            }));
        }

        // ── Re-add legend if strategy was inactive (TF change removed it) ──
        if (!indicator.active && indicator.isStrategy) {
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

        indicator.active = true;
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
    // Indicators — unsub old, resub new TF
    // Strategies — clear chart lines + legend only, backend manages lifecycle
    // ================================================================
    public onTimeframeChange(newTimeframe: string): void {
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
                // ── Strategy: clear lines + hide legend, stay in pool ──
                this.clearSeriesData(indicator);
                toHide.push(id);
            } else {
                // ── Indicator: unsub old TF, resub new TF ──
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

        // ── Hide strategy legend items — dispatch indicator-tf-inactive ──
        toHide.forEach(id => {
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

            // ── Update legendIds to new id ──
            this.legendIds.delete(oldId);
            this.legendIds.add(newId);

            // ── Update persisted sub timeframe ──
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
    // Indicators — unsub old, resub new symbol
    // Strategies — clear chart lines + legend only, backend manages lifecycle
    // ================================================================
    public onSymbolChange(newSymbol: string): void {
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
                // ── Strategy: clear lines + hide legend, stay in pool ──
                this.clearSeriesData(indicator);
                toHide.push(id);
            } else {
                // ── Indicator: unsub old symbol, resub new symbol ──
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

        // ── Hide strategy legend items only — no pool delete, no backend call ──
        toHide.forEach(id => {
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

            // ── Update legendIds to new id ──
            this.legendIds.delete(oldId);
            this.legendIds.add(newId);

            // ── Update persisted sub symbol ──
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
    // CLEAR ALL — wipes memory only, localStorage preserved
    // ================================================================
    public clearAll(): void {
        this.pool.forEach(indicator => { this.clearSeriesData(indicator); });
        this.pool.clear();
        this.legendIds.clear();
        this.savedSettings.clear();
        this.periodOverrides.clear();
        this.activeSubs.clear();
        // ── localStorage NOT cleared — preserved for refresh/reconnect ──
    }

    // ================================================================
    // REMOVE — user explicitly removes indicator (calls backend unsubscribe)
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
    // UPDATE LINES — applies color/width/options + dispatches legend update
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

            if (opts.color                  !== undefined) { apply.color                  = opts.color;                  line.color                  = opts.color; }
            if (opts.lineWidth              !== undefined) { apply.lineWidth              = opts.lineWidth;               line.width                  = opts.lineWidth; }
            if (opts.priceLineVisible       !== undefined) { apply.priceLineVisible       = opts.priceLineVisible;        line.priceLineVisible       = opts.priceLineVisible; }
            if (opts.lastValueVisible       !== undefined) { apply.lastValueVisible       = opts.lastValueVisible;        line.lastValueVisible       = opts.lastValueVisible; }
            if (opts.crosshairMarkerVisible !== undefined) { apply.crosshairMarkerVisible = opts.crosshairMarkerVisible;  line.crosshairMarkerVisible = opts.crosshairMarkerVisible; }

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

        // ── Sync legend dot color ──
        const firstLineName = indicator.lines.keys().next().value;
        const firstLine     = firstLineName ? indicator.lines.get(firstLineName) : null;
        if (firstLine) {
            document.dispatchEvent(new CustomEvent('legend-item-color-update', {
                detail: { id: indicator.id, color: firstLine.color }
            }));
        }

        // ── Sync legend value color immediately ──
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
        // ── localStorage NOT cleared — preserved for refresh/reconnect ──
        this.chart     = null;
        this.mainChart = null;
    }
}

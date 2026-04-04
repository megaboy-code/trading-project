// ================================================================
// 📐 CHART TYPES - Shared interfaces across chart/ folder
// ================================================================

import { Time } from 'lightweight-charts';

// ==================== CONNECTION ====================

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// ==================== LEGEND ====================

export interface LegendItemValue {
    label?: string;
    value:  string;
    color:  string;
}

export interface LegendItem {
    id:        string;
    name:      string;
    color:     string;
    values:    LegendItemValue[];
    icon?:     string;
    pane?:     any;
    settings?: Record<string, any>;
}

export interface LegendUpdateData {
    symbol?:        string;
    timeframe?:     string;
    price?:         number | null;
    precision?:     number;
    volumeVisible?: boolean;
}

// ==================== INDICATORS ====================

export type PriceSource = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';

export interface IndicatorSettings {
    period: number;
    source: PriceSource;
    color?: string;
    overbought?: number;
    oversold?:   number;
    [key: string]: any;
}

// ==================== CHART ====================

export type ChartType  = 'candlestick' | 'line' | 'area' | 'baseline';
export type ChartState = 'IDLE' | 'LOADING' | 'READY';

// ==================== OHLC ====================

export interface OHLCData {
    time:    number;
    open:    number;
    high:    number;
    low:     number;
    close:   number;
    volume?: number;
}

// ==================== DRAWING ====================

export interface DrawingToolsConfig {
    precision:      number;
    showLabels:     boolean;
    priceFormatter: (price: number) => string;
}

// ==================== CHART COLORS ====================

export interface ChartColors {
    background:  string;
    grid:        string;
    bull:        string;
    bear:        string;
    line:        string;
    volumeBull:  string;
    volumeBear:  string;
    scaleBorder: string;
    crosshair?:  string;
    textColor?:  string;
    wickBull?:   string;
    wickBear?:   string;
    borderBull?: string;
    borderBear?: string;
}

// ==================== SYSTEM / DARK THEME ====================
// ✅ Merged — system and dark are the same

export const DEFAULT_CHART_COLORS: ChartColors = {
    background:  '#0b111b',
    grid:        '#1e2a3a',
    bull:        '#00e08a',
    bear:        '#ff3d57',
    line:        '#4c8dff',
    volumeBull:  '#00e08a',
    volumeBear:  '#ff3d57',
    scaleBorder: '#2a384a',
    crosshair:   '#3a4a5c',
    textColor:   '#c8d4e8',
    wickBull:    '#00e08a',
    wickBear:    '#ff3d57',
    borderBull:  '#00e08a',
    borderBear:  '#ff3d57'
};

export const DARK_CHART_COLORS: ChartColors = DEFAULT_CHART_COLORS;

// ==================== LIGHT THEME ====================
// ✅ Clean cool white — no warm tones

export const LIGHT_CHART_COLORS: ChartColors = {
    background:  '#f8f9fc',
    grid:        '#e4e8f0',
    bull:        '#0a8a58',
    bear:        '#d42030',
    line:        '#1a54b0',
    volumeBull:  '#0a8a58',
    volumeBear:  '#d42030',
    scaleBorder: '#ccd3e0',
    crosshair:   '#8896aa',
    textColor:   '#1a2030',
    wickBull:    '#0a8a58',
    wickBear:    '#d42030',
    borderBull:  '#0a8a58',
    borderBear:  '#d42030'
};

// ==================== SETTINGS MODAL ====================

export interface SettingsModalConfig {
    colors:    ChartColors;
    chartType: string;
    symbol:    string;
}
// ================================================================
// 📊 MAIN LEGEND - Symbol, Timeframe, OHLC, Status
// ================================================================

import { getSymbolName, formatPrice } from './utils';
import { ConnectionStatus } from '../chart-types';

const STATUS_COLORS: Record<ConnectionStatus, string> = {
    connected:    '#10b981',
    disconnected: '#ef4444',
    connecting:   '#f59e0b',
    error:        '#dc2626'
};

export class MainLegend {
    private container:    HTMLElement | null = null;
    private nameEl:       HTMLElement | null = null;
    private timeframeEl:  HTMLElement | null = null;
    private dotInnerEl:   HTMLElement | null = null;
    private dotOuterEl:   HTMLElement | null = null;
    private caretEl:      HTMLElement | null = null;
    private precision:    number = 5;

    private ohlcEls: {
        o: HTMLElement | null;
        h: HTMLElement | null;
        l: HTMLElement | null;
        c: HTMLElement | null;
    } = { o: null, h: null, l: null, c: null };

    public onToggleCollapse: (() => void) | null = null;

    public create(): HTMLElement {
        this.container = document.createElement('div');
        this.container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            pointer-events: none;
            user-select: none;
            font-family: 'Inter', sans-serif;
        `;

        // ── Main row ──
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            line-height: 16px;
            height: 16px;
        `;

        // ── Full symbol name ──
        this.nameEl = document.createElement('span');
        this.nameEl.style.cssText = `
            color: var(--text-primary);
            font-weight: 700;
            white-space: nowrap;
        `;

        const sep1 = this.makeSep();

        // ── Timeframe ──
        this.timeframeEl = document.createElement('span');
        this.timeframeEl.style.cssText = `
            color: var(--text-muted);
            font-weight: 700;
            white-space: nowrap;
        `;

        const sep2 = this.makeSep();

        // ── Connection dot — TV style: outer ring + inner circle ──
        const dotWrapper = document.createElement('div');
        dotWrapper.style.cssText = `
            position: relative;
            width: 10px;
            height: 10px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        this.dotOuterEl = document.createElement('div');
        this.dotOuterEl.style.cssText = `
            position: absolute;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            border: 1.5px solid #ef4444;
            opacity: 0.4;
        `;

        this.dotInnerEl = document.createElement('div');
        this.dotInnerEl.style.cssText = `
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #ef4444;
            flex-shrink: 0;
        `;

        dotWrapper.appendChild(this.dotOuterEl);
        dotWrapper.appendChild(this.dotInnerEl);

        const sep3 = this.makeSep();

        // ── OHLC ──
        const ohlcO = this.makeOhlcItem('O:');
        const ohlcH = this.makeOhlcItem('H:');
        const ohlcL = this.makeOhlcItem('L:');
        const ohlcC = this.makeOhlcItem('C:');

        this.ohlcEls.o = ohlcO.val;
        this.ohlcEls.h = ohlcH.val;
        this.ohlcEls.l = ohlcL.val;
        this.ohlcEls.c = ohlcC.val;

        // ── Assemble row: symbol · tf · dot · O H L C ──
        row.appendChild(this.nameEl);
        row.appendChild(sep1);
        row.appendChild(this.timeframeEl);
        row.appendChild(sep2);
        row.appendChild(dotWrapper);
        row.appendChild(sep3);
        [ohlcO, ohlcH, ohlcL, ohlcC].forEach(({ cell }) => row.appendChild(cell));

        // ── Caret — below items, hidden by default ──
        this.caretEl = document.createElement('div');
        this.caretEl.style.cssText = `
            display: none;
            align-items: center;
            justify-content: flex-start;
            padding-left: 4px;
            cursor: pointer;
            pointer-events: auto;
            height: 12px;
        `;
        this.caretEl.innerHTML = `
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                <path d="M1 1L6 7L11 1" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        this.caretEl.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.onToggleCollapse) this.onToggleCollapse();
        });

        this.container.appendChild(row);
        this.container.appendChild(this.caretEl);

        return this.container;
    }

    // ==================== HELPERS ====================

    private makeSep(): HTMLElement {
        const sep = document.createElement('span');
        sep.style.cssText = `
            color: var(--border);
            font-weight: 400;
            flex-shrink: 0;
        `;
        sep.textContent = '·';
        return sep;
    }

    private makeOhlcItem(label: string): { cell: HTMLElement; val: HTMLElement } {
        const cell = document.createElement('span');
        cell.style.cssText = `
            display: inline-flex;
            align-items: baseline;
            gap: 2px;
            margin-right: 1px;
        `;

        const lbl = document.createElement('span');
        lbl.style.cssText = `
            color: var(--text-muted);
            font-size: 9px;
            font-weight: 600;
        `;
        lbl.textContent = label;

        const val = document.createElement('span');
        val.style.cssText = `
            color: var(--text-primary);
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            font-size: 10px;
            white-space: nowrap;
        `;
        val.textContent = '--';

        cell.appendChild(lbl);
        cell.appendChild(val);
        return { cell, val };
    }

    // ==================== PUBLIC UPDATE ====================

    public updateSymbol(symbol: string): void {
        if (this.nameEl) this.nameEl.textContent = getSymbolName(symbol);
    }

    public updateTimeframe(timeframe: string): void {
        if (this.timeframeEl) this.timeframeEl.textContent = timeframe;
    }

    public updatePrecision(precision: number): void {
        this.precision = precision;
    }

    public updateOHLC(
        o: number | null,
        h: number | null,
        l: number | null,
        c: number | null
    ): void {
        // ✅ If all null — crosshair left, keep last known values
        if (o === null && h === null && l === null && c === null) return;

        const fmt = (v: number | null) => v !== null ? formatPrice(v, this.precision) : '--';

        if (this.ohlcEls.o) this.ohlcEls.o.textContent = fmt(o);
        if (this.ohlcEls.h) this.ohlcEls.h.textContent = fmt(h);
        if (this.ohlcEls.l) this.ohlcEls.l.textContent = fmt(l);
        if (this.ohlcEls.c) this.ohlcEls.c.textContent = fmt(c);
    }

    public updateStatus(status: ConnectionStatus): void {
        if (!this.dotInnerEl || !this.dotOuterEl) return;
        const color = STATUS_COLORS[status] || '#ef4444';
        this.dotInnerEl.style.background     = color;
        this.dotOuterEl.style.borderColor    = color;
    }

    public setCollapsed(collapsed: boolean): void {
        if (!this.caretEl) return;
        const svg = this.caretEl.querySelector('svg');
        if (svg) svg.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    }

    public setCaretVisible(visible: boolean): void {
        if (!this.caretEl) return;
        this.caretEl.style.display = visible ? 'flex' : 'none';
    }

    // ==================== DESTROY ====================

    public destroy(): void {
        this.container    = null;
        this.nameEl       = null;
        this.timeframeEl  = null;
        this.dotInnerEl   = null;
        this.dotOuterEl   = null;
        this.caretEl      = null;
        this.ohlcEls      = { o: null, h: null, l: null, c: null };
        this.onToggleCollapse = null;
    }
}

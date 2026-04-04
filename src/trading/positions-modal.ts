// ================================================================
// ⚡ POSITIONS MODAL - Modal, Table, Inline Editor, Drag
// ================================================================

import { PositionData } from '../types';
import { formatPrice, getPipSize } from '../core/price-utils';

const TPSL_DEFAULT_PIPS = 20;

interface InlineEditorState {
    active:   boolean;
    ticket:   string | null;
    isBuy:    boolean;
    symbol:   string;

    slFixed:  boolean;
    slPrice:  number;
    slPips:   number;

    tpFixed:  boolean;
    tpPrice:  number;
    tpPips:   number;
}

export class PositionsModal {

    private inlineEditor: InlineEditorState = {
        active:   false,
        ticket:   null,
        isBuy:    true,
        symbol:   'EURUSD',
        slFixed:  false,
        slPrice:  0,
        slPips:   TPSL_DEFAULT_PIPS,
        tpFixed:  false,
        tpPrice:  0,
        tpPips:   TPSL_DEFAULT_PIPS,
    };

    private dragCleanup:     (() => void) | null = null;
    private activeRowTicket: string | null       = null;

    private currentAsk:      number = 0;
    private currentPositions: PositionData[] = [];

    // ================================================================
    // PUBLIC API
    // ================================================================

    public updateAsk(ask: number): void {
        this.currentAsk = ask;
    }

    public updatePositions(positions: PositionData[]): void {
        this.currentPositions = positions;
    }

    public open(): void {
        const modal = document.getElementById('positionsModal');
        if (!modal) return;

        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }

        modal.classList.remove('hidden');
        this.renderPositionsTable();
        this.setupModalControls();

        if (!this.dragCleanup) {
            this.dragCleanup = this.setupDrag();
        }
    }

    public close(): void {
        const modal = document.getElementById('positionsModal');
        modal?.classList.add('hidden');
        this.collapseInlineEditor();
        this.activeRowTicket = null;
    }

    public updateRows(positions: PositionData[]): void {
        this.currentPositions = positions;

        const tbody = document.getElementById('positionsTableBody');
        const empty = document.getElementById('positionsEmpty');
        const table = document.getElementById('positionsTable');

        if (!tbody) return;

        if (positions.length === 0) {
            empty?.classList.remove('hidden');
            table?.classList.add('hidden');
            this.collapseInlineEditor();
            this.renderSummaryBar();
            return;
        }

        empty?.classList.add('hidden');
        table?.classList.remove('hidden');

        const newTickets      = new Set(positions.map(p => String(p.ticket)));
        const existingTickets = new Set(
            Array.from(tbody.querySelectorAll('tr'))
                .map(tr => (tr as HTMLElement).dataset.ticket)
                .filter((t): t is string => t !== undefined)
        );

        existingTickets.forEach(ticket => {
            if (!newTickets.has(ticket)) {
                tbody.querySelector(`tr[data-ticket="${ticket}"]`)?.remove();
            }
        });

        positions.forEach(pos => {
            const ticket   = String(pos.ticket);
            const pnl      = pos.profit ?? 0;
            const pnlClass = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            const pnlStr   = `${pnl >= 0 ? '+$' : '-$'}${Math.abs(pnl).toFixed(2)}`;
            const existing = tbody.querySelector(`tr[data-ticket="${ticket}"]`) as HTMLElement;

            if (existing) {
                const cells = existing.querySelectorAll('td');

                const newPrice = String(pos.current_price ?? '—');
                if (cells[4] && cells[4].textContent !== newPrice) cells[4].textContent = newPrice;

                const newSl = String(pos.sl ?? '—');
                if (cells[5] && cells[5].textContent !== newSl) cells[5].textContent = newSl;

                const newTp = String(pos.tp ?? '—');
                if (cells[6] && cells[6].textContent !== newTp) cells[6].textContent = newTp;

                if (cells[7]) {
                    if (cells[7].textContent !== pnlStr) cells[7].textContent = pnlStr;
                    if (cells[7].className   !== pnlClass) cells[7].className = pnlClass;
                }
            } else {
                this.renderPositionsTable();
            }
        });

        this.renderSummaryBar();
    }

    public updateInlineOnTick(ask: number): void {
        this.currentAsk = ask;
        if (!this.inlineEditor.active) return;

        const price   = ask;
        const symbol  = this.inlineEditor.symbol;
        const pipSize = getPipSize(symbol);
        const isBuy   = this.inlineEditor.isBuy;

        const slInput = document.getElementById('inlineSlInput') as HTMLInputElement;
        const tpInput = document.getElementById('inlineTpInput') as HTMLInputElement;

        if (!this.inlineEditor.slFixed) {
            const slPrice = isBuy
                ? price - this.inlineEditor.slPips * pipSize
                : price + this.inlineEditor.slPips * pipSize;
            this.inlineEditor.slPrice = parseFloat(formatPrice(symbol, slPrice));
            if (slInput && document.activeElement !== slInput) {
                slInput.value = formatPrice(symbol, slPrice);
            }
        }

        if (!this.inlineEditor.tpFixed) {
            const tpPrice = isBuy
                ? price + this.inlineEditor.tpPips * pipSize
                : price - this.inlineEditor.tpPips * pipSize;
            this.inlineEditor.tpPrice = parseFloat(formatPrice(symbol, tpPrice));
            if (tpInput && document.activeElement !== tpInput) {
                tpInput.value = formatPrice(symbol, tpPrice);
            }
        }

        this.renderInlinePipsFromState();
    }

    // ================================================================
    // MODAL CONTROLS
    // ================================================================

    private setupModalControls(): void {
        const closeBtn    = document.getElementById('positionsModalClose');
        const closeAllBtn = document.getElementById('modalCloseAllBtn');

        closeBtn?.addEventListener('click', () => this.close());

        closeAllBtn?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('close-all-positions'));
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
        }, { once: true });
    }

    // ================================================================
    // POSITIONS TABLE
    // ================================================================

    private renderPositionsTable(): void {
        const tbody = document.getElementById('positionsTableBody');
        const empty = document.getElementById('positionsEmpty');
        const table = document.getElementById('positionsTable');

        if (!tbody) return;

        if (this.currentPositions.length === 0) {
            empty?.classList.remove('hidden');
            table?.classList.add('hidden');
            this.collapseInlineEditor();
            return;
        }

        empty?.classList.add('hidden');
        table?.classList.remove('hidden');

        tbody.innerHTML = '';

        this.currentPositions.forEach(pos => {
            const pnl        = pos.profit ?? 0;
            const pnlClass   = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            const typeClass  = pos.type === 'BUY' ? 'type-buy' : 'type-sell';
            const pnlStr     = `${pnl >= 0 ? '+$' : '-$'}${Math.abs(pnl).toFixed(2)}`;
            const isSelected = this.activeRowTicket === String(pos.ticket);

            const tr = document.createElement('tr');
            tr.dataset.ticket = String(pos.ticket);
            if (isSelected) tr.classList.add('selected');

            tr.innerHTML = `
                <td>${pos.symbol}</td>
                <td class="${typeClass}">${pos.type}</td>
                <td>${pos.volume ?? '—'}</td>
                <td>${pos.open_price ?? '—'}</td>
                <td>${pos.current_price ?? '—'}</td>
                <td>${pos.sl ?? '—'}</td>
                <td>${pos.tp ?? '—'}</td>
                <td class="${pnlClass}">${pnlStr}</td>
                <td>
                    <button class="row-close-btn" data-ticket="${pos.ticket}" title="Close trade">
                        <i class="fas fa-xmark"></i>
                    </button>
                </td>
            `;

            tr.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('.row-close-btn')) return;
                this.toggleInlineEditor(pos);
            });

            tr.querySelector('.row-close-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.submitClosePosition(pos);
            });

            tbody.appendChild(tr);
        });

        this.renderSummaryBar();
    }

    // ================================================================
    // SUMMARY BAR
    // ================================================================

    private renderSummaryBar(): void {
        const positions = this.currentPositions;
        const totalPnl  = positions.reduce((sum, p) => sum + (p.profit ?? 0), 0);
        const totalLots = positions.reduce((sum, p) => sum + (p.volume ?? 0), 0);
        const winning   = positions.filter(p => (p.profit ?? 0) >= 0).length;
        const losing    = positions.filter(p => (p.profit ?? 0) <  0).length;

        const pnlEl = document.getElementById('summaryTotalPnl');
        if (pnlEl) {
            const newPnl = `${totalPnl >= 0 ? '+$' : '-$'}${Math.abs(totalPnl).toFixed(2)}`;
            if (pnlEl.textContent !== newPnl) pnlEl.textContent = newPnl;
            pnlEl.classList.toggle('positive', totalPnl >= 0);
            pnlEl.classList.toggle('negative', totalPnl <  0);
        }

        this.setTextIfChanged('summaryTotalLots', totalLots.toFixed(2));
        this.setTextIfChanged('summaryWinning',   String(winning));
        this.setTextIfChanged('summaryLosing',    String(losing));
    }

    // ================================================================
    // INLINE EDITOR
    // ================================================================

    private toggleInlineEditor(pos: PositionData): void {
        const ticket = String(pos.ticket);

        if (this.activeRowTicket === ticket) {
            this.collapseInlineEditor();
            return;
        }

        this.activeRowTicket = ticket;

        document.querySelectorAll('#positionsTableBody tr').forEach(tr => {
            tr.classList.remove('selected');
        });
        document.querySelector(`tr[data-ticket="${ticket}"]`)?.classList.add('selected');

        this.setText('inlineEditorTicket', `#${ticket}`);
        this.setText('inlineEditorTime',   this.formatTime(pos.open_time));

        const price   = this.currentAsk;
        const symbol  = pos.symbol;
        const pipSize = getPipSize(symbol);
        const isBuy   = pos.type === 'BUY';

        this.updateInputSteps(symbol);

        this.inlineEditor.active = true;
        this.inlineEditor.ticket = ticket;
        this.inlineEditor.isBuy  = isBuy;
        this.inlineEditor.symbol = symbol;

        if (pos.sl) {
            this.inlineEditor.slFixed = true;
            this.inlineEditor.slPrice = parseFloat(formatPrice(symbol, pos.sl));
            this.inlineEditor.slPips  = Math.abs(pos.sl - price) / pipSize;
        } else {
            this.inlineEditor.slFixed = false;
            this.inlineEditor.slPips  = TPSL_DEFAULT_PIPS;
            this.inlineEditor.slPrice = parseFloat(formatPrice(symbol,
                isBuy ? price - TPSL_DEFAULT_PIPS * pipSize : price + TPSL_DEFAULT_PIPS * pipSize
            ));
        }

        if (pos.tp) {
            this.inlineEditor.tpFixed = true;
            this.inlineEditor.tpPrice = parseFloat(formatPrice(symbol, pos.tp));
            this.inlineEditor.tpPips  = Math.abs(pos.tp - price) / pipSize;
        } else {
            this.inlineEditor.tpFixed = false;
            this.inlineEditor.tpPips  = TPSL_DEFAULT_PIPS;
            this.inlineEditor.tpPrice = parseFloat(formatPrice(symbol,
                isBuy ? price + TPSL_DEFAULT_PIPS * pipSize : price - TPSL_DEFAULT_PIPS * pipSize
            ));
        }

        const slInput = document.getElementById('inlineSlInput') as HTMLInputElement;
        const tpInput = document.getElementById('inlineTpInput') as HTMLInputElement;

        if (slInput) slInput.value = formatPrice(symbol, this.inlineEditor.slPrice);
        if (tpInput) tpInput.value = formatPrice(symbol, this.inlineEditor.tpPrice);

        this.renderInlinePipsFromState();
        this.setupInlinePipPresets(pos);

        document.getElementById('inlineEditor')?.classList.remove('hidden');

        const updateBtn     = document.getElementById('inlineUpdateBtn');
        const closeTradeBtn = document.getElementById('inlineCloseTradeBtn');
        const cancelBtn     = document.getElementById('inlineCancelBtn');

        const newUpdate = updateBtn?.cloneNode(true)     as HTMLElement;
        const newClose  = closeTradeBtn?.cloneNode(true) as HTMLElement;
        const newCancel = cancelBtn?.cloneNode(true)     as HTMLElement;

        updateBtn?.parentNode?.replaceChild(newUpdate, updateBtn);
        closeTradeBtn?.parentNode?.replaceChild(newClose, closeTradeBtn);
        cancelBtn?.parentNode?.replaceChild(newCancel, cancelBtn);

        newUpdate?.addEventListener('click', () => this.submitModifyPosition(pos));
        newClose?.addEventListener('click',  () => this.submitClosePosition(pos));
        newCancel?.addEventListener('click', () => this.collapseInlineEditor());

        document.getElementById('inlineSlInput')?.addEventListener('input', () => {
            const val = parseFloat((document.getElementById('inlineSlInput') as HTMLInputElement).value);
            if (!isNaN(val)) {
                this.inlineEditor.slFixed = true;
                this.inlineEditor.slPrice = val;
                this.inlineEditor.slPips  = Math.abs(val - this.currentAsk) / getPipSize(symbol);
            }
            this.renderInlinePipsFromState();
        });

        document.getElementById('inlineTpInput')?.addEventListener('input', () => {
            const val = parseFloat((document.getElementById('inlineTpInput') as HTMLInputElement).value);
            if (!isNaN(val)) {
                this.inlineEditor.tpFixed = true;
                this.inlineEditor.tpPrice = val;
                this.inlineEditor.tpPips  = Math.abs(val - this.currentAsk) / getPipSize(symbol);
            }
            this.renderInlinePipsFromState();
        });
    }

    // ================================================================
    // INLINE PIP PRESETS
    // ================================================================

    private setupInlinePipPresets(pos: PositionData): void {
        const container = document.getElementById('inlinePipPresets');
        if (!container) return;

        container.innerHTML = '';

        const symbol  = pos.symbol;
        const pipSize = getPipSize(symbol);
        const pipList = [10, 20, 30, 50, 100];
        const rrList  = [1, 1.5, 2, 3];

        pipList.forEach(pips => {
            const btn = document.createElement('button');
            btn.className   = 'inline-pip-btn';
            btn.textContent = `${pips}p`;
            btn.addEventListener('click', () => {
                const price = this.currentAsk;
                const isBuy = this.inlineEditor.isBuy;

                this.inlineEditor.slFixed = true;
                this.inlineEditor.tpFixed = true;
                this.inlineEditor.slPips  = pips;
                this.inlineEditor.tpPips  = pips;
                this.inlineEditor.slPrice = parseFloat(formatPrice(symbol,
                    isBuy ? price - pips * pipSize : price + pips * pipSize
                ));
                this.inlineEditor.tpPrice = parseFloat(formatPrice(symbol,
                    isBuy ? price + pips * pipSize : price - pips * pipSize
                ));

                const slInput = document.getElementById('inlineSlInput') as HTMLInputElement;
                const tpInput = document.getElementById('inlineTpInput') as HTMLInputElement;
                if (slInput) slInput.value = formatPrice(symbol, this.inlineEditor.slPrice);
                if (tpInput) tpInput.value = formatPrice(symbol, this.inlineEditor.tpPrice);

                this.renderInlinePipsFromState();
            });
            container.appendChild(btn);
        });

        rrList.forEach(rr => {
            const btn = document.createElement('button');
            btn.className   = 'inline-pip-btn rr';
            btn.textContent = `1:${rr}`;
            btn.addEventListener('click', () => {
                const price  = this.currentAsk;
                const isBuy  = this.inlineEditor.isBuy;
                const slPips = TPSL_DEFAULT_PIPS;
                const tpPips = slPips * rr;

                this.inlineEditor.slFixed = true;
                this.inlineEditor.tpFixed = true;
                this.inlineEditor.slPips  = slPips;
                this.inlineEditor.tpPips  = tpPips;
                this.inlineEditor.slPrice = parseFloat(formatPrice(symbol,
                    isBuy ? price - slPips * pipSize : price + slPips * pipSize
                ));
                this.inlineEditor.tpPrice = parseFloat(formatPrice(symbol,
                    isBuy ? price + tpPips * pipSize : price - tpPips * pipSize
                ));

                const slInput = document.getElementById('inlineSlInput') as HTMLInputElement;
                const tpInput = document.getElementById('inlineTpInput') as HTMLInputElement;
                if (slInput) slInput.value = formatPrice(symbol, this.inlineEditor.slPrice);
                if (tpInput) tpInput.value = formatPrice(symbol, this.inlineEditor.tpPrice);

                this.renderInlinePipsFromState();
            });
            container.appendChild(btn);
        });
    }

    // ================================================================
    // INLINE PIPS RENDER
    // ================================================================

    private renderInlinePipsFromState(): void {
        const price   = this.currentAsk;
        const pipSize = getPipSize(this.inlineEditor.symbol);
        const isBuy   = this.inlineEditor.isBuy;

        const slPips = Math.abs(this.inlineEditor.slPrice - price) / pipSize;
        const tpPips = Math.abs(this.inlineEditor.tpPrice - price) / pipSize;

        const slEl = document.getElementById('inlineSlPips');
        const tpEl = document.getElementById('inlineTpPips');

        if (slEl) {
            const newText  = `${isBuy ? '-' : '+'}${slPips.toFixed(1)}p`;
            const newClass = `inline-field-pips ${isBuy ? 'negative' : 'positive'}`;
            if (slEl.textContent !== newText)  slEl.textContent = newText;
            if (slEl.className   !== newClass) slEl.className   = newClass;
        }

        if (tpEl) {
            const newText  = `${isBuy ? '+' : '-'}${tpPips.toFixed(1)}p`;
            const newClass = `inline-field-pips ${isBuy ? 'positive' : 'negative'}`;
            if (tpEl.textContent !== newText)  tpEl.textContent = newText;
            if (tpEl.className   !== newClass) tpEl.className   = newClass;
        }
    }

    // ================================================================
    // SUBMIT ACTIONS
    // ================================================================

    private submitModifyPosition(pos: PositionData): void {
        const slInput = document.getElementById('inlineSlInput') as HTMLInputElement;
        const tpInput = document.getElementById('inlineTpInput') as HTMLInputElement;

        document.dispatchEvent(new CustomEvent('modify-position', {
            detail: {
                ticket: pos.ticket,
                sl:     slInput?.value ? parseFloat(slInput.value) : null,
                tp:     tpInput?.value ? parseFloat(tpInput.value) : null,
            }
        }));

        this.collapseInlineEditor();
    }

    private submitClosePosition(pos: PositionData): void {
        document.dispatchEvent(new CustomEvent('close-position', {
            detail: { ticket: pos.ticket }
        }));
        this.collapseInlineEditor();
    }

    private collapseInlineEditor(): void {
        document.getElementById('inlineEditor')?.classList.add('hidden');
        document.querySelectorAll('#positionsTableBody tr').forEach(tr => {
            tr.classList.remove('selected');
        });
        this.inlineEditor.active  = false;
        this.inlineEditor.ticket  = null;
        this.inlineEditor.slFixed = false;
        this.inlineEditor.tpFixed = false;
        this.activeRowTicket      = null;
    }

    // ================================================================
    // DRAG
    // ================================================================

    private setupDrag(): () => void {
        const modal  = document.getElementById('positionsModal') as HTMLElement;
        const header = document.getElementById('positionsModalHeader') as HTMLElement;
        if (!modal || !header) return () => {};

        if (!modal.dataset.dragged) {
            const rect            = modal.getBoundingClientRect();
            modal.style.left      = `${rect.left}px`;
            modal.style.top       = `${rect.top}px`;
            modal.style.transform = 'none';
            modal.style.margin    = '0';
            modal.dataset.dragged = 'true';
        }

        let isDragging = false;
        let startX     = 0;
        let startY     = 0;
        let startLeft  = 0;
        let startTop   = 0;

        const onMouseDown = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('button')) return;
            isDragging          = true;
            startX              = e.clientX;
            startY              = e.clientY;
            startLeft           = modal.offsetLeft;
            startTop            = modal.offsetTop;
            header.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            let newLeft = startLeft + (e.clientX - startX);
            let newTop  = startTop  + (e.clientY - startY);
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth  - modal.offsetWidth));
            newTop  = Math.max(0, Math.min(newTop,  window.innerHeight - modal.offsetHeight));
            modal.style.left = `${newLeft}px`;
            modal.style.top  = `${newTop}px`;
        };

        const onMouseUp = () => {
            isDragging          = false;
            header.style.cursor = 'grab';
        };

        header.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup',   onMouseUp);

        return () => {
            header.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup',   onMouseUp);
        };
    }

    // ================================================================
    // UTILITIES
    // ================================================================

    private updateInputSteps(symbol: string): void {
        const step = String(getPipSize(symbol));
        ['inlineSlInput', 'inlineTpInput'].forEach(id => {
            const el = document.getElementById(id) as HTMLInputElement;
            if (el) el.step = step;
        });
    }

    private setText(id: string, value: string): void {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    private setTextIfChanged(id: string, value: string): void {
        const el = document.getElementById(id);
        if (el && el.textContent !== value) el.textContent = value;
    }

    private formatTime(timestamp?: number): string {
        if (!timestamp) return '—';
        const d = new Date(timestamp * 1000);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        this.dragCleanup?.();
        this.dragCleanup = null;
    }
}
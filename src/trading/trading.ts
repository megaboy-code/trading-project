// ================================================================
// ⚡ TRADING MODULE
// Handles: account display, lot size, risk %, TP/SL,
//          trade execution, positions modal, inline editor
// ================================================================

import { AccountInfo, PositionData, WebSocketMessage } from '../types';
import { formatPrice, getPipSize, getPipValue, getContractSize } from '../core/price-utils';

// ════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════

interface TradingState {
    balance:     number;
    equity:      number;
    freeMargin:  number;
    margin:      number;
    leverage:    number;
    floatingPnl: number;

    bid:         number;
    ask:         number;
    symbol:      string;

    lotSize:     number;
    safeMode:    boolean;
    maxSafeLots: number;

    riskPct:     number;

    tpEnabled:   boolean;
    slEnabled:   boolean;
    tpPips:      number;
    slPips:      number;

    positions:   PositionData[];
}

// ════════════════════════════════════════
// INTERFACES — INLINE EDITOR STATE
// ════════════════════════════════════════

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

// ════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════

const MAX_BROKER_LOTS   = 50;
const TPSL_DEFAULT_PIPS = 20;

// ════════════════════════════════════════
// TRADING MODULE
// ════════════════════════════════════════

export class TradingModule {

    private state: TradingState = {
        balance:     10_000,
        equity:      10_000,
        freeMargin:  10_000,
        margin:      0,
        leverage:    30,
        floatingPnl: 0,

        bid:         0,
        ask:         0,
        symbol:      'EURUSD',

        lotSize:     0.01,
        safeMode:    true,
        maxSafeLots: 2.72,

        riskPct:     0,

        tpEnabled:   false,
        slEnabled:   false,
        tpPips:      TPSL_DEFAULT_PIPS,
        slPips:      TPSL_DEFAULT_PIPS,

        positions:   [],
    };

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

    private tpSlUpdateInterval: ReturnType<typeof setInterval> | null = null;

    private boundPriceUpdate:    EventListener | null = null;
    private boundSafeModeToggle: EventListener | null = null;
    private boundSlider:         EventListener | null = null;
    private boundTpToggle:       EventListener | null = null;
    private boundSlToggle:       EventListener | null = null;
    private boundTpInput:        EventListener | null = null;
    private boundSlInput:        EventListener | null = null;
    private boundRiskPctInput:   EventListener | null = null;
    private boundBuyBtn:         EventListener | null = null;
    private boundSellBtn:        EventListener | null = null;
    private boundCloseAll:       EventListener | null = null;
    private boundHedge:          EventListener | null = null;
    private boundReverse:        EventListener | null = null;
    private boundOpenPositions:  EventListener | null = null;
    private boundHotkeyAction:   EventListener | null = null;
    private boundHotkeyTrade:    EventListener | null = null;
    private boundLotPresets:     Map<HTMLElement, EventListener> = new Map();
    private boundTpSlPresets:    Map<HTMLElement, EventListener> = new Map();
    private boundRiskPctBtns:    Map<HTMLElement, EventListener> = new Map();

    private dragCleanup:     (() => void) | null = null;
    private activeRowTicket: string | null       = null;

    constructor() {
        this.initialize();
    }

    // ════════════════════════════════════════
    // INITIALIZATION
    // ════════════════════════════════════════

    private initialize(): void {
        console.log('⚡ Trading Module initializing...');
        try {
            this.setupPriceListener();
            this.setupSafeMode();
            this.setupLotControls();
            this.setupRiskPct();
            this.setupTpSlControls();
            this.setupTradeButtons();
            this.setupQuickActions();
            this.setupPositionsButton();
            this.setupHotkeyListeners();
            this.startTpSlBackgroundUpdate();
            this.renderAll();
            console.log('✅ Trading Module initialized');
        } catch (error) {
            console.error('❌ Trading Module failed:', error);
        }
    }

    // ════════════════════════════════════════
    // PRICE LISTENER
    // ════════════════════════════════════════

    private setupPriceListener(): void {
        this.boundPriceUpdate = (e: Event) => {
            const { bid, ask, symbol } = (e as CustomEvent).detail;

            // ✅ Update input steps when symbol changes
            if (symbol && symbol !== this.state.symbol) {
                this.updateInputSteps(symbol);
            }

            this.state.bid    = bid    ?? this.state.bid;
            this.state.ask    = ask    ?? this.state.ask;
            this.state.symbol = symbol ?? this.state.symbol;

            this.renderBuySellPrices();
            this.renderLotStats();

            // ✅ Recalculate maxSafeLots on every tick
            if (this.state.ask > 0) {
                this.state.maxSafeLots = this.calcMaxSafeLots();
                this.applySafeMode();
            }

            // ✅ Update TP/SL panel inputs from pip distances
            if (this.state.tpEnabled || this.state.slEnabled) {
                this.renderTpSlInputsFromPips();
            }

            // ✅ Update inline editor on tick
            if (this.inlineEditor.active) {
                this.updateInlineOnTick();
            }

            // ✅ Recalculate risk% lot size on tick
            if (this.state.riskPct > 0 && this.state.slEnabled) {
                this.applyRiskPct(this.state.riskPct);
            }

            this.renderTpSlPips();
        };

        document.addEventListener('price-update', this.boundPriceUpdate);
    }

    // ════════════════════════════════════════
    // UPDATE INPUT STEPS PER SYMBOL
    // ════════════════════════════════════════

    private updateInputSteps(symbol: string): void {
        const step = String(getPipSize(symbol));
        ['tpInput', 'slInput', 'inlineSlInput', 'inlineTpInput'].forEach(id => {
            const el = document.getElementById(id) as HTMLInputElement;
            if (el) el.step = step;
        });
    }

    // ════════════════════════════════════════
    // TP/SL PANEL INPUT DISPLAY
    // ════════════════════════════════════════

    private renderTpSlInputsFromPips(): void {
        const price   = this.state.ask;
        const symbol  = this.state.symbol;
        const pipSize = getPipSize(symbol);

        if (this.state.tpEnabled) {
            const tpInput = document.getElementById('tpInput') as HTMLInputElement;
            if (tpInput && document.activeElement !== tpInput) {
                tpInput.value = formatPrice(symbol, price + this.state.tpPips * pipSize);
            }
        }

        if (this.state.slEnabled) {
            const slInput = document.getElementById('slInput') as HTMLInputElement;
            if (slInput && document.activeElement !== slInput) {
                slInput.value = formatPrice(symbol, price - this.state.slPips * pipSize);
            }
        }
    }

    // ════════════════════════════════════════
    // INLINE EDITOR TICK UPDATE
    // ════════════════════════════════════════

    private updateInlineOnTick(): void {
        const price   = this.state.ask;
        const symbol  = this.inlineEditor.symbol;
        const pipSize = getPipSize(symbol);
        const isBuy   = this.inlineEditor.isBuy;

        const slInput = document.getElementById('inlineSlInput') as HTMLInputElement;
        const tpInput = document.getElementById('inlineTpInput') as HTMLInputElement;

        // ✅ SL — if not fixed, update price live from pip distance
        if (!this.inlineEditor.slFixed) {
            const slPrice = isBuy
                ? price - this.inlineEditor.slPips * pipSize
                : price + this.inlineEditor.slPips * pipSize;
            this.inlineEditor.slPrice = parseFloat(formatPrice(symbol, slPrice));
            if (slInput && document.activeElement !== slInput) {
                slInput.value = formatPrice(symbol, slPrice);
            }
        }

        // ✅ TP — if not fixed, update price live from pip distance
        if (!this.inlineEditor.tpFixed) {
            const tpPrice = isBuy
                ? price + this.inlineEditor.tpPips * pipSize
                : price - this.inlineEditor.tpPips * pipSize;
            this.inlineEditor.tpPrice = parseFloat(formatPrice(symbol, tpPrice));
            if (tpInput && document.activeElement !== tpInput) {
                tpInput.value = formatPrice(symbol, tpPrice);
            }
        }

        // ✅ Always update pip display
        this.renderInlinePipsFromState();
    }

    // ════════════════════════════════════════
    // HOTKEY LISTENERS
    // ════════════════════════════════════════

    private setupHotkeyListeners(): void {
        this.boundHotkeyAction = (e: Event) => {
            const { action } = (e as CustomEvent).detail;
            switch (action) {
                case 'open-positions-modal': this.openPositionsModal();  break;
                case 'close-all-modals':     this.closePositionsModal(); break;
            }
        };
        document.addEventListener('hotkey-global-action', this.boundHotkeyAction);

        this.boundHotkeyTrade = (e: Event) => {
            const { direction } = (e as CustomEvent).detail;
            if (direction === 'buy')  this.executeTrade('BUY');
            if (direction === 'sell') this.executeTrade('SELL');
        };
        document.addEventListener('hotkey-trade-action', this.boundHotkeyTrade);
    }

    // ════════════════════════════════════════
    // TP/SL BACKGROUND UPDATE
    // ════════════════════════════════════════

    private startTpSlBackgroundUpdate(): void {
        this.tpSlUpdateInterval = setInterval(() => {
            if (!this.state.tpEnabled) this.state.tpPips = TPSL_DEFAULT_PIPS;
            if (!this.state.slEnabled) this.state.slPips = TPSL_DEFAULT_PIPS;
        }, 60_000);
    }

    private stopTpSlBackgroundUpdate(): void {
        if (this.tpSlUpdateInterval) {
            clearInterval(this.tpSlUpdateInterval);
            this.tpSlUpdateInterval = null;
        }
    }

    // ════════════════════════════════════════
    // SAFE MODE
    // ════════════════════════════════════════

    private setupSafeMode(): void {
        const toggle = document.getElementById('safeModeToggle');
        if (!toggle) return;

        this.boundSafeModeToggle = () => {
            this.state.safeMode = !this.state.safeMode;
            this.applySafeMode();
        };

        toggle.addEventListener('click', this.boundSafeModeToggle);
    }

    private applySafeMode(): void {
        const toggle   = document.getElementById('safeModeToggle');
        const icon     = document.getElementById('safeModeIcon');
        const label    = document.getElementById('safeModeLabel');
        const slider   = document.getElementById('lotSlider') as HTMLInputElement;
        const maxBadge = document.getElementById('lotMaxBadge');
        const maxLabel = document.getElementById('sliderMaxLabel');

        if (this.state.safeMode) {
            toggle?.classList.remove('off');
            if (icon)  icon.className    = 'fas fa-lock';
            if (label) label.textContent = 'SAFE';

            const max = this.state.maxSafeLots;
            if (slider)   slider.max          = String(max);
            if (maxBadge) maxBadge.textContent = `Max: ${max}`;
            if (maxLabel) maxLabel.textContent = String(max);

            if (this.state.lotSize > max) {
                this.applyLotSize(max);
            }

            this.hideMarginWarning();

        } else {
            toggle?.classList.add('off');
            if (icon)  icon.className    = 'fas fa-lock-open';
            if (label) label.textContent = 'FREE';

            if (slider)   slider.max          = String(MAX_BROKER_LOTS);
            if (maxBadge) maxBadge.textContent = `Max: ${MAX_BROKER_LOTS}`;
            if (maxLabel) maxLabel.textContent = String(MAX_BROKER_LOTS);
        }

        this.checkMarginWarning();
    }

    // ════════════════════════════════════════
    // LOT SIZE
    // ════════════════════════════════════════

    private setupLotControls(): void {
        const slider = document.getElementById('lotSlider') as HTMLInputElement;

        if (slider) {
            this.boundSlider = () => {
                this.applyLotSize(parseFloat(slider.value));
                this.clearPresetActive();
                this.clearRiskPct();
            };
            slider.addEventListener('input', this.boundSlider);
        }

        document.querySelectorAll<HTMLElement>('.preset-btn').forEach(btn => {
            const handler: EventListener = () => {
                const lot = parseFloat(btn.dataset.lot ?? '0.01');
                this.applyLotSize(lot);
                this.clearPresetActive();
                this.clearRiskPct();
                btn.classList.add('active');
            };
            btn.addEventListener('click', handler);
            this.boundLotPresets.set(btn, handler);
        });
    }

    private applyLotSize(value: number): void {
        this.state.lotSize = parseFloat(value.toFixed(2));

        const display = document.getElementById('lotDisplay');
        const slider  = document.getElementById('lotSlider') as HTMLInputElement;

        if (display) display.textContent = this.state.lotSize.toFixed(2);
        if (slider)  slider.value        = String(this.state.lotSize);

        this.renderLotStats();
        this.checkMarginWarning();
    }

    private clearPresetActive(): void {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    }

    // ════════════════════════════════════════
    // RISK %
    // ════════════════════════════════════════

    private setupRiskPct(): void {
        document.querySelectorAll<HTMLElement>('.risk-pct-btn').forEach(btn => {
            const handler: EventListener = () => {
                document.querySelectorAll('.risk-pct-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const pct   = parseFloat(btn.dataset.pct ?? '0');
                const input = document.getElementById('riskPctInput') as HTMLInputElement;
                if (input) input.value = String(pct);
                this.applyRiskPct(pct);
            };
            btn.addEventListener('click', handler);
            this.boundRiskPctBtns.set(btn, handler);
        });

        const riskPctInput = document.getElementById('riskPctInput') as HTMLInputElement;
        if (riskPctInput) {
            this.boundRiskPctInput = () => {
                document.querySelectorAll('.risk-pct-btn').forEach(b => b.classList.remove('active'));
                const pct = parseFloat(riskPctInput.value);
                if (!isNaN(pct) && pct > 0) this.applyRiskPct(pct);
            };
            riskPctInput.addEventListener('input', this.boundRiskPctInput);
        }
    }

    private applyRiskPct(pct: number): void {
        this.state.riskPct = pct;

        const pipValue = getPipValue(this.state.symbol);
        const badge    = document.getElementById('riskPctBadge');
        const note     = document.getElementById('riskPctNote');

        if (badge) badge.textContent = `${pct}%`;

        if (!this.state.slEnabled) {
            if (note) {
                note.textContent = 'Enable SL to auto-calculate lot size';
                note.classList.remove('active');
            }
            return;
        }

        const slPips = this.state.slPips;
        if (slPips === 0) return;

        const riskAmount = this.state.balance * (pct / 100);
        const lotSize    = riskAmount / (slPips * pipValue);
        const rounded    = Math.max(0.01, parseFloat(lotSize.toFixed(2)));

        const finalLot = this.state.safeMode
            ? Math.min(rounded, this.state.maxSafeLots)
            : Math.min(rounded, MAX_BROKER_LOTS);

        this.applyLotSize(finalLot);

        if (note) {
            note.textContent = `Lot auto-set to ${finalLot.toFixed(2)} for ${pct}% risk`;
            note.classList.add('active');
        }
    }

    private clearRiskPct(): void {
        this.state.riskPct = 0;

        const badge = document.getElementById('riskPctBadge');
        const input = document.getElementById('riskPctInput') as HTMLInputElement;
        const note  = document.getElementById('riskPctNote');

        if (badge) badge.textContent = '0.00%';
        if (input) input.value       = '';
        if (note) {
            note.textContent = 'Enable SL to auto-calculate lot size';
            note.classList.remove('active');
        }

        document.querySelectorAll('.risk-pct-btn').forEach(b => b.classList.remove('active'));
    }

    private renderRiskPctNote(): void {
        if (this.state.riskPct > 0) {
            this.applyRiskPct(this.state.riskPct);
        }
    }

    // ════════════════════════════════════════
    // LOT STATS
    // ════════════════════════════════════════

    private renderLotStats(): void {
        const lot          = this.state.lotSize;
        const contractSize = getContractSize(this.state.symbol);
        const margin       = lot * contractSize * this.state.ask / this.state.leverage;

        const marginStr = `$${margin.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
        this.setTextIfChanged('marginAmount', marginStr);

        if (this.state.slEnabled) {
            const risk = lot * getPipValue(this.state.symbol) * this.state.slPips;
            this.setTextIfChanged('riskAmount', `$${risk.toFixed(2)}`);
        } else {
            this.setTextIfChanged('riskAmount', '--');
        }

        const overMargin = margin > this.state.freeMargin;
        document.getElementById('riskAmount')?.classList.toggle('over',       overMargin);
        document.getElementById('marginAmount')?.classList.toggle('over',     overMargin);
        document.getElementById('lotSlider')?.classList.toggle('over-margin', overMargin && !this.state.safeMode);
    }

    // ════════════════════════════════════════
    // MARGIN WARNING
    // ════════════════════════════════════════

    private checkMarginWarning(): void {
        const contractSize = getContractSize(this.state.symbol);
        const margin       = this.state.lotSize * contractSize * this.state.ask / this.state.leverage;
        const overMargin   = margin > this.state.freeMargin;

        if (!this.state.safeMode && overMargin) {
            const shortfall = (margin - this.state.freeMargin).toFixed(2);
            this.setTextIfChanged('marginWarningText',
                `Margin $${margin.toFixed(2)} — exceeds free margin by $${shortfall}`
            );
            this.showMarginWarning();
        } else {
            this.hideMarginWarning();
        }
    }

    private showMarginWarning(): void {
        document.getElementById('marginWarning')?.classList.remove('hidden');
    }

    private hideMarginWarning(): void {
        document.getElementById('marginWarning')?.classList.add('hidden');
    }

    private calcMaxSafeLots(): number {
        if (this.state.ask <= 0) return 2.72;
        const contractSize = getContractSize(this.state.symbol);
        const max          = this.state.freeMargin / (contractSize * this.state.ask / this.state.leverage);
        return parseFloat(max.toFixed(2));
    }

    // ════════════════════════════════════════
    // TP / SL
    // ════════════════════════════════════════

    private setupTpSlControls(): void {
        const tpToggle = document.getElementById('tpToggle');
        const slToggle = document.getElementById('slToggle');
        const tpInput  = document.getElementById('tpInput') as HTMLInputElement;
        const slInput  = document.getElementById('slInput') as HTMLInputElement;

        if (tpToggle) {
            this.boundTpToggle = () => {
                this.state.tpEnabled = !this.state.tpEnabled;
                tpToggle.classList.toggle('active', this.state.tpEnabled);
                document.getElementById('tpRow')?.classList.toggle('hidden', !this.state.tpEnabled);

                if (this.state.tpEnabled && this.state.ask > 0) {
                    this.state.tpPips = TPSL_DEFAULT_PIPS;
                    const tpInput     = document.getElementById('tpInput') as HTMLInputElement;
                    if (tpInput) tpInput.value = formatPrice(
                        this.state.symbol,
                        this.state.ask + this.state.tpPips * getPipSize(this.state.symbol)
                    );
                }

                this.checkTpSlEmpty();
                this.renderTpSlPips();
                this.renderRR();
            };
            tpToggle.addEventListener('click', this.boundTpToggle);
        }

        if (slToggle) {
            this.boundSlToggle = () => {
                this.state.slEnabled = !this.state.slEnabled;
                slToggle.classList.toggle('active', this.state.slEnabled);
                document.getElementById('slRow')?.classList.toggle('hidden', !this.state.slEnabled);

                if (this.state.slEnabled && this.state.ask > 0) {
                    this.state.slPips = TPSL_DEFAULT_PIPS;
                    const slInput     = document.getElementById('slInput') as HTMLInputElement;
                    if (slInput) slInput.value = formatPrice(
                        this.state.symbol,
                        this.state.ask - this.state.slPips * getPipSize(this.state.symbol)
                    );
                }

                this.checkTpSlEmpty();
                this.renderLotStats();
                this.renderTpSlPips();
                this.renderRR();
                this.renderRiskPctNote();
            };
            slToggle.addEventListener('click', this.boundSlToggle);
        }

        if (tpInput) {
            this.boundTpInput = () => {
                const price = parseFloat(tpInput.value);
                if (!isNaN(price) && this.state.ask > 0) {
                    this.state.tpPips = Math.abs(price - this.state.ask) / getPipSize(this.state.symbol);
                }
                this.renderTpSlPips();
                this.renderRR();
            };
            tpInput.addEventListener('input', this.boundTpInput);
        }

        if (slInput) {
            this.boundSlInput = () => {
                const price = parseFloat(slInput.value);
                if (!isNaN(price) && this.state.ask > 0) {
                    this.state.slPips = Math.abs(price - this.state.ask) / getPipSize(this.state.symbol);
                }
                this.renderTpSlPips();
                this.renderLotStats();
                this.renderRR();
                if (this.state.riskPct > 0 && this.state.slEnabled) {
                    this.applyRiskPct(this.state.riskPct);
                }
            };
            slInput.addEventListener('input', this.boundSlInput);
        }

        document.querySelectorAll<HTMLElement>('.pip-preset-btn').forEach(btn => {
            const handler: EventListener = () => {
                const pips = parseFloat(btn.dataset.pips ?? '0');
                const rr   = parseFloat(btn.dataset.rr   ?? '0');
                if (pips) this.applyPipPreset(pips);
                if (rr)   this.applyRRPreset(rr);
            };
            btn.addEventListener('click', handler);
            this.boundTpSlPresets.set(btn, handler);
        });
    }

    private applyPipPreset(pips: number): void {
        const symbol  = this.state.symbol;
        const pipSize = getPipSize(symbol);

        if (this.state.tpEnabled) {
            this.state.tpPips = pips;
            const tpInput = document.getElementById('tpInput') as HTMLInputElement;
            if (tpInput) tpInput.value = formatPrice(symbol, this.state.ask + pips * pipSize);
        }

        if (this.state.slEnabled) {
            this.state.slPips = pips;
            const slInput = document.getElementById('slInput') as HTMLInputElement;
            if (slInput) slInput.value = formatPrice(symbol, this.state.ask - pips * pipSize);
        }

        this.renderTpSlPips();
        this.renderRR();

        if (this.state.riskPct > 0 && this.state.slEnabled) {
            this.applyRiskPct(this.state.riskPct);
        }
    }

    private applyRRPreset(ratio: number): void {
        const symbol  = this.state.symbol;
        const pipSize = getPipSize(symbol);
        const slPips  = TPSL_DEFAULT_PIPS;
        const tpPips  = slPips * ratio;

        if (this.state.slEnabled) {
            this.state.slPips = slPips;
            const slInput = document.getElementById('slInput') as HTMLInputElement;
            if (slInput) slInput.value = formatPrice(symbol, this.state.ask - slPips * pipSize);
        }

        if (this.state.tpEnabled) {
            this.state.tpPips = tpPips;
            const tpInput = document.getElementById('tpInput') as HTMLInputElement;
            if (tpInput) tpInput.value = formatPrice(symbol, this.state.ask + tpPips * pipSize);
        }

        this.renderTpSlPips();
        this.renderRR();

        if (this.state.riskPct > 0 && this.state.slEnabled) {
            this.applyRiskPct(this.state.riskPct);
        }
    }

    private renderTpSlPips(): void {
        if (this.state.tpEnabled) {
            const el = document.getElementById('tpPips');
            if (el) {
                const newText = `+${this.state.tpPips.toFixed(1)}p`;
                // ✅ Only update if changed
                if (el.textContent !== newText) el.textContent = newText;
                el.className = 'tpsl-pips positive';
            }
        }

        if (this.state.slEnabled) {
            const el = document.getElementById('slPips');
            if (el) {
                const newText = `-${this.state.slPips.toFixed(1)}p`;
                // ✅ Only update if changed
                if (el.textContent !== newText) el.textContent = newText;
                el.className = 'tpsl-pips negative';
            }
        }
    }

    private renderRR(): void {
        const rrDisplay = document.getElementById('rrDisplay');
        if (!this.state.tpEnabled || !this.state.slEnabled) {
            rrDisplay?.classList.add('hidden');
            return;
        }

        rrDisplay?.classList.remove('hidden');

        const slPips = this.state.slPips;
        if (slPips === 0) return;

        const rr = (this.state.tpPips / slPips).toFixed(2);
        this.setTextIfChanged('rrValue', `1 : ${rr}`);
    }

    private checkTpSlEmpty(): void {
        const bothOff = !this.state.tpEnabled && !this.state.slEnabled;
        document.getElementById('tpslEmpty')?.classList.toggle('hidden', !bothOff);
    }

    // ════════════════════════════════════════
    // BUY / SELL
    // ════════════════════════════════════════

    private setupTradeButtons(): void {
        const buyBtn  = document.getElementById('buyButton');
        const sellBtn = document.getElementById('sellButton');

        if (buyBtn) {
            this.boundBuyBtn = () => this.executeTrade('BUY');
            buyBtn.addEventListener('click', this.boundBuyBtn);
        }

        if (sellBtn) {
            this.boundSellBtn = () => this.executeTrade('SELL');
            sellBtn.addEventListener('click', this.boundSellBtn);
        }
    }

    private executeTrade(direction: 'BUY' | 'SELL'): void {
        const price   = direction === 'BUY' ? this.state.ask : this.state.bid;
        const symbol  = this.state.symbol;
        const volume  = this.state.lotSize;
        const pipSize = getPipSize(symbol);

        // ✅ Direction-aware TP/SL at execution time
        let tp: number | null = null;
        let sl: number | null = null;

        if (this.state.tpEnabled) {
            tp = direction === 'BUY'
                ? price + this.state.tpPips * pipSize
                : price - this.state.tpPips * pipSize;
        }

        if (this.state.slEnabled) {
            sl = direction === 'BUY'
                ? price - this.state.slPips * pipSize
                : price + this.state.slPips * pipSize;
        }

        const command = `TRADE_${direction}_${symbol}_${volume}_${price}`;

        document.dispatchEvent(new CustomEvent('execute-trade', {
            detail: { command, tp, sl }
        }));

        console.log(`🚀 Trade dispatched: ${command} TP:${tp} SL:${sl}`);
    }

    // ════════════════════════════════════════
    // QUICK ACTIONS
    // ════════════════════════════════════════

    private setupQuickActions(): void {
        const closeAllBtn = document.getElementById('closeAllBtn');
        const hedgeBtn    = document.getElementById('hedgeBtn');
        const reverseBtn  = document.getElementById('reverseBtn');

        if (closeAllBtn) {
            this.boundCloseAll = () => {
                document.dispatchEvent(new CustomEvent('close-all-positions'));
            };
            closeAllBtn.addEventListener('click', this.boundCloseAll);
        }

        if (hedgeBtn) {
            this.boundHedge = () => this.executeHedge();
            hedgeBtn.addEventListener('click', this.boundHedge);
        }

        if (reverseBtn) {
            this.boundReverse = () => this.executeReverse();
            reverseBtn.addEventListener('click', this.boundReverse);
        }
    }

    private executeHedge(): void {
        const positions = this.state.positions;
        if (positions.length === 0) return;

        const lastPos   = positions[positions.length - 1];
        const direction = lastPos.type === 'BUY' ? 'SELL' : 'BUY';

        document.dispatchEvent(new CustomEvent('execute-trade', {
            detail: {
                command: `TRADE_${direction}_${this.state.symbol}_${this.state.lotSize}_${direction === 'BUY' ? this.state.ask : this.state.bid}`,
                tp: null,
                sl: null,
            }
        }));
    }

    private executeReverse(): void {
        document.dispatchEvent(new CustomEvent('close-all-positions'));

        setTimeout(() => {
            const direction = this.state.positions.length > 0
                ? (this.state.positions[0].type === 'BUY' ? 'SELL' : 'BUY')
                : 'BUY';

            document.dispatchEvent(new CustomEvent('execute-trade', {
                detail: {
                    command: `TRADE_${direction}_${this.state.symbol}_${this.state.lotSize}_${direction === 'BUY' ? this.state.ask : this.state.bid}`,
                    tp: null,
                    sl: null,
                }
            }));
        }, 300);
    }

    // ════════════════════════════════════════
    // POSITIONS BUTTON
    // ════════════════════════════════════════

    private setupPositionsButton(): void {
        const btn = document.getElementById('openPositionsBtn');
        if (!btn) return;

        this.boundOpenPositions = () => this.openPositionsModal();
        btn.addEventListener('click', this.boundOpenPositions);
    }

    // ════════════════════════════════════════
    // POSITIONS MODAL
    // ════════════════════════════════════════

    private openPositionsModal(): void {
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

    private closePositionsModal(): void {
        const modal = document.getElementById('positionsModal');
        modal?.classList.add('hidden');
        this.collapseInlineEditor();
        this.activeRowTicket = null;
    }

    private setupModalControls(): void {
        const closeBtn    = document.getElementById('positionsModalClose');
        const closeAllBtn = document.getElementById('modalCloseAllBtn');

        closeBtn?.addEventListener('click', () => this.closePositionsModal());

        closeAllBtn?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('close-all-positions'));
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.closePositionsModal();
        }, { once: true });
    }

    // ════════════════════════════════════════
    // DRAG
    // ════════════════════════════════════════

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

    // ════════════════════════════════════════
    // POSITIONS TABLE
    // ════════════════════════════════════════

    private renderPositionsTable(): void {
        const tbody = document.getElementById('positionsTableBody');
        const empty = document.getElementById('positionsEmpty');
        const table = document.getElementById('positionsTable');

        if (!tbody) return;

        if (this.state.positions.length === 0) {
            empty?.classList.remove('hidden');
            table?.classList.add('hidden');
            this.collapseInlineEditor();
            return;
        }

        empty?.classList.add('hidden');
        table?.classList.remove('hidden');

        tbody.innerHTML = '';

        this.state.positions.forEach(pos => {
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

    // ════════════════════════════════════════
    // UPDATE ROWS — no flicker on live updates
    // ════════════════════════════════════════

    private updatePositionRows(): void {
        const tbody = document.getElementById('positionsTableBody');
        const empty = document.getElementById('positionsEmpty');
        const table = document.getElementById('positionsTable');

        if (!tbody) return;

        if (this.state.positions.length === 0) {
            empty?.classList.remove('hidden');
            table?.classList.add('hidden');
            this.collapseInlineEditor();
            this.renderSummaryBar();
            return;
        }

        empty?.classList.add('hidden');
        table?.classList.remove('hidden');

        const newTickets = new Set(this.state.positions.map(p => String(p.ticket)));

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

        this.state.positions.forEach(pos => {
            const ticket   = String(pos.ticket);
            const pnl      = pos.profit ?? 0;
            const pnlClass = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            const pnlStr   = `${pnl >= 0 ? '+$' : '-$'}${Math.abs(pnl).toFixed(2)}`;
            const existing = tbody.querySelector(`tr[data-ticket="${ticket}"]`) as HTMLElement;

            if (existing) {
                const cells = existing.querySelectorAll('td');

                // ✅ Only write to DOM if value changed
                const newPrice = String(pos.current_price ?? '—');
                if (cells[4] && cells[4].textContent !== newPrice) {
                    cells[4].textContent = newPrice;
                }

                const newSl = String(pos.sl ?? '—');
                if (cells[5] && cells[5].textContent !== newSl) {
                    cells[5].textContent = newSl;
                }

                const newTp = String(pos.tp ?? '—');
                if (cells[6] && cells[6].textContent !== newTp) {
                    cells[6].textContent = newTp;
                }

                if (cells[7]) {
                    // ✅ Only write to DOM if value changed
                    if (cells[7].textContent !== pnlStr) {
                        cells[7].textContent = pnlStr;
                    }
                    if (cells[7].className !== pnlClass) {
                        cells[7].className = pnlClass;
                    }
                }
            } else {
                this.renderPositionsTable();
            }
        });

        this.renderSummaryBar();
    }

    // ════════════════════════════════════════
    // SUMMARY BAR
    // ════════════════════════════════════════

    private renderSummaryBar(): void {
        const positions = this.state.positions;
        const totalPnl  = positions.reduce((sum, p) => sum + (p.profit ?? 0), 0);
        const totalLots = positions.reduce((sum, p) => sum + (p.volume ?? 0), 0);
        const winning   = positions.filter(p => (p.profit ?? 0) >= 0).length;
        const losing    = positions.filter(p => (p.profit ?? 0) <  0).length;

        const pnlEl = document.getElementById('summaryTotalPnl');
        if (pnlEl) {
            const newPnl = `${totalPnl >= 0 ? '+$' : '-$'}${Math.abs(totalPnl).toFixed(2)}`;
            // ✅ Only update if changed
            if (pnlEl.textContent !== newPnl) pnlEl.textContent = newPnl;
            pnlEl.classList.toggle('positive', totalPnl >= 0);
            pnlEl.classList.toggle('negative', totalPnl <  0);
        }

        this.setTextIfChanged('summaryTotalLots', totalLots.toFixed(2));
        this.setTextIfChanged('summaryWinning',   String(winning));
        this.setTextIfChanged('summaryLosing',    String(losing));
    }

    // ════════════════════════════════════════
    // INLINE EDITOR
    // ════════════════════════════════════════

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

        const price   = this.state.ask;
        const symbol  = pos.symbol;
        const pipSize = getPipSize(symbol);
        const isBuy   = pos.type === 'BUY';

        // ✅ Set input steps for this position's symbol
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
                this.inlineEditor.slPips  = Math.abs(val - this.state.ask) / getPipSize(symbol);
            }
            this.renderInlinePipsFromState();
        });

        document.getElementById('inlineTpInput')?.addEventListener('input', () => {
            const val = parseFloat((document.getElementById('inlineTpInput') as HTMLInputElement).value);
            if (!isNaN(val)) {
                this.inlineEditor.tpFixed = true;
                this.inlineEditor.tpPrice = val;
                this.inlineEditor.tpPips  = Math.abs(val - this.state.ask) / getPipSize(symbol);
            }
            this.renderInlinePipsFromState();
        });
    }

    // ════════════════════════════════════════
    // INLINE PIP PRESETS
    // ════════════════════════════════════════

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
                const price = this.state.ask;
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
                const price  = this.state.ask;
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

    // ════════════════════════════════════════
    // INLINE PIPS RENDER FROM STATE
    // ════════════════════════════════════════

    private renderInlinePipsFromState(): void {
        const price   = this.state.ask;
        const pipSize = getPipSize(this.inlineEditor.symbol);
        const isBuy   = this.inlineEditor.isBuy;

        const slPips = Math.abs(this.inlineEditor.slPrice - price) / pipSize;
        const tpPips = Math.abs(this.inlineEditor.tpPrice - price) / pipSize;

        const slEl = document.getElementById('inlineSlPips');
        const tpEl = document.getElementById('inlineTpPips');

        if (slEl) {
            const newText  = `${isBuy ? '-' : '+'}${slPips.toFixed(1)}p`;
            const newClass = `inline-field-pips ${isBuy ? 'negative' : 'positive'}`;
            // ✅ Only update if changed
            if (slEl.textContent !== newText) slEl.textContent = newText;
            if (slEl.className   !== newClass) slEl.className  = newClass;
        }

        if (tpEl) {
            const newText  = `${isBuy ? '+' : '-'}${tpPips.toFixed(1)}p`;
            const newClass = `inline-field-pips ${isBuy ? 'positive' : 'negative'}`;
            // ✅ Only update if changed
            if (tpEl.textContent !== newText) tpEl.textContent = newText;
            if (tpEl.className   !== newClass) tpEl.className  = newClass;
        }
    }

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

    // ════════════════════════════════════════
    // RENDER ALL
    // ════════════════════════════════════════

    private renderAll(): void {
        this.renderHero();
        this.renderMetrics();
        this.renderBuySellPrices();
        this.renderLotStats();
        this.renderTpSlPips();
        this.renderRR();
        this.updatePositionsCount();
    }

    // ════════════════════════════════════════
    // RENDER HERO
    // ════════════════════════════════════════

    private renderHero(): void {
        const pnl      = this.state.floatingPnl;
        const positive = pnl >= 0;

        const pct = this.state.balance > 0
            ? (Math.abs(pnl / this.state.balance) * 100).toFixed(2)
            : '0.00';

        const pnlEl = document.getElementById('heroPnl');
        const pctEl = document.getElementById('heroPct');

        if (pnlEl) {
            const newPnl = `${positive ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;
            // ✅ Only update if changed
            if (pnlEl.textContent !== newPnl) pnlEl.textContent = newPnl;
            pnlEl.classList.toggle('positive', positive);
            pnlEl.classList.toggle('negative', !positive);
        }

        if (pctEl) {
            const newPct = `${positive ? '+' : '-'}${pct}%`;
            // ✅ Only update if changed
            if (pctEl.textContent !== newPct) pctEl.textContent = newPct;
            pctEl.classList.toggle('positive', positive);
            pctEl.classList.toggle('negative', !positive);
        }
    }

    // ════════════════════════════════════════
    // RENDER METRICS
    // ════════════════════════════════════════

    private renderMetrics(): void {
        this.setTextIfChanged('accountBalance',    this.formatCurrency(this.state.balance));
        this.setTextIfChanged('accountEquity',     this.formatCurrency(this.state.equity));
        this.setTextIfChanged('accountMargin',     this.formatCurrency(this.state.margin));
        this.setTextIfChanged('accountFreeMargin', this.formatCurrency(this.state.freeMargin));
    }

    // ════════════════════════════════════════
    // RENDER BUY / SELL PRICES
    // ════════════════════════════════════════

    private renderBuySellPrices(): void {
        this.setTextIfChanged('buyBtnPrice',  formatPrice(this.state.symbol, this.state.ask));
        this.setTextIfChanged('sellBtnPrice', formatPrice(this.state.symbol, this.state.bid));
    }

    // ════════════════════════════════════════
    // POSITIONS COUNT
    // ════════════════════════════════════════

    private updatePositionsCount(): void {
        const count = this.state.positions.length;
        this.setTextIfChanged('positionsCount',     String(count));
        this.setTextIfChanged('modalPositionCount', String(count));
    }

    // ════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════

    public updateAccountInfo(account: AccountInfo): void {
        this.state.balance     = account.balance     ?? this.state.balance;
        this.state.equity      = account.equity      ?? this.state.equity;
        this.state.freeMargin  = account.free_margin ?? this.state.freeMargin;
        this.state.margin      = account.margin      ?? this.state.margin;
        this.state.leverage    = account.leverage    ?? this.state.leverage;
        this.state.floatingPnl = (account.equity ?? this.state.equity) - (account.balance ?? this.state.balance);

        this.state.maxSafeLots = this.calcMaxSafeLots();
        this.applySafeMode();

        this.renderHero();
        this.renderMetrics();
        this.renderLotStats();

        if (this.state.riskPct > 0 && this.state.slEnabled) {
            this.applyRiskPct(this.state.riskPct);
        }
    }

    public updatePositions(positions: PositionData[]): void {
        this.state.positions = positions;

        // ✅ Update floating P&L and equity from live position data
        this.state.floatingPnl = positions.reduce((sum, p) => sum + (p.profit ?? 0), 0);
        this.state.equity      = this.state.balance + this.state.floatingPnl;

        this.updatePositionsCount();

        // ✅ Batch all visual updates in next animation frame
        requestAnimationFrame(() => {
            this.renderHero();
            this.renderMetrics();

            const modal = document.getElementById('positionsModal');
            if (modal && !modal.classList.contains('hidden')) {
                this.updatePositionRows();
            }
        });
    }

    public handleTradeConfirmation(data: WebSocketMessage): void {
        console.log('✅ Trade confirmed:', data);
    }

    // ════════════════════════════════════════
    // UTILITIES
    // ════════════════════════════════════════

    private setText(id: string, value: string): void {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ✅ Only touches DOM if value actually changed
    private setTextIfChanged(id: string, value: string): void {
        const el = document.getElementById(id);
        if (el && el.textContent !== value) el.textContent = value;
    }

    private formatCurrency(value: number): string {
        return `$${value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    private formatTime(timestamp?: number): string {
        if (!timestamp) return '—';
        const d = new Date(timestamp * 1000);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    // ════════════════════════════════════════
    // CLEANUP
    // ════════════════════════════════════════

    public destroy(): void {
        console.log('🗑️ Cleaning up Trading Module');

        this.stopTpSlBackgroundUpdate();

        this.dragCleanup?.();
        this.dragCleanup = null;

        if (this.boundPriceUpdate)   document.removeEventListener('price-update',        this.boundPriceUpdate);
        if (this.boundHotkeyAction)  document.removeEventListener('hotkey-global-action', this.boundHotkeyAction);
        if (this.boundHotkeyTrade)   document.removeEventListener('hotkey-trade-action',  this.boundHotkeyTrade);

        if (this.boundSafeModeToggle) document.getElementById('safeModeToggle')?.removeEventListener('click',    this.boundSafeModeToggle);
        if (this.boundSlider)         document.getElementById('lotSlider')?.removeEventListener('input',         this.boundSlider);
        if (this.boundTpToggle)       document.getElementById('tpToggle')?.removeEventListener('click',          this.boundTpToggle);
        if (this.boundSlToggle)       document.getElementById('slToggle')?.removeEventListener('click',          this.boundSlToggle);
        if (this.boundTpInput)        document.getElementById('tpInput')?.removeEventListener('input',           this.boundTpInput);
        if (this.boundSlInput)        document.getElementById('slInput')?.removeEventListener('input',           this.boundSlInput);
        if (this.boundRiskPctInput)   document.getElementById('riskPctInput')?.removeEventListener('input',      this.boundRiskPctInput);
        if (this.boundBuyBtn)         document.getElementById('buyButton')?.removeEventListener('click',         this.boundBuyBtn);
        if (this.boundSellBtn)        document.getElementById('sellButton')?.removeEventListener('click',        this.boundSellBtn);
        if (this.boundCloseAll)       document.getElementById('closeAllBtn')?.removeEventListener('click',       this.boundCloseAll);
        if (this.boundHedge)          document.getElementById('hedgeBtn')?.removeEventListener('click',          this.boundHedge);
        if (this.boundReverse)        document.getElementById('reverseBtn')?.removeEventListener('click',        this.boundReverse);
        if (this.boundOpenPositions)  document.getElementById('openPositionsBtn')?.removeEventListener('click',  this.boundOpenPositions);

        this.boundLotPresets.forEach((handler, el)  => el.removeEventListener('click', handler));
        this.boundTpSlPresets.forEach((handler, el) => el.removeEventListener('click', handler));
        this.boundRiskPctBtns.forEach((handler, el) => el.removeEventListener('click', handler));

        this.boundLotPresets.clear();
        this.boundTpSlPresets.clear();
        this.boundRiskPctBtns.clear();
    }
}
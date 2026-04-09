// ================================================================
// ⚡ TRADING PANEL - Lot size, Safe mode, Risk%, TP/SL, Buttons
// ================================================================

import { formatPrice, getPipSize, getPipValue, getContractSize } from '../core/price-utils';
import { TradingSettings } from './trading-settings';

const MAX_BROKER_LOTS   = 50;
const TPSL_DEFAULT_PIPS = 20;
const THROTTLE_MS       = 500;

export interface PanelState {
    balance:     number;
    equity:      number;
    freeMargin:  number;
    margin:      number;
    leverage:    number;

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
}

export class TradingPanel {

    public state: PanelState = {
        balance:     10_000,
        equity:      10_000,
        freeMargin:  10_000,
        margin:      0,
        leverage:    30,

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
    };

    private settings: TradingSettings = new TradingSettings();

    // ── Throttle timers ──
    private lastRiskPctApply: number = 0;

    // ── Bound listeners ──
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
    private boundLotPresets:     Map<HTMLElement, EventListener> = new Map();
    private boundTpSlPresets:    Map<HTMLElement, EventListener> = new Map();
    private boundRiskPctBtns:    Map<HTMLElement, EventListener> = new Map();

    private tpSlUpdateInterval: ReturnType<typeof setInterval> | null = null;

    // ================================================================
    // INITIALIZE
    // ================================================================

    public initialize(): void {
        this.settings.initialize();
        this.setupSafeMode();
        this.setupLotControls();
        this.setupRiskPct();
        this.setupTpSlControls();
        this.setupTradeButtons();
        this.setupQuickActions();
        this.startTpSlBackgroundUpdate();
        this.updateVisibility();
        this.renderAll();
    }

    // ================================================================
    // ON TICK — called by TradingModule
    // ================================================================

    public onTick(symbol: string, bid: number, ask: number): void {
        if (symbol && symbol !== this.state.symbol) {
            this.updateInputSteps(symbol);
        }

        this.state.bid    = bid;
        this.state.ask    = ask;
        this.state.symbol = symbol;

        this.renderBuySellPrices();
        this.renderLotStats();

        if (this.state.tpEnabled || this.state.slEnabled) {
            this.renderTpSlInputsFromPips();
        }

        if (this.state.riskPct > 0 && this.state.slEnabled) {
            const now = Date.now();
            if (now - this.lastRiskPctApply >= THROTTLE_MS) {
                this.applyRiskPct(this.state.riskPct);
                this.lastRiskPctApply = now;
            }
        }

        this.renderTpSlPips();
    }

    // ================================================================
    // ACCOUNT UPDATE — called by TradingModule
    // ================================================================

    public onAccountUpdate(
        balance:    number,
        equity:     number,
        freeMargin: number,
        margin:     number,
        leverage:   number
    ): void {
        this.state.balance    = balance;
        this.state.equity     = equity;
        this.state.freeMargin = freeMargin;
        this.state.margin     = margin;
        this.state.leverage   = leverage;

        this.state.maxSafeLots = this.calcMaxSafeLots();
        this.applySafeMode();

        this.renderLotStats();

        if (this.state.riskPct > 0 && this.state.slEnabled) {
            this.applyRiskPct(this.state.riskPct);
        }
    }

    // ================================================================
    // SAFE MODE
    // ================================================================

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

    // ================================================================
    // LOT SIZE
    // ================================================================

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

    private calcMaxSafeLots(): number {
        if (this.state.ask <= 0 || this.state.leverage <= 0) return 2.72;
        const contractSize = getContractSize(this.state.symbol);
        if (contractSize <= 0) return 2.72;
        const max = this.state.freeMargin / (contractSize * this.state.ask / this.state.leverage);
        if (!isFinite(max) || max <= 0) return 2.72;
        return parseFloat(Math.min(max, MAX_BROKER_LOTS).toFixed(2));
    }

    // ================================================================
    // RISK %
    // ================================================================

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

    // ================================================================
    // LOT STATS
    // ================================================================

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

    // ================================================================
    // MARGIN WARNING
    // ================================================================

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

    // ================================================================
    // TP / SL
    // ================================================================

    private setupTpSlControls(): void {
        const tpToggle = document.getElementById('tpToggle');
        const slToggle = document.getElementById('slToggle');
        const tpInput  = document.getElementById('tpInput') as HTMLInputElement;
        const slInput  = document.getElementById('slInput') as HTMLInputElement;

        if (tpToggle) {
            this.boundTpToggle = () => {
                this.state.tpEnabled = !this.state.tpEnabled;
                tpToggle.classList.toggle('active', this.state.tpEnabled);

                if (this.state.tpEnabled && this.state.ask > 0) {
                    this.state.tpPips = TPSL_DEFAULT_PIPS;
                    const tpInput     = document.getElementById('tpInput') as HTMLInputElement;
                    if (tpInput) tpInput.value = formatPrice(
                        this.state.symbol,
                        this.state.ask + this.state.tpPips * getPipSize(this.state.symbol)
                    );
                }

                this.updateToggleSub();
                this.updateVisibility();
                this.renderTpSlPips();
                this.renderRR();
            };
            tpToggle.addEventListener('click', this.boundTpToggle);
        }

        if (slToggle) {
            this.boundSlToggle = () => {
                this.state.slEnabled = !this.state.slEnabled;
                slToggle.classList.toggle('active', this.state.slEnabled);

                if (this.state.slEnabled && this.state.ask > 0) {
                    this.state.slPips = TPSL_DEFAULT_PIPS;
                    const slInput     = document.getElementById('slInput') as HTMLInputElement;
                    if (slInput) slInput.value = formatPrice(
                        this.state.symbol,
                        this.state.ask - this.state.slPips * getPipSize(this.state.symbol)
                    );
                }

                this.updateToggleSub();
                this.updateVisibility();
                this.renderLotStats();
                this.renderTpSlPips();
                this.renderRR();

                if (this.state.riskPct > 0 && this.state.slEnabled) {
                    this.applyRiskPct(this.state.riskPct);
                }
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

    private renderTpSlPips(): void {
        if (this.state.tpEnabled) {
            const el = document.getElementById('tpPips');
            if (el) {
                const newText = `+${this.state.tpPips.toFixed(1)}p`;
                if (el.textContent !== newText) el.textContent = newText;
                el.className = 'tpsl-pips positive';
            }
        }

        if (this.state.slEnabled) {
            const el = document.getElementById('slPips');
            if (el) {
                const newText = `-${this.state.slPips.toFixed(1)}p`;
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

    // ================================================================
    // VISIBILITY
    // ================================================================

    private updateVisibility(): void {
        const either = this.state.tpEnabled || this.state.slEnabled;
        const both   = !this.state.tpEnabled && !this.state.slEnabled;

        document.getElementById('tpslEmpty')?.classList.toggle('hidden', !both);
        document.getElementById('tpRow')?.classList.toggle('hidden', !this.state.tpEnabled);
        document.getElementById('slRow')?.classList.toggle('hidden', !this.state.slEnabled);
        document.getElementById('pipPresets')?.classList.toggle('hidden', !either);
        document.getElementById('riskPctBlock')?.classList.toggle('hidden', !this.state.slEnabled);

        if (!this.state.slEnabled) this.clearRiskPct();
    }

    private updateToggleSub(): void {
        const tpSub = document.querySelector('#tpToggle .tpsl-toggle-sub');
        const slSub = document.querySelector('#slToggle .tpsl-toggle-sub');
        if (tpSub) tpSub.textContent = this.state.tpEnabled ? 'Active ✓' : 'Tap to enable';
        if (slSub) slSub.textContent = this.state.slEnabled ? 'Active ✓' : 'Tap to enable';
    }

    // ================================================================
    // TRADE BUTTONS
    // ================================================================

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
    }

    // ================================================================
    // QUICK ACTIONS
    // ================================================================

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
        const positions = this.getPositions();
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
            const positions = this.getPositions();
            const direction = positions.length > 0
                ? (positions[0].type === 'BUY' ? 'SELL' : 'BUY')
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

    private getPositions: () => import('../types').PositionData[] = () => [];

    public setGetPositions(fn: () => import('../types').PositionData[]): void {
        this.getPositions = fn;
    }

    // ================================================================
    // RENDER
    // ================================================================

    public renderAll(): void {
        this.renderBuySellPrices();
        this.renderLotStats();
        this.renderTpSlPips();
        this.renderRR();
    }

    public renderHero(floatingPnl: number, balance: number): void {
        const positive = floatingPnl >= 0;
        const pct      = balance > 0
            ? (Math.abs(floatingPnl / balance) * 100).toFixed(2)
            : '0.00';

        const pnlEl = document.getElementById('heroPnl');
        const pctEl = document.getElementById('heroPct');

        if (pnlEl) {
            const newPnl = `${positive ? '+' : '-'}$${Math.abs(floatingPnl).toFixed(2)}`;
            if (pnlEl.textContent !== newPnl) pnlEl.textContent = newPnl;
            pnlEl.classList.toggle('positive', positive);
            pnlEl.classList.toggle('negative', !positive);
        }

        if (pctEl) {
            const newPct = `${positive ? '+' : '-'}${pct}%`;
            if (pctEl.textContent !== newPct) pctEl.textContent = newPct;
            pctEl.classList.toggle('positive', positive);
            pctEl.classList.toggle('negative', !positive);
        }
    }

    public renderMetrics(): void {
        this.setTextIfChanged('accountBalance',    this.formatCurrency(this.state.balance));
        this.setTextIfChanged('accountEquity',     this.formatCurrency(this.state.equity));
        this.setTextIfChanged('accountMargin',     this.formatCurrency(this.state.margin));
        this.setTextIfChanged('accountFreeMargin', this.formatCurrency(this.state.freeMargin));
    }

    private renderBuySellPrices(): void {
        this.setTextIfChanged('buyBtnPrice',  formatPrice(this.state.symbol, this.state.ask));
        this.setTextIfChanged('sellBtnPrice', formatPrice(this.state.symbol, this.state.bid));
    }

    // ================================================================
    // TP/SL BACKGROUND RESET
    // ================================================================

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

    // ================================================================
    // UTILITIES
    // ================================================================

    private updateInputSteps(symbol: string): void {
        const step = String(getPipSize(symbol));
        ['tpInput', 'slInput'].forEach(id => {
            const el = document.getElementById(id) as HTMLInputElement;
            if (el) el.step = step;
        });
    }

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

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        this.stopTpSlBackgroundUpdate();
        this.settings.destroy();

        if (this.boundSafeModeToggle) document.getElementById('safeModeToggle')?.removeEventListener('click',   this.boundSafeModeToggle);
        if (this.boundSlider)         document.getElementById('lotSlider')?.removeEventListener('input',        this.boundSlider);
        if (this.boundTpToggle)       document.getElementById('tpToggle')?.removeEventListener('click',         this.boundTpToggle);
        if (this.boundSlToggle)       document.getElementById('slToggle')?.removeEventListener('click',         this.boundSlToggle);
        if (this.boundTpInput)        document.getElementById('tpInput')?.removeEventListener('input',          this.boundTpInput);
        if (this.boundSlInput)        document.getElementById('slInput')?.removeEventListener('input',          this.boundSlInput);
        if (this.boundRiskPctInput)   document.getElementById('riskPctInput')?.removeEventListener('input',     this.boundRiskPctInput);
        if (this.boundBuyBtn)         document.getElementById('buyButton')?.removeEventListener('click',        this.boundBuyBtn);
        if (this.boundSellBtn)        document.getElementById('sellButton')?.removeEventListener('click',       this.boundSellBtn);
        if (this.boundCloseAll)       document.getElementById('closeAllBtn')?.removeEventListener('click',      this.boundCloseAll);
        if (this.boundHedge)          document.getElementById('hedgeBtn')?.removeEventListener('click',         this.boundHedge);
        if (this.boundReverse)        document.getElementById('reverseBtn')?.removeEventListener('click',       this.boundReverse);

        this.boundLotPresets.forEach((handler, el)  => el.removeEventListener('click', handler));
        this.boundTpSlPresets.forEach((handler, el) => el.removeEventListener('click', handler));
        this.boundRiskPctBtns.forEach((handler, el) => el.removeEventListener('click', handler));

        this.boundLotPresets.clear();
        this.boundTpSlPresets.clear();
        this.boundRiskPctBtns.clear();
    }
}
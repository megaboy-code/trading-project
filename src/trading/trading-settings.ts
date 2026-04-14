// ================================================================
// ⚙️ TRADING SETTINGS - Preferences logic
// ================================================================

export interface TradingSettingsData {
    dailyLossLimit:       number;
    maxOpenPositions:     number;
    positionWarning:      boolean;
    defaultLotSize:       number;
    defaultTpPips:        number;
    defaultSlPips:        number;
    tpMaxLimit:           number;
    slMaxLimit:           number;
    trailingEnabled:      boolean;
    activationThreshold:  number;
    trailingMethod:       'fixed' | 'atr' | 'percentage' | 'step';
    fixedDistance:        number;
    atrMultiplier:        number;
    atrPeriod:            number;
    trailPercent:         number;
    stepDistance:         number;
    lockAmount:           number;
    closeWarningEnabled:  boolean;
}

const STORAGE_KEY = 'megaflowz_trading_prefs';

const DEFAULTS: TradingSettingsData = {
    dailyLossLimit:       0,
    maxOpenPositions:     0,
    positionWarning:      false,
    defaultLotSize:       0.01,
    defaultTpPips:        0,
    defaultSlPips:        0,
    tpMaxLimit:           200,
    slMaxLimit:           200,
    trailingEnabled:      false,
    activationThreshold:  0,
    trailingMethod:       'fixed',
    fixedDistance:        20,
    atrMultiplier:        2.0,
    atrPeriod:            14,
    trailPercent:         50,
    stepDistance:         20,
    lockAmount:           10,
    closeWarningEnabled:  true,
};

export class TradingSettings {

    public data: TradingSettingsData = { ...DEFAULTS };

    // ── Bound listeners ──
    private boundMenuBtn:      EventListener | null = null;
    private boundOutsideClick: EventListener | null = null;
    private boundSave:         EventListener | null = null;
    private boundCancel:       EventListener | null = null;
    private boundTrailing:     EventListener | null = null;
    private boundMethod:       EventListener | null = null;
    private boundTpLimit:      EventListener | null = null;
    private boundSlLimit:      EventListener | null = null;

    // ================================================================
    // INITIALIZE
    // ================================================================

    public initialize(): void {
        this.loadSettings();
        this.setupMenuButton();
        this.setupDropdownControls();
        this.setupSliders();
        this.setupTrailingControls();
        this.setupLimitInputs();
        this.populateUI();
    }

    // ================================================================
    // OPEN / CLOSE
    // ================================================================

    public open(): void {
        const btn  = document.getElementById('panelMenuBtn');
        const drop = document.getElementById('tradingPrefsDrop');
        if (!drop) return;
        if (btn) {
            const rect = btn.getBoundingClientRect();
            drop.style.top = `${rect.bottom + 6}px`;
        }
        this.populateUI();
        drop.classList.add('show');
    }

    public close(): void {
        document.getElementById('tradingPrefsDrop')?.classList.remove('show');
    }

    // ================================================================
    // SETUP MENU BUTTON
    // ================================================================

    private setupMenuButton(): void {
        const btn  = document.getElementById('panelMenuBtn');
        const drop = document.getElementById('tradingPrefsDrop');
        if (!btn || !drop) return;

        this.boundMenuBtn = (e) => {
            (e as Event).stopPropagation();
            const isOpen = drop.classList.contains('show');
            if (!isOpen) {
                const rect = btn.getBoundingClientRect();
                drop.style.top = `${rect.bottom + 6}px`;
                this.populateUI();
            }
            drop.classList.toggle('show');
        };
        btn.addEventListener('click', this.boundMenuBtn);

        this.boundOutsideClick = () => drop.classList.remove('show');
        document.addEventListener('click', this.boundOutsideClick);
    }

    // ================================================================
    // SETUP DROPDOWN CONTROLS
    // ================================================================

    private setupDropdownControls(): void {
        const saveBtn   = document.getElementById('tradingPrefsSave');
        const cancelBtn = document.getElementById('tradingPrefsCancel');
        const drop      = document.getElementById('tradingPrefsDrop');

        // Stop clicks inside dropdown from closing it
        drop?.addEventListener('click', (e) => e.stopPropagation());

        if (saveBtn) {
            this.boundSave = () => this.saveSettings();
            saveBtn.addEventListener('click', this.boundSave);
        }

        if (cancelBtn) {
            this.boundCancel = () => this.close();
            cancelBtn.addEventListener('click', this.boundCancel);
        }
    }

    // ================================================================
    // SETUP SLIDERS
    // ================================================================

    private setupSliders(): void {
        const sliders: Array<{ id: string; displayId: string; format?: (v: number) => string }> = [
            { id: 'tpDailyLossSlider',    displayId: 'tpDailyLossValue',    format: v => `$${v}` },
            { id: 'tpMaxPositionsSlider', displayId: 'tpMaxPositionsValue' },
            { id: 'tpDefaultLotSlider',   displayId: 'tpDefaultLotValue',   format: v => v.toFixed(2) },
            { id: 'tpDefaultTpSlider',    displayId: 'tpDefaultTpValue' },
            { id: 'tpDefaultSlSlider',    displayId: 'tpDefaultSlValue' },
            { id: 'tpActivationSlider',   displayId: 'tpActivationValue' },
            { id: 'tpFixedDistSlider',    displayId: 'tpFixedDistValue' },
            { id: 'tpAtrMultSlider',      displayId: 'tpAtrMultValue',      format: v => v.toFixed(1) },
            { id: 'tpAtrPeriodSlider',    displayId: 'tpAtrPeriodValue' },
            { id: 'tpTrailPctSlider',     displayId: 'tpTrailPctValue' },
            { id: 'tpStepDistSlider',     displayId: 'tpStepDistValue' },
            { id: 'tpLockAmtSlider',      displayId: 'tpLockAmtValue' },
        ];

        sliders.forEach(({ id, displayId, format }) => {
            const slider  = document.getElementById(id) as HTMLInputElement;
            const display = document.getElementById(displayId);
            if (!slider || !display) return;
            slider.addEventListener('input', () => {
                const val = parseFloat(slider.value);
                display.textContent = format ? format(val) : String(val);
            });
        });
    }

    // ================================================================
    // SETUP TRAILING CONTROLS
    // ================================================================

    private setupTrailingControls(): void {
        const toggle   = document.getElementById('tpTrailingEnabled') as HTMLInputElement;
        const settings = document.getElementById('tpTrailingSettings');
        const method   = document.getElementById('tpTrailingMethod') as HTMLSelectElement;

        if (toggle && settings) {
            this.boundTrailing = () => {
                settings.classList.toggle('hidden', !toggle.checked);
            };
            toggle.addEventListener('change', this.boundTrailing);
        }

        if (method) {
            this.boundMethod = () => this.updateMethodVisibility(method.value);
            method.addEventListener('change', this.boundMethod);
        }
    }

    private updateMethodVisibility(method: string): void {
        ['Fixed', 'Atr', 'Percentage', 'Step'].forEach(m => {
            document.getElementById(`tpMethod${m}`)?.classList.add('hidden');
        });
        const map: Record<string, string> = {
            fixed:      'tpMethodFixed',
            atr:        'tpMethodAtr',
            percentage: 'tpMethodPercentage',
            step:       'tpMethodStep',
        };
        if (map[method]) document.getElementById(map[method])?.classList.remove('hidden');
    }

    // ================================================================
    // SETUP LIMIT INPUTS
    // ================================================================

    private setupLimitInputs(): void {
        const tpLimit   = document.getElementById('tpTpMaxLimit')       as HTMLInputElement;
        const slLimit   = document.getElementById('tpSlMaxLimit')       as HTMLInputElement;
        const tpSlider  = document.getElementById('tpDefaultTpSlider')  as HTMLInputElement;
        const slSlider  = document.getElementById('tpDefaultSlSlider')  as HTMLInputElement;
        const tpDisplay = document.getElementById('tpDefaultTpValue');
        const slDisplay = document.getElementById('tpDefaultSlValue');

        if (tpLimit && tpSlider) {
            this.boundTpLimit = () => {
                const max = Math.max(0, parseInt(tpLimit.value) || 0);
                tpSlider.max = String(max);
                if (parseFloat(tpSlider.value) > max) {
                    tpSlider.value = String(max);
                    if (tpDisplay) tpDisplay.textContent = String(max);
                }
            };
            tpLimit.addEventListener('change', this.boundTpLimit);
        }

        if (slLimit && slSlider) {
            this.boundSlLimit = () => {
                const max = Math.max(0, parseInt(slLimit.value) || 0);
                slSlider.max = String(max);
                if (parseFloat(slSlider.value) > max) {
                    slSlider.value = String(max);
                    if (slDisplay) slDisplay.textContent = String(max);
                }
            };
            slLimit.addEventListener('change', this.boundSlLimit);
        }
    }

    // ================================================================
    // POPULATE UI FROM DATA
    // ================================================================

    private populateUI(): void {
        const d = this.data;

        this.setSlider('tpDailyLossSlider',    d.dailyLossLimit,      'tpDailyLossValue',    v => `$${v}`);
        this.setSlider('tpMaxPositionsSlider', d.maxOpenPositions,    'tpMaxPositionsValue');
        this.setSlider('tpDefaultLotSlider',   d.defaultLotSize,      'tpDefaultLotValue',   v => v.toFixed(2));
        this.setSlider('tpDefaultTpSlider',    d.defaultTpPips,       'tpDefaultTpValue');
        this.setSlider('tpDefaultSlSlider',    d.defaultSlPips,       'tpDefaultSlValue');
        this.setSlider('tpActivationSlider',   d.activationThreshold, 'tpActivationValue');
        this.setSlider('tpFixedDistSlider',    d.fixedDistance,       'tpFixedDistValue');
        this.setSlider('tpAtrMultSlider',      d.atrMultiplier,       'tpAtrMultValue',      v => v.toFixed(1));
        this.setSlider('tpAtrPeriodSlider',    d.atrPeriod,           'tpAtrPeriodValue');
        this.setSlider('tpTrailPctSlider',     d.trailPercent,        'tpTrailPctValue');
        this.setSlider('tpStepDistSlider',     d.stepDistance,        'tpStepDistValue');
        this.setSlider('tpLockAmtSlider',      d.lockAmount,          'tpLockAmtValue');

        this.setInput('tpTpMaxLimit', String(d.tpMaxLimit));
        this.setInput('tpSlMaxLimit', String(d.slMaxLimit));

        this.setCheckbox('tpPositionWarning',  d.positionWarning);
        this.setCheckbox('tpTrailingEnabled',  d.trailingEnabled);
        this.setCheckbox('tpCloseWarning',     d.closeWarningEnabled);

        const method = document.getElementById('tpTrailingMethod') as HTMLSelectElement;
        if (method) method.value = d.trailingMethod;

        document.getElementById('tpTrailingSettings')?.classList.toggle('hidden', !d.trailingEnabled);
        this.updateMethodVisibility(d.trailingMethod);
    }

    // ================================================================
    // SAVE SETTINGS
    // ================================================================

    private saveSettings(): void {
        const g  = (id: string) => document.getElementById(id) as HTMLInputElement;
        const gs = (id: string) => document.getElementById(id) as HTMLSelectElement;

        this.data = {
            dailyLossLimit:       parseInt(g('tpDailyLossSlider').value)    || 0,
            maxOpenPositions:     parseInt(g('tpMaxPositionsSlider').value)  || 0,
            positionWarning:      g('tpPositionWarning').checked,
            defaultLotSize:       parseFloat(g('tpDefaultLotSlider').value) || 0.01,
            defaultTpPips:        parseInt(g('tpDefaultTpSlider').value)     || 0,
            defaultSlPips:        parseInt(g('tpDefaultSlSlider').value)     || 0,
            tpMaxLimit:           parseInt(g('tpTpMaxLimit').value)          || 200,
            slMaxLimit:           parseInt(g('tpSlMaxLimit').value)          || 200,
            trailingEnabled:      g('tpTrailingEnabled').checked,
            activationThreshold:  parseInt(g('tpActivationSlider').value)   || 0,
            trailingMethod:       gs('tpTrailingMethod').value as TradingSettingsData['trailingMethod'],
            fixedDistance:        parseInt(g('tpFixedDistSlider').value)     || 20,
            atrMultiplier:        parseFloat(g('tpAtrMultSlider').value)    || 2.0,
            atrPeriod:            parseInt(g('tpAtrPeriodSlider').value)     || 14,
            trailPercent:         parseInt(g('tpTrailPctSlider').value)      || 50,
            stepDistance:         parseInt(g('tpStepDistSlider').value)      || 20,
            lockAmount:           parseInt(g('tpLockAmtSlider').value)       || 10,
            closeWarningEnabled:  g('tpCloseWarning').checked,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));

        document.dispatchEvent(new CustomEvent('trading-settings-saved', {
            detail: { settings: this.data }
        }));

        this.close();
    }

    // ================================================================
    // LOAD SETTINGS
    // ================================================================

    private loadSettings(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
        } catch {
            this.data = { ...DEFAULTS };
        }
    }

    // ================================================================
    // UTILITIES
    // ================================================================

    private setSlider(id: string, value: number, displayId: string, format?: (v: number) => string): void {
        const slider  = document.getElementById(id) as HTMLInputElement;
        const display = document.getElementById(displayId);
        if (slider)  slider.value        = String(value);
        if (display) display.textContent = format ? format(value) : String(value);
    }

    private setInput(id: string, value: string): void {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) el.value = value;
    }

    private setCheckbox(id: string, checked: boolean): void {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) el.checked = checked;
    }

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        const btn       = document.getElementById('panelMenuBtn');
        const drop      = document.getElementById('tradingPrefsDrop');
        const saveBtn   = document.getElementById('tradingPrefsSave');
        const cancelBtn = document.getElementById('tradingPrefsCancel');
        const trailing  = document.getElementById('tpTrailingEnabled');
        const method    = document.getElementById('tpTrailingMethod');
        const tpLimit   = document.getElementById('tpTpMaxLimit');
        const slLimit   = document.getElementById('tpSlMaxLimit');

        if (this.boundMenuBtn      && btn)       btn.removeEventListener('click',   this.boundMenuBtn);
        if (this.boundOutsideClick)              document.removeEventListener('click', this.boundOutsideClick);
        if (this.boundSave         && saveBtn)   saveBtn.removeEventListener('click',  this.boundSave);
        if (this.boundCancel       && cancelBtn) cancelBtn.removeEventListener('click', this.boundCancel);
        if (this.boundTrailing     && trailing)  trailing.removeEventListener('change', this.boundTrailing);
        if (this.boundMethod       && method)    method.removeEventListener('change',   this.boundMethod);
        if (this.boundTpLimit      && tpLimit)   tpLimit.removeEventListener('change',  this.boundTpLimit);
        if (this.boundSlLimit      && slLimit)   slLimit.removeEventListener('change',  this.boundSlLimit);

        drop?.removeEventListener('click', (e) => e.stopPropagation());
    }
}

// ================================================================
// 🤖 STRATEGIES MODULE
// ================================================================
//
// FLOW OVERVIEW FOR FUTURE AI:
//
// 1. Click on strategy item → dispatches 'symbol-changed' + 'timeframe-changed'
//    events (same as chart-ui.ts does) to switch the chart.
//
// 2. Chevron button → toggles expand detail (separate from click).
//    Detail shows: pause/resume toggle, volume input, risk % input.
//
// 3. Pause/Resume → dispatches 'update-strategy' CustomEvent with
//    { strategyId, updates: { paused: true/false } }
//    ModuleManager listens and calls connectionManager.updateStrategy()
//
// 4. Volume/Risk change → dispatches 'update-strategy' with
//    { strategyId, updates: { volume, risk } }
//    ModuleManager listens and calls connectionManager.updateStrategy()
//
// 5. Remove → dispatches 'remove-strategy' CustomEvent with
//    { strategyType, symbol, timeframe }
//    ModuleManager is sole owner of cleanup chain:
//    removeStrategyFromChart() + removeStrategyById() + backend call
//
// 6. When strategy is deployed on current chart symbol+TF:
//    Legend shows via indicator-added event from IndicatorManager
//    When chart switches away: legend hides but strategy stays in panel
//    Strategy item in panel always shows current status regardless of chart
//
// 7. onStrategyData callback from ConnectionManager feeds real data here.
//    setStrategies() called from ModuleManager with real backend data.
//    Fields not provided by backend (pnl, trades, winrate) default to null/0.
//
// 8. GET_ACTIVE_STRATEGIES is sent in ws.onopen — no race condition.
//    Panel populates when backend responds via onAvailableConfig.
//
// ================================================================

interface StrategyItem {
    id:        string;
    name:      string;
    symbol:    string;
    tf:        string;
    status:    'running' | 'paused' | 'stopped';
    pnl:       number | null;
    trades:    number;
    winrate:   number | null;
    volume:    number;
    risk:      number;
    iconColor: 'green' | 'blue' | 'warn' | 'purple';
}

type StratFilter = 'all' | 'running' | 'paused' | 'stopped';

export class StrategiesModule {

    private container:     HTMLElement | null = null;
    private listEl:        HTMLElement | null = null;
    private currentFilter: StratFilter = 'all';
    private expandedId:    string | null = null;
    private selectedId:    string | null = null;

    // ── Real data from backend ──
    private strategies: StrategyItem[] = [];

    // ================================================================
    // INITIALIZE
    // ================================================================

    public initialize(): void {
        this.container = document.querySelector('.strategies-panel');
        this.listEl    = document.getElementById('strategyList');

        if (!this.container || !this.listEl) {
            console.warn('⚠️ Strategies: container not found');
            return;
        }

        this.bindEvents();
        this.render();

        console.log('✅ Strategies Module initialized');
    }

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        console.log('🗑️ Strategies Module destroyed');
    }

    // ================================================================
    // PUBLIC — called by ModuleManager when real data arrives
    // ================================================================

    public setStrategies(data: StrategyItem[]): void {
        this.strategies = data;
        this.render();
    }

    public addStrategy(item: StrategyItem): void {
        const exists = this.strategies.findIndex(s => s.id === item.id);
        if (exists >= 0) {
            this.strategies[exists] = item;
        } else {
            this.strategies.push(item);
        }
        this.render();
    }

    public removeStrategyById(id: string): void {
        this.strategies = this.strategies.filter(s => s.id !== id);
        if (this.expandedId === id) this.expandedId = null;
        if (this.selectedId === id) this.selectedId = null;
        this.render();
    }

    public updateStrategyStatus(id: string, status: 'running' | 'paused' | 'stopped'): void {
        const s = this.strategies.find(s => s.id === id);
        if (s) {
            s.status = status;
            this.render();
        }
    }

    public hasStrategy(id: string): boolean {
        return this.strategies.some(s => s.id === id);
    }

    public getCount(): number {
        return this.strategies.length;
    }

    // ================================================================
    // BIND EVENTS
    // ================================================================

    private bindEvents(): void {
        const menuBtn = document.getElementById('strategyMenuBtn');
        const drop    = document.getElementById('strategySettingsDrop');

        menuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            drop?.classList.toggle('show');
        });

        document.addEventListener('click', () => drop?.classList.remove('show'));

        document.querySelectorAll('.strat-settings-option[data-filter]').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const filter = opt.getAttribute('data-filter') as StratFilter;
                if (!filter) return;
                this.currentFilter = filter;
                document.querySelectorAll('.strat-settings-option[data-filter]')
                    .forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                drop?.classList.remove('show');
                this.render();
            });
        });

        document.getElementById('strategyRefreshBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            drop?.classList.remove('show');
            document.dispatchEvent(new CustomEvent('get-active-strategies'));
        });

        // ── Sync robot icon color when legend color changes ──
        document.addEventListener('legend-item-color-update', (e: Event) => {
            const { id, color } = (e as CustomEvent).detail;
            const iconEl = this.listEl?.querySelector(
                `[data-strat-id="${id}"] .strat-icon i`
            ) as HTMLElement;
            if (iconEl) iconEl.style.color = color;
        });
    }

    // ================================================================
    // RENDER
    // ================================================================

    private render(): void {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';

        const filtered = this.getFiltered();

        if (!filtered.length) {
            this.listEl.innerHTML = `
                <div class="strat-empty">
                    <i class="fas fa-robot"></i>
                    <p>No strategies match your filter.</p>
                </div>`;
            this.updateSummary([]);
            return;
        }

        filtered.forEach(s => {
            this.listEl!.appendChild(this.buildItem(s));
        });

        if (this.expandedId) {
            const detail = document.getElementById(`strat-detail-${this.expandedId}`);
            const item   = this.listEl.querySelector(`[data-strat-id="${this.expandedId}"]`);
            if (detail && item) {
                detail.classList.add('show');
                item.closest('.strat-item')?.classList.add('expanded');
            }
        }

        if (this.selectedId) {
            const item = this.listEl.querySelector(`[data-strat-id="${this.selectedId}"]`);
            item?.closest('.strat-item')?.classList.add('selected');
        }

        this.updateSummary(filtered);
        this.updateFooter();
    }

    // ================================================================
    // BUILD ITEM
    // ================================================================

    private buildItem(s: StrategyItem): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'strat-item';

        const main = document.createElement('div');
        main.className = 'strat-item-main';
        main.setAttribute('data-strat-id', s.id);

        const pnlClass   = s.pnl && s.pnl > 0 ? 'positive' : s.pnl && s.pnl < 0 ? 'negative' : 'neutral';
        const pnlText    = s.pnl !== null ? (s.pnl > 0 ? `+$${s.pnl.toFixed(2)}` : s.pnl < 0 ? `-$${Math.abs(s.pnl).toFixed(2)}` : '$0.00') : '—';
        const pulseClass = s.status === 'running' ? '' : s.status === 'paused' ? 'paused' : 'stopped';

        main.innerHTML = `
            <div class="strat-icon ${s.iconColor}"><i class="fas fa-robot"></i></div>
            <div class="strat-item-info">
                <div class="strat-item-row1">
                    <span class="strat-item-name">${s.name}</span>
                    <div class="strat-item-status-group">
                        <div class="strat-pulse ${pulseClass}"></div>
                        <span class="strat-status ${s.status}">${s.status}</span>
                    </div>
                </div>
                <div class="strat-item-row2">
                    <div class="strat-item-meta">
                        <span class="strat-item-symbol">${s.symbol}</span>
                        <span class="strat-item-tf">${s.tf}</span>
                    </div>
                    <span class="strat-item-pnl ${pnlClass}">${pnlText}</span>
                </div>
            </div>
            <button class="strat-chevron" data-strat-id="${s.id}">
                <i class="fas fa-chevron-down"></i>
            </button>
        `;

        const stats = document.createElement('div');
        stats.className = 'strat-item-stats';

        const tradesDisplay  = s.trades > 0 ? s.trades : '0';
        const winrateDisplay = s.winrate !== null && s.winrate > 0 ? `${s.winrate}%` : '—';

        stats.innerHTML = `
            <div class="strat-stat">
                <i class="fas fa-chart-bar"></i>
                <span>Trades:</span>
                <span class="strat-stat-val">${tradesDisplay}</span>
            </div>
            <div class="strat-stat">
                <i class="fas fa-percent"></i>
                <span>Win:</span>
                <span class="strat-stat-val">${winrateDisplay}</span>
            </div>
        `;

        const detail = this.buildDetail(s);

        main.addEventListener('click', (e) => {
            const chevron = (e.target as HTMLElement).closest('.strat-chevron');
            if (chevron) return;
            this.switchChart(s);
        });

        const chevronBtn = main.querySelector('.strat-chevron') as HTMLElement;
        chevronBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleExpand(s.id, wrapper, detail);
        });

        wrapper.appendChild(main);
        wrapper.appendChild(stats);
        wrapper.appendChild(detail);
        return wrapper;
    }

    // ================================================================
    // BUILD DETAIL
    // ================================================================

    private buildDetail(s: StrategyItem): HTMLElement {
        const detail = document.createElement('div');
        detail.className = 'strat-item-detail';
        detail.id = `strat-detail-${s.id}`;

        const isPaused  = s.status === 'paused';
        const isStopped = s.status === 'stopped';

        const toggleRow = document.createElement('div');
        toggleRow.className = 'strat-toggle-row';

        if (!isStopped) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = isPaused ? 'strat-btn-resume' : 'strat-btn-pause';
            toggleBtn.innerHTML = isPaused
                ? `<i class="fas fa-play"></i> Resume`
                : `<i class="fas fa-pause"></i> Pause`;

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newStatus = isPaused ? 'running' : 'paused';
                document.dispatchEvent(new CustomEvent('update-strategy', {
                    detail: { strategyId: s.id, updates: { paused: newStatus === 'paused' } }
                }));
                this.updateStrategyStatus(s.id, newStatus);
            });

            toggleRow.appendChild(toggleBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'strat-btn-remove';
        removeBtn.innerHTML = `<i class="fas fa-trash"></i>`;
        removeBtn.title = 'Remove strategy';

        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // ── Parse strategyType by stripping _symbol_tf from end of s.id ──
            const strategyType = s.id.replace(`_${s.symbol}_${s.tf}`, '');

            // ── Dispatch only — module-manager owns full cleanup chain ──
            document.dispatchEvent(new CustomEvent('remove-strategy', {
                detail: { strategyType, symbol: s.symbol, timeframe: s.tf }
            }));

            const item = detail.closest('.strat-item') as HTMLElement;
            if (item) item.classList.add('removing');
        });

        toggleRow.appendChild(removeBtn);
        detail.appendChild(toggleRow);

        detail.appendChild(this.buildControl('Volume', s.volume.toFixed(2), 'lots', s.id, 'volume'));
        detail.appendChild(this.buildControl('Risk',   s.risk.toFixed(1),   '%',    s.id, 'risk'));

        return detail;
    }

    // ================================================================
    // BUILD CONTROL ROW
    // ================================================================

    private buildControl(
        label:   string,
        value:   string,
        unit:    string,
        stratId: string,
        field:   string
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'strat-control-row';
        row.innerHTML = `
            <span class="strat-control-label">${label}</span>
            <div class="strat-control-input-wrap">
                <input
                    class="strat-control-input"
                    type="number"
                    value="${value}"
                    step="${field === 'volume' ? '0.01' : '0.1'}"
                    min="0"
                    data-strat-id="${stratId}"
                    data-field="${field}"
                />
                <span class="strat-control-unit">${unit}</span>
            </div>
        `;

        const input = row.querySelector('input') as HTMLInputElement;
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            const val = parseFloat((e.target as HTMLInputElement).value);
            if (isNaN(val)) return;
            document.dispatchEvent(new CustomEvent('update-strategy', {
                detail: { strategyId: stratId, updates: { [field]: val } }
            }));
        });

        return row;
    }

    // ================================================================
    // SWITCH CHART
    // ================================================================

    private switchChart(s: StrategyItem): void {
        this.selectedId = s.id;
        this.listEl?.querySelectorAll('.strat-item').forEach(el => el.classList.remove('selected'));
        const main = this.listEl?.querySelector(`[data-strat-id="${s.id}"]`);
        main?.closest('.strat-item')?.classList.add('selected');

        document.dispatchEvent(new CustomEvent('symbol-changed', {
            detail: { symbol: s.symbol }
        }));
        document.dispatchEvent(new CustomEvent('timeframe-changed', {
            detail: { timeframe: s.tf }
        }));

        console.log(`[Strategies] Switched chart → ${s.symbol} ${s.tf}`);
    }

    // ================================================================
    // TOGGLE EXPAND
    // ================================================================

    private toggleExpand(id: string, wrapper: HTMLElement, detail: HTMLElement): void {
        const isOpen = detail.classList.contains('show');

        document.querySelectorAll('.strat-item-detail').forEach(d => d.classList.remove('show'));
        document.querySelectorAll('.strat-item').forEach(i => i.classList.remove('expanded'));

        if (!isOpen) {
            detail.classList.add('show');
            wrapper.classList.add('expanded');
            this.expandedId = id;
        } else {
            this.expandedId = null;
        }
    }

    // ================================================================
    // SUMMARY
    // ================================================================

    private updateSummary(items: StrategyItem[]): void {
        const active = items.filter(s => s.status === 'running').length;
        const trades = items.reduce((acc, s) => acc + s.trades, 0);
        const pnl    = items.reduce((acc, s) => acc + (s.pnl || 0), 0);

        const winItems = items.filter(s => s.winrate !== null && s.winrate > 0);
        const avgWin   = winItems.length
            ? Math.round(winItems.reduce((acc, s) => acc + (s.winrate || 0), 0) / winItems.length)
            : 0;

        const pnlText  = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
        const pnlClass = pnl >= 0 ? 'positive' : 'negative';

        const el = (id: string) => document.getElementById(id);
        if (el('stratStatActive')) el('stratStatActive')!.textContent = String(active);
        if (el('stratStatTrades')) el('stratStatTrades')!.textContent = String(trades);

        const pnlEl = el('stratStatPnl');
        if (pnlEl) {
            pnlEl.textContent = pnlText;
            pnlEl.className   = `strat-summary-value ${pnlClass}`;
        }

        const winEl = el('stratStatWin');
        if (winEl) {
            winEl.textContent = avgWin > 0 ? `${avgWin}%` : '—';
            winEl.className   = `strat-summary-value ${avgWin >= 50 ? 'positive' : ''}`;
        }
    }

    private updateFooter(): void {
        const el = document.getElementById('stratDeployedCount');
        if (el) el.textContent = String(this.strategies.length);
    }

    // ================================================================
    // FILTER
    // ================================================================

    private getFiltered(): StrategyItem[] {
        if (this.currentFilter === 'all') return [...this.strategies];
        return this.strategies.filter(s => s.status === this.currentFilter);
    }
}

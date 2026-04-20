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
// 5. Remove → dispatches 'remove-strategy' CustomEvent with { strategyId }
//    ModuleManager listens → connectionManager.removeStrategy()
//    IndicatorManager.removeIndicator() removes legend from chart
//
// 6. When strategy is deployed on current chart symbol+TF:
//    Legend shows via indicator-added event from IndicatorManager
//    When chart switches away: legend hides but strategy stays in panel
//    Strategy item in panel always shows current status regardless of chart
//
// 7. onStrategyData callback from ConnectionManager feeds real data here.
//    Replace MOCK_DATA with real data when backend is ready.
//    Call this.setStrategies(realData) from ModuleManager.
//
// ================================================================

interface StrategyItem {
    id:       string;
    name:     string;
    symbol:   string;
    tf:       string;
    status:   'running' | 'paused' | 'stopped';
    pnl:      number;
    trades:   number;
    winrate:  number;
    volume:   number;
    risk:     number;
    // iconColor: used for icon variant — green/blue/warn/purple
    iconColor: 'green' | 'blue' | 'warn' | 'purple';
}

type StratFilter = 'all' | 'running' | 'paused' | 'stopped';

export class StrategiesModule {

    private container:   HTMLElement | null = null;
    private listEl:      HTMLElement | null = null;
    private currentFilter: StratFilter = 'all';
    private expandedId:  string | null = null;
    private selectedId:  string | null = null;

    // ── Mock data — replace with real data from ConnectionManager ──
    // TODO: call this.setStrategies(data) from onStrategyData callback
    private strategies: StrategyItem[] = [
        {
            id: 'ema-cross-eurusd-h1',
            name: 'EMA Cross',
            symbol: 'EURUSD', tf: 'H1',
            status: 'running',
            pnl: 142.50, trades: 18, winrate: 67,
            volume: 0.10, risk: 1.0,
            iconColor: 'green'
        },
        {
            id: 'rsi-rev-gbpusd-m15',
            name: 'RSI Mean Rev',
            symbol: 'GBPUSD', tf: 'M15',
            status: 'running',
            pnl: 89.20, trades: 24, winrate: 58,
            volume: 0.05, risk: 0.5,
            iconColor: 'blue'
        },
        {
            id: 'macd-trend-usdjpy-h4',
            name: 'MACD Trend',
            symbol: 'USDJPY', tf: 'H4',
            status: 'paused',
            pnl: -18.40, trades: 5, winrate: 40,
            volume: 0.10, risk: 1.0,
            iconColor: 'warn'
        },
        {
            id: 'bb-squeeze-xauusd-d1',
            name: 'BB Squeeze',
            symbol: 'XAUUSD', tf: 'D1',
            status: 'stopped',
            pnl: 0, trades: 0, winrate: 0,
            volume: 0.01, risk: 0.5,
            iconColor: 'purple'
        },
    ];

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

        console.log('✅ Strategies Module initialized (mock)');
    }

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        console.log('🗑️ Strategies Module destroyed');
    }

    // ================================================================
    // PUBLIC — called by ModuleManager when real data arrives
    // TODO: wire to ConnectionManager.onStrategyData callback
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

    // ================================================================
    // BIND EVENTS
    // ================================================================

    private bindEvents(): void {
        // ── Three-dot dropdown ──
        const menuBtn  = document.getElementById('strategyMenuBtn');
        const drop     = document.getElementById('strategySettingsDrop');

        menuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            drop?.classList.toggle('show');
        });

        document.addEventListener('click', () => drop?.classList.remove('show'));

        // ── Filter options ──
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

        // ── Refresh ──
        document.getElementById('strategyRefreshBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            drop?.classList.remove('show');
            this.render();
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

        // Re-expand previously expanded
        if (this.expandedId) {
            const detail = document.getElementById(`strat-detail-${this.expandedId}`);
            const item   = this.listEl.querySelector(`[data-strat-id="${this.expandedId}"]`);
            if (detail && item) {
                detail.classList.add('show');
                item.closest('.strat-item')?.classList.add('expanded');
            }
        }

        // Re-apply selected highlight
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

        // ── Main row ──
        const main = document.createElement('div');
        main.className = 'strat-item-main';
        main.setAttribute('data-strat-id', s.id);

        const pnlClass = s.pnl > 0 ? 'positive' : s.pnl < 0 ? 'negative' : 'neutral';
        const pnlText  = s.pnl > 0 ? `+$${s.pnl.toFixed(2)}` : s.pnl < 0 ? `-$${Math.abs(s.pnl).toFixed(2)}` : '$0.00';
        const pulseClass = s.status === 'running' ? '' : s.status === 'paused' ? 'paused' : 'stopped';

        main.innerHTML = `
            <div class="strat-icon ${s.iconColor}"><i class="fas fa-robot"></i></div>
            <div class="strat-item-info">
                <span class="strat-item-name">${s.name}</span>
                <div class="strat-item-meta">
                    <span class="strat-item-symbol">${s.symbol}</span>
                    <span class="strat-item-tf">${s.tf}</span>
                </div>
            </div>
            <div class="strat-item-right">
                <div class="strat-pulse ${pulseClass}"></div>
                <span class="strat-status ${s.status}">${s.status}</span>
                <span class="strat-item-pnl ${pnlClass}">${pnlText}</span>
                <button class="strat-chevron" data-strat-id="${s.id}">
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
        `;

        // ── Stats sub-row ──
        const stats = document.createElement('div');
        stats.className = 'strat-item-stats';
        stats.innerHTML = `
            <div class="strat-stat">
                <i class="fas fa-chart-bar"></i>
                <span>Trades:</span>
                <span class="strat-stat-val">${s.trades}</span>
            </div>
            <div class="strat-stat">
                <i class="fas fa-percent"></i>
                <span>Win:</span>
                <span class="strat-stat-val">${s.winrate > 0 ? s.winrate + '%' : '—'}</span>
            </div>
        `;

        // ── Detail ──
        const detail = this.buildDetail(s);

        // ── Click main row (not chevron) → switch chart ──
        main.addEventListener('click', (e) => {
            const chevron = (e.target as HTMLElement).closest('.strat-chevron');
            if (chevron) return; // chevron handles its own click

            this.switchChart(s);
        });

        // ── Chevron → expand detail ──
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

        // ── Toggle + Remove row ──
        const toggleRow = document.createElement('div');
        toggleRow.className = 'strat-toggle-row';

        if (!isStopped) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = isPaused ? 'strat-btn-resume' : 'strat-btn-pause';
            toggleBtn.innerHTML = isPaused
                ? `<i class="fas fa-play"></i> Resume`
                : `<i class="fas fa-pause"></i> Pause`;

            // TODO: dispatch 'update-strategy' event with { strategyId: s.id, updates: { paused: !isPaused } }
            // ModuleManager picks this up → connectionManager.updateStrategy()
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newStatus = isPaused ? 'running' : 'paused';
                document.dispatchEvent(new CustomEvent('update-strategy', {
                    detail: { strategyId: s.id, updates: { paused: newStatus === 'paused' } }
                }));
                // Mock: update local state
                this.updateStrategyStatus(s.id, newStatus);
            });

            toggleRow.appendChild(toggleBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'strat-btn-remove';
        removeBtn.innerHTML = `<i class="fas fa-trash"></i>`;
        removeBtn.title = 'Remove strategy';

        // TODO: dispatch 'remove-strategy' event with { strategyId: s.id }
        // ModuleManager picks this up → connectionManager.removeStrategy() + indicatorManager.removeIndicator()
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('remove-strategy', {
                detail: { strategyId: s.id }
            }));
            // Mock: animate and remove locally
            const item = detail.closest('.strat-item') as HTMLElement;
            if (item) {
                item.classList.add('removing');
                setTimeout(() => this.removeStrategyById(s.id), 200);
            }
        });

        toggleRow.appendChild(removeBtn);
        detail.appendChild(toggleRow);

        // ── Volume control ──
        // TODO: on blur/change dispatch 'update-strategy' with { strategyId: s.id, updates: { volume } }
        detail.appendChild(this.buildControl('Volume', s.volume.toFixed(2), 'lots', s.id, 'volume'));

        // ── Risk control ──
        // TODO: on blur/change dispatch 'update-strategy' with { strategyId: s.id, updates: { risk } }
        detail.appendChild(this.buildControl('Risk', s.risk.toFixed(1), '%', s.id, 'risk'));

        return detail;
    }

    // ================================================================
    // BUILD CONTROL ROW
    // ================================================================

    private buildControl(
        label: string,
        value: string,
        unit:  string,
        stratId: string,
        field: string
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
            // TODO: dispatch 'update-strategy' with real strategyId from backend
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
        // Update selected highlight
        this.selectedId = s.id;
        this.listEl?.querySelectorAll('.strat-item').forEach(el => el.classList.remove('selected'));
        const main = this.listEl?.querySelector(`[data-strat-id="${s.id}"]`);
        main?.closest('.strat-item')?.classList.add('selected');

        // TODO: These two events are already wired in ModuleManager.setupDOMEventBridge()
        // symbol-changed → connectionManager.setSymbol() + chart.handleSymbolChange()
        // timeframe-changed → connectionManager.setTimeframe() + chart.handleTimeframeChange()
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

        // Close all
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
        const pnl    = items.reduce((acc, s) => acc + s.pnl, 0);
        const winItems = items.filter(s => s.winrate > 0);
        const avgWin = winItems.length
            ? Math.round(winItems.reduce((acc, s) => acc + s.winrate, 0) / winItems.length)
            : 0;

        const pnlEl = document.getElementById('stratStatPnl');
        const pnlText = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

        const el = (id: string) => document.getElementById(id);
        if (el('stratStatActive')) el('stratStatActive')!.textContent = String(active);
        if (el('stratStatTrades')) el('stratStatTrades')!.textContent = String(trades);
        if (pnlEl) {
            pnlEl.textContent = pnlText;
            pnlEl.className = `strat-summary-value ${pnl >= 0 ? 'positive' : 'negative'}`;
        }
        if (el('stratStatWin')) {
            el('stratStatWin')!.textContent = avgWin > 0 ? `${avgWin}%` : '0%';
            el('stratStatWin')!.className = `strat-summary-value ${avgWin >= 50 ? 'positive' : ''}`;
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

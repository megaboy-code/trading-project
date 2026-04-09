// ================================================================
// 📋 JOURNAL MINI MODULE — Today's Trades Panel
// ================================================================

interface JournalTrade {
    id:        number;
    pair:      string;
    direction: 'LONG' | 'SHORT';
    size:      string;
    pnl:       number;
    result:    'WIN' | 'LOSS';
    date:      Date;
}

export class JournalMiniModule {

    private trades: JournalTrade[] = [
        { id: 1, pair: 'EURUSD', direction: 'LONG',  size: '0.50', pnl:  125, result: 'WIN',  date: new Date() },
        { id: 2, pair: 'GBPUSD', direction: 'SHORT', size: '0.30', pnl:  -45, result: 'LOSS', date: new Date() },
        { id: 3, pair: 'XAUUSD', direction: 'LONG',  size: '0.10', pnl:   87, result: 'WIN',  date: new Date() },
        { id: 4, pair: 'USDJPY', direction: 'LONG',  size: '0.40', pnl:  220, result: 'WIN',  date: new Date(Date.now() - 86400000) },
        { id: 5, pair: 'BTCUSD', direction: 'SHORT', size: '0.05', pnl:  -32, result: 'LOSS', date: new Date(Date.now() - 86400000) },
    ];

    // ── DOM refs ──
    private listEl:       HTMLElement | null = null;
    private pnlEl:        HTMLElement | null = null;
    private winRateEl:    HTMLElement | null = null;
    private tradeCountEl: HTMLElement | null = null;
    private openFullBtn:  HTMLElement | null = null;

    // ==================== INITIALIZATION ====================

    public initialize(): void {
        this.listEl       = document.getElementById('journalMiniList');
        this.pnlEl        = document.getElementById('journalTodayPnl');
        this.winRateEl    = document.getElementById('journalWinRate');
        this.tradeCountEl = document.getElementById('journalTradeCount');
        this.openFullBtn  = document.getElementById('journalOpenFullBtn');

        this.setupEventListeners();
        this.render();

        console.log('✅ JournalMiniModule initialized');
    }

    private setupEventListeners(): void {
        this.openFullBtn?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('open-journal-tab'));
        });
    }

    // ==================== RENDER ====================

    private render(): void {
        const today       = new Date().toDateString();
        const todayTrades = this.trades.filter(t => t.date.toDateString() === today);

        this.renderStats(todayTrades);
        this.renderList(todayTrades);
    }

    private renderStats(trades: JournalTrade[]): void {
        if (!this.pnlEl || !this.winRateEl || !this.tradeCountEl) return;

        if (trades.length === 0) {
            this.pnlEl.textContent        = '$0';
            this.pnlEl.className          = 'journal-mini-stat-value';
            this.winRateEl.textContent    = '0%';
            this.winRateEl.className      = 'journal-mini-stat-value';
            this.tradeCountEl.textContent = '0';
            return;
        }

        const totalPnl   = trades.reduce((sum, t) => sum + t.pnl, 0);
        const wins       = trades.filter(t => t.result === 'WIN').length;
        const winRate    = Math.round((wins / trades.length) * 100);
        const isPositive = totalPnl >= 0;

        this.pnlEl.textContent     = `${isPositive ? '+' : ''}$${Math.abs(totalPnl)}`;
        this.pnlEl.className       = `journal-mini-stat-value ${isPositive ? 'positive' : 'negative'}`;
        this.winRateEl.textContent = `${winRate}%`;
        this.winRateEl.className   = `journal-mini-stat-value ${winRate >= 50 ? 'positive' : 'negative'}`;
        this.tradeCountEl.textContent = `${trades.length}`;
    }

    private renderList(trades: JournalTrade[]): void {
        if (!this.listEl) return;

        this.listEl.innerHTML = '';

        if (trades.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'journal-mini-empty';
            empty.innerHTML = `
                <i class="fas fa-inbox"></i>
                <p>No trades today</p>
            `;
            this.listEl.appendChild(empty);
            return;
        }

        trades.forEach(trade => {
            const item = document.createElement('div');
            item.className = 'journal-trade-item';

            const dirClass = trade.direction === 'LONG' ? 'long' : 'short';
            const arrow    = trade.direction === 'LONG' ? '▲' : '▼';
            const pnlClass = trade.result === 'WIN' ? 'win' : 'loss';
            const pnlText  = `${trade.pnl >= 0 ? '+' : ''}$${Math.abs(trade.pnl)}`;

            item.innerHTML = `
                <span class="jm-pair">${trade.pair}</span>
                <div class="jm-direction ${dirClass}">
                    <span class="jm-direction-arrow">${arrow}</span>
                    <span class="jm-direction-text">${trade.direction}</span>
                    <span class="jm-direction-size">${trade.size}L</span>
                </div>
                <div class="jm-pnl ${pnlClass}">${pnlText}</div>
            `;

            this.listEl!.appendChild(item);
        });
    }

    // ==================== PUBLIC API ====================

    public destroy(): void {
        this.openFullBtn?.removeEventListener('click', () => {});
    }
}
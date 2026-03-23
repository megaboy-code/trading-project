// ================================================================
// 📋 WATCHLIST MODULE
// Real MT5 prices via WebSocket
// localStorage persists watchlist state
// ================================================================

interface WatchlistSymbol {
    id:     string;
    name:   string;
    cat:    string;
    type:   'forex' | 'metal' | 'crypto' | 'index';
    base?:  string;
    quote?: string;
    img?:   string;
    price:  string;
    chg:    string;
}

const DEFAULT_SYMBOLS = ['BTCUSD', 'EURUSD', 'XAUUSD', 'ETHUSD', 'USDJPY'];
const STORAGE_KEY     = 'watchlist_symbols';

export class WatchlistModule {

    private container:     HTMLElement | null = null;
    private itemsEl:       HTMLElement | null = null;
    private searchEl:      HTMLElement | null = null;
    private searchInput:   HTMLInputElement | null = null;
    private searchResults: HTMLElement | null = null;

    private added: Set<string> = new Set();
    private currentSort: 'az' | 'chg' = 'az';

    private priceUpdateHandler:     ((e: Event) => void) | null = null;
    private watchlistUpdateHandler: ((e: Event) => void) | null = null;

    // ── Full symbol database ──
    private readonly SYMBOLS: WatchlistSymbol[] = [
        { id: 'EURUSD',  name: 'EUR/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'eu', quote: 'us', price: '--', chg: '0.00' },
        { id: 'GBPUSD',  name: 'GBP/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'gb', quote: 'us', price: '--', chg: '0.00' },
        { id: 'USDJPY',  name: 'USD/JPY',  cat: 'Forex · Major',  type: 'forex',  base: 'us', quote: 'jp', price: '--', chg: '0.00' },
        { id: 'AUDUSD',  name: 'AUD/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'au', quote: 'us', price: '--', chg: '0.00' },
        { id: 'USDCAD',  name: 'USD/CAD',  cat: 'Forex · Major',  type: 'forex',  base: 'us', quote: 'ca', price: '--', chg: '0.00' },
        { id: 'NZDUSD',  name: 'NZD/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'nz', quote: 'us', price: '--', chg: '0.00' },
        { id: 'USDCHF',  name: 'USD/CHF',  cat: 'Forex · Major',  type: 'forex',  base: 'us', quote: 'ch', price: '--', chg: '0.00' },
        { id: 'EURGBP',  name: 'EUR/GBP',  cat: 'Forex · Cross',  type: 'forex',  base: 'eu', quote: 'gb', price: '--', chg: '0.00' },
        { id: 'EURJPY',  name: 'EUR/JPY',  cat: 'Forex · Cross',  type: 'forex',  base: 'eu', quote: 'jp', price: '--', chg: '0.00' },
        { id: 'GBPJPY',  name: 'GBP/JPY',  cat: 'Forex · Cross',  type: 'forex',  base: 'gb', quote: 'jp', price: '--', chg: '0.00' },
        { id: 'XAUUSD',  name: 'XAU/USD',  cat: 'Metal · Gold',   type: 'metal',  img: 'https://assets.coincap.io/assets/icons/xau@2x.png',  price: '--', chg: '0.00' },
        { id: 'XAGUSD',  name: 'XAG/USD',  cat: 'Metal · Silver', type: 'metal',  img: 'https://assets.coincap.io/assets/icons/xag@2x.png',  price: '--', chg: '0.00' },
        { id: 'BTCUSD',  name: 'BTC/USD',  cat: 'Crypto',         type: 'crypto', img: 'https://assets.coincap.io/assets/icons/btc@2x.png',  price: '--', chg: '0.00' },
        { id: 'ETHUSD',  name: 'ETH/USD',  cat: 'Crypto',         type: 'crypto', img: 'https://assets.coincap.io/assets/icons/eth@2x.png',  price: '--', chg: '0.00' },
        { id: 'SOLUSD',  name: 'SOL/USD',  cat: 'Crypto',         type: 'crypto', img: 'https://assets.coincap.io/assets/icons/sol@2x.png',  price: '--', chg: '0.00' },
        { id: 'US30',    name: 'US30',     cat: 'Index · Dow',    type: 'index',  img: 'https://flagcdn.com/w320/us.png',                     price: '--', chg: '0.00' },
        { id: 'US500',   name: 'US500',    cat: 'Index · S&P500', type: 'index',  img: 'https://flagcdn.com/w320/us.png',                     price: '--', chg: '0.00' },
        { id: 'NAS100',  name: 'NAS100',   cat: 'Index · Nasdaq', type: 'index',  img: 'https://flagcdn.com/w320/us.png',                     price: '--', chg: '0.00' },
        { id: 'GER40',   name: 'GER40',    cat: 'Index · DAX',    type: 'index',  img: 'https://flagcdn.com/w320/de.png',                     price: '--', chg: '0.00' },
        { id: 'UK100',   name: 'UK100',    cat: 'Index · FTSE',   type: 'index',  img: 'https://flagcdn.com/w320/gb.png',                     price: '--', chg: '0.00' },
    ];

    // ================================================================
    // INITIALIZE
    // ================================================================

    public initialize(): void {
        this.container     = document.querySelector('.watchlist-panel');
        this.itemsEl       = document.getElementById('watchlistItems');
        this.searchEl      = document.getElementById('watchlistSearch');
        this.searchInput   = document.getElementById('watchlistSearchInput') as HTMLInputElement;
        this.searchResults = document.getElementById('watchlistSearchResults');

        if (!this.container || !this.itemsEl) {
            console.warn('⚠️ Watchlist: container not found');
            return;
        }

        // ── Load saved watchlist or use defaults ──
        this.loadFromStorage();

        this.renderSymbols();
        this.bindEvents();

        // ── Tell C++ about all watchlist symbols ──
        this.added.forEach(symbol => {
            this.notifyBackendAdd(symbol);
        });

        console.log('✅ Watchlist Module initialized');
    }

    // ================================================================
    // STORAGE
    // ================================================================

    private loadFromStorage(): void {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const symbols: string[] = JSON.parse(saved);
                if (Array.isArray(symbols) && symbols.length > 0) {
                    this.added = new Set(symbols);
                    return;
                }
            }
        } catch {}

        // ── Defaults ──
        this.added = new Set(DEFAULT_SYMBOLS);
        this.saveToStorage();
    }

    private saveToStorage(): void {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(Array.from(this.added))
            );
        } catch {}
    }

    // ── Notify C++ backend ──
    private notifyBackendAdd(symbol: string): void {
        document.dispatchEvent(new CustomEvent('watchlist-add', {
            detail: { symbol }
        }));
    }

    private notifyBackendRemove(symbol: string): void {
        document.dispatchEvent(new CustomEvent('watchlist-remove', {
            detail: { symbol }
        }));
    }

    // ================================================================
    // RENDER
    // ================================================================

    private renderSymbols(): void {
        if (!this.itemsEl) return;
        this.itemsEl.innerHTML = '';

        const symbols = this.SYMBOLS.filter(s => this.added.has(s.id));
        symbols.forEach((sym, idx) => {
            const item = this.buildWatchItem(sym);
            if (idx === 0) item.classList.add('active');
            this.itemsEl!.appendChild(item);
        });
    }

    private buildWatchItem(sym: WatchlistSymbol): HTMLElement {
        const item = document.createElement('div');
        item.className = 'watch-item';
        item.setAttribute('data-symbol', sym.id);
        item.innerHTML = `
            ${this.buildIconHTML(sym)}
            <div class="watch-symbol-wrap">
                <div class="watch-symbol">${sym.name}</div>
                <div class="watch-category">${sym.cat}</div>
            </div>
            <div class="watch-price" data-price-id="${sym.id}">--</div>
            <div class="watch-change" data-chg-id="${sym.id}">--</div>
            <button class="watch-delete"><i class="fas fa-times"></i></button>
        `;

        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.watch-delete')) return;
            this.setActive(sym.id);
            this.switchChartSymbol(sym.id);
        });

        item.querySelector('.watch-delete')!.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeSymbol(sym.id, item);
        });

        return item;
    }

    private buildIconHTML(sym: WatchlistSymbol): string {
        if (sym.type === 'forex') {
            return `
                <div class="wl-flag-container">
                    <div class="wl-flag-circle wl-flag-base"
                         style="background-image:url('https://flagcdn.com/w320/${sym.base}.png');"></div>
                    <div class="wl-flag-circle wl-flag-quote"
                         style="background-image:url('https://flagcdn.com/w320/${sym.quote}.png');"></div>
                </div>`;
        }

        return `
            <div class="wl-symbol-icon-wrap">
                <div class="wl-symbol-icon ${sym.type}">
                    <img src="${sym.img}"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                         alt="${sym.name}">
                    <i class="fas fa-circle-dot" style="display:none;"></i>
                </div>
            </div>`;
    }

    // ================================================================
    // EVENTS
    // ================================================================

    private bindEvents(): void {
        // Add button
        document.getElementById('watchlistAddBtn')
            ?.addEventListener('click', () => this.toggleSearch());

        // Search input
        this.searchInput?.addEventListener('input', () => this.handleSearch());

        // Sort buttons
        document.querySelectorAll('.wl-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sort = btn.getAttribute('data-sort') as 'az' | 'chg';
                this.setSort(sort);
                document.querySelectorAll('.wl-sort-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Close search on outside click
        document.addEventListener('click', (e) => {
            if (!this.searchEl?.contains(e.target as Node) &&
                !(e.target as HTMLElement).closest('#watchlistAddBtn')) {
                this.closeSearch();
            }
        });

        // ── Real price update from active chart symbol ──
        this.priceUpdateHandler = (e: Event) => {
            const { symbol, bid } = (e as CustomEvent).detail;
            if (symbol && bid !== undefined) {
                this.updatePrice(symbol, bid);
            }
        };
        document.addEventListener('price-update', this.priceUpdateHandler);

        // ── Watchlist prices from C++ backend ──
        this.watchlistUpdateHandler = (e: Event) => {
            const { prices } = (e as CustomEvent).detail;
            if (!prices) return;
            Object.entries(prices).forEach(([symbol, data]: [string, any]) => {
                if (data.bid !== undefined) {
                    this.updatePrice(symbol, data.bid);
                }
            });
        };
        document.addEventListener('watchlist-prices-update', this.watchlistUpdateHandler);
    }

    // ================================================================
    // SEARCH
    // ================================================================

    private toggleSearch(): void {
        const isOpen = this.searchEl?.classList.contains('show');
        if (isOpen) {
            this.closeSearch();
        } else {
            this.searchEl?.classList.add('show');
            this.searchInput?.focus();
        }
    }

    private closeSearch(): void {
        this.searchEl?.classList.remove('show');
        if (this.searchInput)   this.searchInput.value = '';
        if (this.searchResults) this.searchResults.innerHTML = '';
    }

    private handleSearch(): void {
        const q = this.searchInput?.value.trim().toLowerCase() || '';
        if (!this.searchResults) return;
        this.searchResults.innerHTML = '';
        if (!q) return;

        const matches = this.SYMBOLS.filter(s =>
            !this.added.has(s.id) &&
            (s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
        ).slice(0, 5);

        if (!matches.length) {
            this.searchResults.innerHTML = `
                <div style="font-size:0.65rem;color:var(--text-muted);padding:4px 8px;">
                    No results found
                </div>`;
            return;
        }

        matches.forEach(sym => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                ${this.buildIconHTML(sym)}
                <span class="search-result-name">${sym.name}</span>
                <span class="search-result-cat">${sym.cat}</span>
            `;
            item.addEventListener('click', () => this.addSymbol(sym));
            this.searchResults!.appendChild(item);
        });
    }

    // ================================================================
    // ADD / REMOVE
    // ================================================================

    private addSymbol(sym: WatchlistSymbol): void {
        this.added.add(sym.id);
        this.saveToStorage();

        const item = this.buildWatchItem(sym);
        this.itemsEl?.appendChild(item);
        this.closeSearch();

        // ── Tell C++ to add to watchlist ──
        this.notifyBackendAdd(sym.id);

        console.log(`➕ Watchlist add: ${sym.id}`);
    }

    private removeSymbol(id: string, el: HTMLElement): void {
        this.added.delete(id);
        this.saveToStorage();
        el.remove();

        // ── Tell C++ to remove from watchlist ──
        this.notifyBackendRemove(id);

        // If removed was active → set first as active
        const first = this.itemsEl?.querySelector('.watch-item');
        if (first && !this.itemsEl?.querySelector('.watch-item.active')) {
            first.classList.add('active');
        }

        console.log(`➖ Watchlist remove: ${id}`);
    }

    // ================================================================
    // ACTIVE STATE
    // ================================================================

    private setActive(id: string): void {
        this.itemsEl?.querySelectorAll('.watch-item').forEach(item => {
            item.classList.toggle(
                'active',
                item.getAttribute('data-symbol') === id
            );
        });
    }

    // ================================================================
    // CHART SWITCH
    // ================================================================

    private switchChartSymbol(symbol: string): void {
        document.dispatchEvent(new CustomEvent('symbol-changed', {
            detail: { symbol }
        }));
        console.log(`📊 Watchlist → chart: ${symbol}`);
    }

    // ================================================================
    // PRICE UPDATE — called from WebSocket data
    // ================================================================

    public updatePrice(symbolId: string, price: number): void {
        const priceEl = this.itemsEl?.querySelector(
            `[data-price-id="${symbolId}"]`
        );
        if (!priceEl) return;

        const current  = parseFloat(priceEl.textContent || '0');
        const goUp     = price >= current;

        priceEl.textContent = price.toString();
        priceEl.classList.remove('flash-up', 'flash-down');
        priceEl.classList.add(goUp ? 'flash-up' : 'flash-down');
        setTimeout(() => priceEl.classList.remove('flash-up', 'flash-down'), 400);
    }

    // ================================================================
    // SORT
    // ================================================================

    private setSort(sort: 'az' | 'chg'): void {
        this.currentSort = sort;
        if (!this.itemsEl) return;

        const items = Array.from(
            this.itemsEl.querySelectorAll('.watch-item')
        );

        items.sort((a, b) => {
            if (sort === 'az') {
                const nameA = a.querySelector('.watch-symbol')?.textContent || '';
                const nameB = b.querySelector('.watch-symbol')?.textContent || '';
                return nameA.localeCompare(nameB);
            } else {
                const chgA = parseFloat(
                    a.querySelector('.watch-change')?.textContent || '0'
                );
                const chgB = parseFloat(
                    b.querySelector('.watch-change')?.textContent || '0'
                );
                return chgB - chgA;
            }
        });

        items.forEach(item => this.itemsEl!.appendChild(item));
    }

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        if (this.priceUpdateHandler) {
            document.removeEventListener('price-update', this.priceUpdateHandler);
        }
        if (this.watchlistUpdateHandler) {
            document.removeEventListener('watchlist-prices-update', this.watchlistUpdateHandler);
        }
        console.log('🗑️ Watchlist Module destroyed');
    }
}
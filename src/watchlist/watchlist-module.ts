// ================================================================
// 📋 WATCHLIST MODULE
// Real MT5 prices via WebSocket
// localStorage persists watchlist state
// Daily change % from cached D1 open
// ================================================================

import { ConnectionManager } from '../core/connection-manager';

interface WatchlistSymbol {
    id:     string;
    name:   string;
    cat:    string;
    type:   'forex' | 'metal' | 'crypto' | 'index';
    base?:  string;
    quote?: string;
    img?:   string;
}

interface ElementRefs {
    price:  HTMLElement;
    change: HTMLElement;
}

const DEFAULT_SYMBOLS = ['BTCUSD', 'EURUSD', 'XAUUSD', 'ETHUSD', 'USDJPY'];
const STORAGE_KEY     = 'watchlist_symbols';

export class WatchlistModule {

    private container:     HTMLElement | null = null;
    private itemsEl:       HTMLElement | null = null;
    private searchEl:      HTMLElement | null = null;
    private searchInput:   HTMLInputElement | null = null;
    private searchResults: HTMLElement | null = null;

    private added:       Set<string> = new Set();
    private currentSort: 'az' | 'chg' = 'az';

    // ✅ Fix #12 — element reference map for direct DOM access
    private elementRefs: Map<string, ElementRefs> = new Map();

    // ✅ Cache last known price + change per symbol to skip redundant DOM writes
    private priceCache: Map<string, { price: number; change?: number }> = new Map();

    // ── Full symbol database ──
    private readonly SYMBOLS: WatchlistSymbol[] = [
        { id: 'EURUSD',  name: 'EUR/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'eu', quote: 'us' },
        { id: 'GBPUSD',  name: 'GBP/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'gb', quote: 'us' },
        { id: 'USDJPY',  name: 'USD/JPY',  cat: 'Forex · Major',  type: 'forex',  base: 'us', quote: 'jp' },
        { id: 'AUDUSD',  name: 'AUD/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'au', quote: 'us' },
        { id: 'USDCAD',  name: 'USD/CAD',  cat: 'Forex · Major',  type: 'forex',  base: 'us', quote: 'ca' },
        { id: 'NZDUSD',  name: 'NZD/USD',  cat: 'Forex · Major',  type: 'forex',  base: 'nz', quote: 'us' },
        { id: 'USDCHF',  name: 'USD/CHF',  cat: 'Forex · Major',  type: 'forex',  base: 'us', quote: 'ch' },
        { id: 'EURGBP',  name: 'EUR/GBP',  cat: 'Forex · Cross',  type: 'forex',  base: 'eu', quote: 'gb' },
        { id: 'EURJPY',  name: 'EUR/JPY',  cat: 'Forex · Cross',  type: 'forex',  base: 'eu', quote: 'jp' },
        { id: 'GBPJPY',  name: 'GBP/JPY',  cat: 'Forex · Cross',  type: 'forex',  base: 'gb', quote: 'jp' },
        { id: 'XAUUSD',  name: 'XAU/USD',  cat: 'Metal · Gold',   type: 'metal',  img: 'https://assets.coincap.io/assets/icons/xau@2x.png'  },
        { id: 'XAGUSD',  name: 'XAG/USD',  cat: 'Metal · Silver', type: 'metal',  img: 'https://assets.coincap.io/assets/icons/xag@2x.png'  },
        { id: 'BTCUSD',  name: 'BTC/USD',  cat: 'Crypto',         type: 'crypto', img: 'https://assets.coincap.io/assets/icons/btc@2x.png'  },
        { id: 'ETHUSD',  name: 'ETH/USD',  cat: 'Crypto',         type: 'crypto', img: 'https://assets.coincap.io/assets/icons/eth@2x.png'  },
        { id: 'SOLUSD',  name: 'SOL/USD',  cat: 'Crypto',         type: 'crypto', img: 'https://assets.coincap.io/assets/icons/sol@2x.png'  },
        { id: 'US30',    name: 'US30',     cat: 'Index · Dow',    type: 'index',  img: 'https://flagcdn.com/w320/us.png'                     },
        { id: 'US500',   name: 'US500',    cat: 'Index · S&P500', type: 'index',  img: 'https://flagcdn.com/w320/us.png'                     },
        { id: 'NAS100',  name: 'NAS100',   cat: 'Index · Nasdaq', type: 'index',  img: 'https://flagcdn.com/w320/us.png'                     },
        { id: 'GER40',   name: 'GER40',    cat: 'Index · DAX',    type: 'index',  img: 'https://flagcdn.com/w320/de.png'                     },
        { id: 'UK100',   name: 'UK100',    cat: 'Index · FTSE',   type: 'index',  img: 'https://flagcdn.com/w320/gb.png'                     },
    ];

    // ✅ Fix #15 — connectionManager injected directly
    constructor(private connectionManager: ConnectionManager) {}

    // ================================================================
    // INITIALIZE
    // ================================================================

    public initialize(): void {
        this.container     = document.querySelector('.watchlist-panel');
        this.itemsEl       = document.getElementById('watchlistItems');
        this.searchEl      = document.getElementById('watchlistSearch');
        this.searchInput   = document.getElementById('watchlistSearchInput') as HTMLInputElement;
        this.searchResults = document.getElementById('watchlistSearchResults');

        if (!this.container || !this.itemsEl) return;

        this.loadFromStorage();
        this.renderSymbols();
        this.bindEvents();

        // ✅ FlatBuffers — primitives direct, no WebSocketMessage
        this.connectionManager.onWatchlistUpdate((
            symbol, bid, ask, spread, time, change) =>
        {
            this.updatePrice(symbol, bid, change);
        });
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

    // ================================================================
    // RENDER
    // ================================================================

    private renderSymbols(): void {
        if (!this.itemsEl) return;
        this.itemsEl.innerHTML = '';
        this.elementRefs.clear();

        const symbols = this.SYMBOLS.filter(s => this.added.has(s.id));
        symbols.forEach((sym, idx) => {
            const item = this.buildWatchItem(sym);
            if (idx === 0) item.classList.add('active');
            this.itemsEl!.appendChild(item);
        });
    }

    // ✅ Fix #13 — createElement instead of innerHTML
    private buildWatchItem(sym: WatchlistSymbol): HTMLElement {
        const item = document.createElement('div');
        item.className = 'watch-item';
        item.setAttribute('data-symbol', sym.id);

        item.appendChild(this.buildIconElement(sym));

        const wrap = document.createElement('div');
        wrap.className = 'watch-symbol-wrap';

        const nameEl = document.createElement('div');
        nameEl.className   = 'watch-symbol';
        nameEl.textContent = sym.name;

        const catEl = document.createElement('div');
        catEl.className   = 'watch-category';
        catEl.textContent = sym.cat;

        wrap.appendChild(nameEl);
        wrap.appendChild(catEl);
        item.appendChild(wrap);

        const priceEl = document.createElement('div');
        priceEl.className   = 'watch-price';
        priceEl.textContent = '--';

        const chgEl = document.createElement('div');
        chgEl.className   = 'watch-change';
        chgEl.textContent = '--';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'watch-delete';
        const icon = document.createElement('i');
        icon.className = 'fas fa-times';
        deleteBtn.appendChild(icon);

        item.appendChild(priceEl);
        item.appendChild(chgEl);
        item.appendChild(deleteBtn);

        // ✅ Fix #12 — store refs immediately after building
        this.elementRefs.set(sym.id, { price: priceEl, change: chgEl });

        return item;
    }

    // ✅ Fix #13 — createElement for icon
    private buildIconElement(sym: WatchlistSymbol): HTMLElement {
        if (sym.type === 'forex') {
            const container = document.createElement('div');
            container.className = 'wl-flag-container';

            const base = document.createElement('div');
            base.className            = 'wl-flag-circle wl-flag-base';
            base.style.backgroundImage = `url('https://flagcdn.com/w320/${sym.base}.png')`;

            const quote = document.createElement('div');
            quote.className            = 'wl-flag-circle wl-flag-quote';
            quote.style.backgroundImage = `url('https://flagcdn.com/w320/${sym.quote}.png')`;

            container.appendChild(base);
            container.appendChild(quote);
            return container;
        }

        const wrap = document.createElement('div');
        wrap.className = 'wl-symbol-icon-wrap';

        const iconWrap = document.createElement('div');
        iconWrap.className = `wl-symbol-icon ${sym.type}`;

        const img = document.createElement('img');
        img.src = sym.img || '';
        img.alt = sym.name;

        const fallback = document.createElement('i');
        fallback.className    = 'fas fa-circle-dot';
        fallback.style.display = 'none';

        img.addEventListener('error', () => {
            img.style.display      = 'none';
            fallback.style.display = 'flex';
        });

        iconWrap.appendChild(img);
        iconWrap.appendChild(fallback);
        wrap.appendChild(iconWrap);
        return wrap;
    }

    // ================================================================
    // EVENTS
    // ================================================================

    private bindEvents(): void {
        document.getElementById('watchlistAddBtn')
            ?.addEventListener('click', () => this.toggleSearch());

        this.searchInput?.addEventListener('input', () => this.handleSearch());

        document.querySelectorAll('.wl-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sort = btn.getAttribute('data-sort') as 'az' | 'chg';
                this.setSort(sort);
                document.querySelectorAll('.wl-sort-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        document.addEventListener('click', (e) => {
            if (!this.searchEl?.contains(e.target as Node) &&
                !(e.target as HTMLElement).closest('#watchlistAddBtn')) {
                this.closeSearch();
            }
        });

        // ✅ Fix #14 — event delegation on itemsEl
        this.itemsEl?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const delBtn = target.closest('.watch-delete');
            const item   = target.closest('.watch-item') as HTMLElement | null;
            if (!item) return;

            const symbol = item.getAttribute('data-symbol');
            if (!symbol) return;

            if (delBtn) {
                e.stopPropagation();
                this.removeSymbol(symbol, item);
            } else {
                this.setActive(symbol);
                this.switchChartSymbol(symbol);
            }
        });
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

    // ✅ Fix #13 — createElement in search results
    private handleSearch(): void {
        const q = this.searchInput?.value.trim().toLowerCase() || '';
        if (!this.searchResults) return;
        this.searchResults.innerHTML = '';
        if (!q) return;

        const matches = this.SYMBOLS.filter(s =>
            !this.added.has(s.id) &&
            (s.name.toLowerCase().includes(q) ||
             s.id.toLowerCase().includes(q))
        ).slice(0, 5);

        if (!matches.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:0.65rem;color:var(--text-muted);padding:4px 8px;';
            empty.textContent   = 'No results found';
            this.searchResults.appendChild(empty);
            return;
        }

        matches.forEach(sym => {
            const item = document.createElement('div');
            item.className = 'search-result-item';

            item.appendChild(this.buildIconElement(sym));

            const nameSpan = document.createElement('span');
            nameSpan.className   = 'search-result-name';
            nameSpan.textContent = sym.name;

            const catSpan = document.createElement('span');
            catSpan.className   = 'search-result-cat';
            catSpan.textContent = sym.cat;

            item.appendChild(nameSpan);
            item.appendChild(catSpan);

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

        // ✅ Fix #15 — direct command
        this.connectionManager.sendCommand(`WATCHLIST_ADD_${sym.id}`);
    }

    private removeSymbol(id: string, el: HTMLElement): void {
        this.added.delete(id);
        this.saveToStorage();
        el.remove();

        // ✅ Fix #12 — clean up refs on remove
        this.elementRefs.delete(id);
        this.priceCache.delete(id);

        // ✅ Fix #15 — direct command
        this.connectionManager.sendCommand(`WATCHLIST_REMOVE_${id}`);

        const first = this.itemsEl?.querySelector('.watch-item');
        if (first && !this.itemsEl?.querySelector('.watch-item.active')) {
            first.classList.add('active');
        }
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
    }

    // ================================================================
    // PRICE UPDATE
    // ✅ Fix #9/#12 — direct refs, no querySelector on every tick
    // Called directly from onWatchlistUpdate callback
    // ================================================================

    public updatePrice(
        symbolId: string,
        price:    number,
        change?:  number
    ): void {
        const refs = this.elementRefs.get(symbolId);
        if (!refs) return;

        const cached = this.priceCache.get(symbolId);

        if (cached &&
            cached.price  === price &&
            cached.change === change) return;

        if (!cached || cached.price !== price) {
            const goUp = !cached || price >= cached.price;
            refs.price.textContent = price.toString();
            refs.price.classList.remove('flash-up', 'flash-down');
            refs.price.classList.add(goUp ? 'flash-up' : 'flash-down');
            setTimeout(() => refs.price.classList.remove(
                'flash-up', 'flash-down'
            ), 400);
        }

        if (change !== undefined &&
            (!cached || cached.change !== change))
        {
            const chgClass = change >= 0 ? 'up' : 'down';
            const sign     = change >= 0 ? '+' : '';
            refs.change.textContent = `${sign}${change.toFixed(2)}%`;
            refs.change.className   = `watch-change ${chgClass}`;
        }

        this.priceCache.set(symbolId, { price, change });
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
        this.elementRefs.clear();
        this.priceCache.clear();
    }
}

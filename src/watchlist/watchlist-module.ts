// ================================================================
// 📋 WATCHLIST MODULE
// Real MT5 prices via WebSocket
// localStorage persists watchlist state
// Daily change % from cached D1 open
// Config-driven — symbols from backend config, no hardcoded list
// ================================================================

interface WatchlistSymbol {
    name:        string;
    description: string;
}

interface ElementRefs {
    price:  HTMLElement;
    change: HTMLElement;
}

const STORAGE_KEY = 'watchlist_symbols';

export class WatchlistModule {

    private container:     HTMLElement | null = null;
    private itemsEl:       HTMLElement | null = null;
    private searchEl:      HTMLElement | null = null;
    private searchInput:   HTMLInputElement | null = null;
    private searchResults: HTMLElement | null = null;

    private added:       Set<string> = new Set();
    private currentSort: 'az' | 'chg' = 'az';

    // ── Element reference map for direct DOM access ──
    private elementRefs: Map<string, ElementRefs> = new Map();

    // ── Cache last known price + change per symbol ──
    private priceCache: Map<string, { price: number; change?: number }> = new Map();

    // ── Config-driven symbol list from backend ──
    private configSymbols: WatchlistSymbol[] = [];

    // ── Frontend visual maps — decoration only, backend never sees these ──
    private readonly symbolIconMap: Record<string, {
        base:      string;
        quote:     string;
        baseType:  'flag' | 'icon';
        quoteType: 'flag' | 'icon';
    }> = {
        'EURUSD':  { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
        'GBPUSD':  { base: 'https://flagcdn.com/w320/gb.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
        'USDJPY':  { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
        'AUDUSD':  { base: 'https://flagcdn.com/w320/au.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
        'USDCAD':  { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/ca.png', baseType: 'flag', quoteType: 'flag' },
        'NZDUSD':  { base: 'https://flagcdn.com/w320/nz.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
        'USDCHF':  { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/ch.png', baseType: 'flag', quoteType: 'flag' },
        'EURGBP':  { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/gb.png', baseType: 'flag', quoteType: 'flag' },
        'EURJPY':  { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
        'GBPJPY':  { base: 'https://flagcdn.com/w320/gb.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
        'XAUUSD':  { base: 'xau', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
        'XAGUSD':  { base: 'xag', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
        'BTCUSD':  { base: 'btc', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
        'ETHUSD':  { base: 'eth', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
        'SOLUSD':  { base: 'sol', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
        'LTCUSD':  { base: 'ltc', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
        'XRPUSD':  { base: 'xrp', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
        'US30':    { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
        'US500':   { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
        'NAS100':  { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
        'GER40':   { base: 'https://flagcdn.com/w320/de.png', quote: 'https://flagcdn.com/w320/de.png', baseType: 'flag', quoteType: 'flag' },
        'UK100':   { base: 'https://flagcdn.com/w320/gb.png', quote: 'https://flagcdn.com/w320/gb.png', baseType: 'flag', quoteType: 'flag' },
    };

    private readonly iconCircleMap: Record<string, string> = {
        'btc': '<i class="fab fa-bitcoin"></i>',
        'eth': '<i class="fab fa-ethereum"></i>',
        'sol': '<span>◎</span>',
        'ltc': '<span>Ł</span>',
        'xrp': '<span>X</span>',
        'xau': '<i class="fas fa-coins"></i>',
        'xag': '<i class="fas fa-coins"></i>',
        'oil': '<i class="fas fa-oil-well"></i>',
    };

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

        this.bindEvents();

        // ── Listen for backend config ──
        document.addEventListener('available-config-received', (e: Event) => {
            const config = (e as CustomEvent).detail;
            if (!config?.symbols) return;

            this.configSymbols = config.symbols;
            this.loadFromStorage();
            this.renderSymbols();
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
                    // ── Only keep symbols that exist in current config ──
                    const validNames = new Set(this.configSymbols.map(s => s.name));
                    const valid      = symbols.filter(s => validNames.has(s));
                    if (valid.length > 0) {
                        this.added = new Set(valid);
                        return;
                    }
                }
            }
        } catch {}

        // ── Default: first 5 from config ──
        this.added = new Set(this.configSymbols.slice(0, 5).map(s => s.name));
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

        const symbols = this.configSymbols.filter(s => this.added.has(s.name));
        symbols.forEach((sym, idx) => {
            const item = this.buildWatchItem(sym);
            if (idx === 0) item.classList.add('active');
            this.itemsEl!.appendChild(item);
        });
    }

    private buildWatchItem(sym: WatchlistSymbol): HTMLElement {
        const item = document.createElement('div');
        item.className = 'watch-item';
        item.setAttribute('data-symbol', sym.name);

        item.appendChild(this.buildIconElement(sym.name));

        const wrap = document.createElement('div');
        wrap.className = 'watch-symbol-wrap';

        const nameEl = document.createElement('div');
        nameEl.className   = 'watch-symbol';
        nameEl.textContent = sym.name;

        const catEl = document.createElement('div');
        catEl.className   = 'watch-category';
        catEl.textContent = sym.description;

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

        this.elementRefs.set(sym.name, { price: priceEl, change: chgEl });

        return item;
    }

    private buildIconElement(symbolName: string): HTMLElement {
        const lookup = this.stripSuffix(symbolName);
        const config = this.symbolIconMap[lookup];

        if (!config) {
            const fallback = document.createElement('div');
            fallback.className = 'wl-flag-container';
            const circle = document.createElement('div');
            circle.className        = 'wl-flag-circle wl-flag-base';
            circle.style.background = '#444';
            fallback.appendChild(circle);
            return fallback;
        }

        if (config.baseType === 'flag' && config.quoteType === 'flag') {
            const container = document.createElement('div');
            container.className = 'wl-flag-container';

            const base = document.createElement('div');
            base.className             = 'wl-flag-circle wl-flag-base';
            base.style.backgroundImage = `url('${config.base}')`;

            const quote = document.createElement('div');
            quote.className             = 'wl-flag-circle wl-flag-quote';
            quote.style.backgroundImage = `url('${config.quote}')`;

            container.appendChild(base);
            container.appendChild(quote);
            return container;
        }

        const wrap = document.createElement('div');
        wrap.className = 'wl-symbol-icon-wrap';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'wl-symbol-icon';

        if (config.baseType === 'icon') {
            iconWrap.innerHTML = this.iconCircleMap[config.base] || '';
        } else {
            iconWrap.style.backgroundImage = `url('${config.base}')`;
        }

        wrap.appendChild(iconWrap);
        return wrap;
    }

    // ── Strip broker suffixes for icon/flag lookup ──
    private stripSuffix(name: string): string {
        return name
            .toUpperCase()
            .replace('/', '')
            .replace(/\.[A-Z0-9]+$/, '')
            .replace(/[MC]$/, '');
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
    // SEARCH — filters configSymbols
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

        const matches = this.configSymbols.filter(s =>
            !this.added.has(s.name) &&
            (s.name.toLowerCase().includes(q) ||
             s.description.toLowerCase().includes(q))
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

            item.appendChild(this.buildIconElement(sym.name));

            const nameSpan = document.createElement('span');
            nameSpan.className   = 'search-result-name';
            nameSpan.textContent = sym.name;

            const catSpan = document.createElement('span');
            catSpan.className   = 'search-result-cat';
            catSpan.textContent = sym.description;

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
        this.added.add(sym.name);
        this.saveToStorage();

        const item = this.buildWatchItem(sym);
        this.itemsEl?.appendChild(item);
        this.closeSearch();

        document.dispatchEvent(new CustomEvent('watchlist-add', {
            detail: { symbol: sym.name }
        }));
    }

    private removeSymbol(id: string, el: HTMLElement): void {
        this.added.delete(id);
        this.saveToStorage();
        el.remove();

        this.elementRefs.delete(id);
        this.priceCache.delete(id);

        document.dispatchEvent(new CustomEvent('watchlist-remove', {
            detail: { symbol: id }
        }));

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
    // CHART SWITCH — dispatches broker symbol directly
    // ================================================================

    private switchChartSymbol(symbol: string): void {
        document.dispatchEvent(new CustomEvent('symbol-changed', {
            detail: { symbol }
        }));
    }

    // ================================================================
    // PRICE UPDATE
    // Called directly from module-manager onWatchlistUpdate
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

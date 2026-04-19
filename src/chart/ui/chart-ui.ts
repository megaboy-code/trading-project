// ================================================================
// ⚡ CHART UI - Professional controls (symbol, timeframe, chart type, indicators)
// Config-driven — all symbols, timeframes, indicators from backend
// Frontend owns visuals only — flags, icons, badges, categories
// ================================================================

const FAVORITES_KEY        = 'mega_flowz_indicator_favorites';
const SYMBOL_FAVORITES_KEY = 'mega_flowz_symbol_favorites';

// ================================================================
// FRONTEND STATIC MAPS — visual decoration only
// Backend never sees these
// ================================================================

const symbolIconMap: Record<string, {
    base:      string;
    quote:     string;
    baseType:  'flag' | 'icon';
    quoteType: 'flag' | 'icon';
}> = {
    'EURUSD': { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
    'GBPUSD': { base: 'https://flagcdn.com/w320/gb.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
    'USDJPY': { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
    'AUDUSD': { base: 'https://flagcdn.com/w320/au.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
    'USDCAD': { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/ca.png', baseType: 'flag', quoteType: 'flag' },
    'USDCHF': { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/ch.png', baseType: 'flag', quoteType: 'flag' },
    'NZDUSD': { base: 'https://flagcdn.com/w320/nz.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
    'XAUUSD': { base: 'xau', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'BTCUSD': { base: 'btc', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'ETHUSD': { base: 'eth', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'LTCUSD': { base: 'ltc', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'XRPUSD': { base: 'xrp', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'GBPJPY': { base: 'https://flagcdn.com/w320/gb.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
    'EURJPY': { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
    'EURGBP': { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/gb.png', baseType: 'flag', quoteType: 'flag' },
    'XAGUSD': { base: 'xag', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'USOIL':  { base: 'oil', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
};

const iconCircleMap: Record<string, string> = {
    'btc': '<i class="fab fa-bitcoin"></i>',
    'eth': '<i class="fab fa-ethereum"></i>',
    'ltc': '<span>Ł</span>',
    'xrp': '<span>X</span>',
    'xau': '<i class="fas fa-coins"></i>',
    'xag': '<i class="fas fa-coins"></i>',
    'oil': '<i class="fas fa-oil-well"></i>',
};

const categoryMap: Record<string, string[]> = {
    majors:      ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
    metals:      ['XAUUSD', 'XAGUSD'],
    crypto:      ['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD'],
    indices:     ['US30', 'SPX500', 'NAS100', 'GER40'],
    stocks:      ['AAPL', 'TSLA', 'MSFT'],
    most_traded: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'ETHUSD'],
    top_movers:  ['XAUUSD', 'BTCUSD', 'XRPUSD', 'NAS100', 'TSLA', 'AAPL'],
};

// ── Strip broker suffixes for icon lookup e.g. ETHUSDm → ETHUSD ──
function stripBrokerSuffix(symbol: string): string {
    return symbol
        .toUpperCase()
        .replace('/', '')
        .replace(/\.[A-Z0-9]+$/, '')
        .replace(/[MC]$/, '');
}

// ================================================================
// LOCAL CONFIG INTERFACES — no imports from generated files
// ================================================================

interface ConfigSymbol {
    name:        string;
    description: string;
}

interface ConfigItem {
    key:           string;
    label:         string;
    description:   string;
    badge:         string;
    type:          string;
    is_strategy:   boolean;
    period:        number;
    fast_period:   number;
    slow_period:   number;
    signal_period: number;
    k_period:      number;
    d_period:      number;
    slowing:       number;
    deviation:     number;
    overbought:    number;
    oversold:      number;
    volume:        number;
    price_type:    string;
}

interface AvailableConfig {
    symbols:            ConfigSymbol[];
    timeframes_visible: string[];
    timeframes_more:    string[];
    indicators:         ConfigItem[];
    strategies:         ConfigItem[];
    patterns:           ConfigItem[];
}

export interface ChartUICallbacks {
    onSymbolChange:    (symbol: string)    => void;
    onTimeframeChange: (timeframe: string) => void;
    onChartTypeChange: (chartType: string) => void;
}

export class ChartUI {
    private callbacks:        ChartUICallbacks;
    private isInitialized:    boolean = false;
    private currentSymbol:    string;
    private currentTimeframe: string;
    private currentChartType: string;

    // ── Config received from backend ──
    private config: AvailableConfig | null = null;

    // ── Search debounce ──
    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private lastSearchQuery:     string = '';

    // ── Active category ──
    private activeCategory: string = 'favorites';

    // ── Bound listeners ──
    private boundClickOutside:     (e: Event) => void;
    private boundIndicatorClose:   (e: Event) => void;
    private boundSymbolModalClose: (e: Event) => void;
    private boundAvailableConfig:  (e: Event) => void;

    // ── Active indicator category ──
    private activeIndCat: string = 'favorites';

    constructor(
        callbacks:        ChartUICallbacks,
        initialSymbol:    string,
        initialTimeframe: string,
        initialChartType: string
    ) {
        this.callbacks        = callbacks;
        this.currentSymbol    = initialSymbol;
        this.currentTimeframe = initialTimeframe;
        this.currentChartType = initialChartType;

        this.boundClickOutside     = () => this.closeAllDropdowns();
        this.boundIndicatorClose   = (e: Event) => this.handleIndicatorClickOutside(e);
        this.boundSymbolModalClose = (e: Event) => this.handleSymbolModalClickOutside(e);
        this.boundAvailableConfig  = (e: Event) => this.handleAvailableConfig(e);
    }

    public initialize(): void {
        if (this.isInitialized) return;

        this.setupSymbolControls();
        this.setupTimeframeControls();
        this.setupChartTypeControls();
        this.setupIndicatorsModal();
        this.setupActionButtons();
        this.setupClickOutside();
        this.setupIndicatorLeftNav();

        // ── Listen for config from backend ──
        document.addEventListener('available-config-received', this.boundAvailableConfig);

        this.isInitialized = true;
    }

    // ================================================================
    // AVAILABLE CONFIG — merge incoming into existing config
    // Two pushes arrive: chart config first, symbols after MT5 connects
    // ================================================================

    private handleAvailableConfig(e: Event): void {
        const incoming = (e as CustomEvent).detail as AvailableConfig;
        if (!incoming) return;

        if (!this.config) {
            this.config = {
                symbols:            [],
                timeframes_visible: [],
                timeframes_more:    [],
                indicators:         [],
                strategies:         [],
                patterns:           []
            };
        }

        if (incoming.symbols?.length)            this.config.symbols            = incoming.symbols;
        if (incoming.timeframes_visible?.length) this.config.timeframes_visible = incoming.timeframes_visible;
        if (incoming.timeframes_more?.length)    this.config.timeframes_more    = incoming.timeframes_more;
        
        if (incoming.indicators?.length) {
            this.config.indicators = incoming.indicators.map(i => ({
                key:           i.key,
                label:         i.label,
                description:   i.description,
                badge:         i.badge,
                type:          i.type          ?? '',
                is_strategy:   i.is_strategy   ?? false,
                period:        i.period        ?? 0,
                fast_period:   i.fast_period   ?? 0,
                slow_period:   i.slow_period   ?? 0,
                signal_period: i.signal_period ?? 0,
                k_period:      i.k_period      ?? 0,
                d_period:      i.d_period      ?? 0,
                slowing:       i.slowing       ?? 0,
                deviation:     i.deviation     ?? 0.0,
                overbought:    i.overbought    ?? 0,
                oversold:      i.oversold      ?? 0,
                volume:        i.volume        ?? 0.0,
                price_type:    i.price_type    ?? 'close'
            }));
        }
        
        if (incoming.strategies?.length) {
            this.config.strategies = incoming.strategies.map(i => ({
                key:           i.key,
                label:         i.label,
                description:   i.description,
                badge:         i.badge,
                type:          i.type          ?? '',
                is_strategy:   i.is_strategy   ?? false,
                period:        i.period        ?? 0,
                fast_period:   i.fast_period   ?? 0,
                slow_period:   i.slow_period   ?? 0,
                signal_period: i.signal_period ?? 0,
                k_period:      i.k_period      ?? 0,
                d_period:      i.d_period      ?? 0,
                slowing:       i.slowing       ?? 0,
                deviation:     i.deviation     ?? 0.0,
                overbought:    i.overbought    ?? 0,
                oversold:      i.oversold      ?? 0,
                volume:        i.volume        ?? 0.0,
                price_type:    i.price_type    ?? 'close'
            }));
        }
        
        if (incoming.patterns?.length) {
            this.config.patterns = incoming.patterns.map(i => ({
                key:           i.key,
                label:         i.label,
                description:   i.description,
                badge:         i.badge,
                type:          i.type          ?? '',
                is_strategy:   i.is_strategy   ?? false,
                period:        i.period        ?? 0,
                fast_period:   i.fast_period   ?? 0,
                slow_period:   i.slow_period   ?? 0,
                signal_period: i.signal_period ?? 0,
                k_period:      i.k_period      ?? 0,
                d_period:      i.d_period      ?? 0,
                slowing:       i.slowing       ?? 0,
                deviation:     i.deviation     ?? 0.0,
                overbought:    i.overbought    ?? 0,
                oversold:      i.oversold      ?? 0,
                volume:        i.volume        ?? 0.0,
                price_type:    i.price_type    ?? 'close'
            }));
        }

        this.renderTimeframes();
        this.renderSymbolRows();
        this.renderIndicatorRows();
        this.updateIndicatorCounts();
    }

    // ================================================================
    // RENDER TIMEFRAMES — inject from config
    // ================================================================

    private renderTimeframes(): void {
        if (!this.config) return;

        const tfGroup        = document.getElementById('tfGroup');
        const tfMoreDropdown = document.getElementById('tfMoreDropdown');
        const tfMore         = document.getElementById('tfMore');

        if (!tfGroup) return;

        Array.from(tfGroup.children).forEach(child => {
            if ((child as HTMLElement).id !== 'tfMore') {
                tfGroup.removeChild(child);
            }
        });

        this.config.timeframes_visible.forEach(tf => {
            const btn = document.createElement('button');
            btn.className   = 'tf-btn';
            btn.dataset.tf  = tf;
            btn.textContent = tf;
            if (tf === this.currentTimeframe) btn.classList.add('active');
            tfGroup.insertBefore(btn, tfMore);
        });

        if (tfMoreDropdown) {
            tfMoreDropdown.innerHTML = '';
            this.config.timeframes_more.forEach(tf => {
                const item = document.createElement('div');
                item.className   = 'tf-more-item';
                item.dataset.tf  = tf;
                item.textContent = tf;
                if (tf === this.currentTimeframe) item.classList.add('active');
                tfMoreDropdown.appendChild(item);
            });
        }
    }

    // ================================================================
    // RENDER SYMBOL ROWS — inject from config
    // ================================================================

    private renderSymbolRows(): void {
        if (!this.config) return;

        const modalBody = document.getElementById('symbolModalBody');
        if (!modalBody) return;

        const emptyFav    = document.getElementById('symbolEmptyFavorites');
        const emptySearch = document.getElementById('symbolEmptySearch');

        modalBody.querySelectorAll('.symbol-modal-row').forEach(el => el.remove());

        const favorites = this.loadSymbolFavorites();

        this.config.symbols.forEach(sym => {
            const row = this.createSymbolRow(sym, favorites.includes(sym.name));
            modalBody.insertBefore(row, emptyFav);
        });

        this.filterByCategory(this.activeCategory);
    }

    private createSymbolRow(sym: ConfigSymbol, isStarred: boolean): HTMLElement {
        const row = document.createElement('div');
        row.className     = 'symbol-modal-row';
        row.dataset.value = sym.name;
        row.dataset.desc  = sym.description;

        if (sym.name === this.currentSymbol) row.classList.add('active');

        const flagStack = this.buildFlagStack(sym.name);
        const starClass = isStarred ? 'symbol-star-btn active' : 'symbol-star-btn';

        row.innerHTML = `
            <div class="symbol-modal-name">
                ${flagStack}
                <span>${sym.name}</span>
            </div>
            <div class="symbol-modal-desc">${sym.description}</div>
            <button class="${starClass}" data-value="${sym.name}">
                <i class="fas fa-star"></i>
            </button>
        `;

        return row;
    }

    private buildFlagStack(symbol: string): string {
        const lookup = stripBrokerSuffix(symbol);
        const config = symbolIconMap[lookup];

        if (!config) {
            return `<div class="symbol-flag-stack">
                <div class="flag-circle flag-base" style="background:#444"></div>
            </div>`;
        }

        const baseHtml = config.baseType === 'flag'
            ? `<div class="flag-circle flag-base" style="background-image:url('${config.base}')"></div>`
            : `<div class="flag-circle flag-base icon-circle ${config.base}">${iconCircleMap[config.base] || ''}</div>`;

        const quoteHtml = config.quoteType === 'flag'
            ? `<div class="flag-circle flag-quote" style="background-image:url('${config.quote}')"></div>`
            : `<div class="flag-circle flag-quote icon-circle ${config.quote}">${iconCircleMap[config.quote] || ''}</div>`;

        return `<div class="symbol-flag-stack">${baseHtml}${quoteHtml}</div>`;
    }

    // ================================================================
    // RENDER INDICATOR ROWS — inject from config
    // ================================================================

    private renderIndicatorRows(): void {
        if (!this.config) return;
        this.renderIndCategory(this.activeIndCat);
    }

    private renderIndCategory(cat: string): void {
        if (!this.config) return;

        const list = document.getElementById('indicatorsRightList');
        if (!list) return;

        const label = document.getElementById('indicatorsRightLabel');

        list.querySelectorAll('.ind-row').forEach(el => el.remove());

        const favorites = this.loadFavorites();

        const labelMap: Record<string, string> = {
            favorites:  '⭐ Favorites',
            indicators: '📈 Indicators',
            strategies: '🤖 Strategies',
            patterns:   '🔷 Patterns',
        };

        if (label) label.textContent = labelMap[cat] || cat;

        if (cat === 'favorites') {
            const allItems = [
                ...this.config.indicators.map(i => ({ ...i, type: 'indicator' })),
                ...this.config.strategies.map(i => ({ ...i, type: 'strategy' })),
                ...this.config.patterns.map(i  => ({ ...i, type: 'pattern'  })),
            ];

            const favItems = allItems.filter(i => favorites.includes(i.key));

            if (favItems.length === 0) {
                document.getElementById('indEmptyFavorites')?.style.setProperty('display', 'flex');
                return;
            }

            document.getElementById('indEmptyFavorites')?.style.setProperty('display', 'none');
            favItems.forEach(item => {
                list.appendChild(this.createIndRow(item, item.type, true));
            });
            return;
        }

        document.getElementById('indEmptyFavorites')?.style.setProperty('display', 'none');

        let items: ConfigItem[] = [];
        if (cat === 'indicators') items = this.config.indicators;
        if (cat === 'strategies') items = this.config.strategies;
        if (cat === 'patterns')   items = this.config.patterns;

        items.forEach(item => {
            const isStarred = favorites.includes(item.key);
            list.appendChild(this.createIndRow(
                item,
                cat === 'indicators' ? 'indicator' : cat.slice(0, -1),
                isStarred
            ));
        });
    }

    private createIndRow(item: ConfigItem, type: string, isStarred: boolean): HTMLElement {
        const row = document.createElement('div');
        row.className     = 'ind-row';
        row.dataset.value = item.key;
        row.dataset.type  = type;
        row.dataset.name  = item.label;

        const starClass  = isStarred ? 'ind-star-btn active' : 'ind-star-btn';
        const badgeClass = `ind-badge ${item.badge}`;

        row.innerHTML = `
            <div class="ind-row-icon">
                <i class="fas fa-chart-line"></i>
            </div>
            <div class="ind-row-info">
                <div class="ind-row-name">${item.label}</div>
                <div class="ind-row-desc">${item.description}</div>
            </div>
            <span class="${badgeClass}">${item.badge}</span>
            <button class="${starClass}" data-value="${item.key}" data-name="${item.label}">
                <i class="fas fa-star"></i>
            </button>
        `;

        return row;
    }

    // ================================================================
    // INDICATOR LEFT NAV
    // ================================================================

    private setupIndicatorLeftNav(): void {
        const nav = document.getElementById('indicatorsLeftNav');
        if (!nav) return;

        nav.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;
            const item   = target.closest('.ind-nav-item') as HTMLElement;
            if (!item) return;

            const cat = item.dataset.cat;
            if (!cat) return;

            nav.querySelectorAll('.ind-nav-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            this.activeIndCat = cat;
            this.renderIndCategory(cat);
        });
    }

    // ================================================================
    // UPDATE INDICATOR COUNTS
    // ================================================================

    private updateIndicatorCounts(): void {
        if (!this.config) return;

        const favorites = this.loadFavorites();

        const allItems = [
            ...this.config.indicators,
            ...this.config.strategies,
            ...this.config.patterns,
        ];

        const favCount = allItems.filter(i => favorites.includes(i.key)).length;

        const countMap: Record<string, number> = {
            favorites:  favCount,
            indicators: this.config.indicators.length,
            strategies: this.config.strategies.length,
            patterns:   this.config.patterns.length,
        };

        Object.entries(countMap).forEach(([cat, count]) => {
            const el = document.getElementById(`ind-count-${cat}`);
            if (el) el.textContent = String(count);
        });
    }

    // ================================================================
    // SYMBOL CONTROLS
    // ================================================================

    private setupSymbolControls(): void {
        const symbolPill   = document.getElementById('symbolPill');
        const hiddenSelect = document.getElementById('chartPairsSelect') as HTMLSelectElement;

        if (!symbolPill || !hiddenSelect) return;

        this.updateSymbolPill(this.currentSymbol);
        hiddenSelect.value = this.currentSymbol;

        symbolPill.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            this.openSymbolModal();
        });

        hiddenSelect.addEventListener('change', (e: Event) => {
            const newSymbol = (e.target as HTMLSelectElement).value;
            if (newSymbol !== this.currentSymbol) {
                this.currentSymbol = newSymbol;
                this.updateSymbolPill(newSymbol);
                this.callbacks.onSymbolChange(newSymbol);
            }
        });

        this.setupSymbolModal();
    }

    // ================================================================
    // SYMBOL MODAL
    // ================================================================

    private setupSymbolModal(): void {
        const overlay        = document.getElementById('symbolModalOverlay');
        const closeBtn       = document.getElementById('symbolModalClose');
        const searchInput    = document.getElementById('symbolSearchInput') as HTMLInputElement;
        const hiddenSelect   = document.getElementById('chartPairsSelect') as HTMLSelectElement;
        const categorySelect = document.getElementById('symbolCategorySelect') as HTMLSelectElement;

        if (!overlay) return;

        if (closeBtn) {
            closeBtn.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                this.closeSymbolModal();
            });
        }

        document.addEventListener('click', this.boundSymbolModalClose);

        if (categorySelect) {
            categorySelect.addEventListener('change', (e: Event) => {
                const cat = (e.target as HTMLSelectElement).value;
                this.activeCategory = cat;
                this.filterByCategory(cat);
            });
        }

        // ── Search — local only, no backend requests ──
        if (searchInput) {
            searchInput.addEventListener('input', (e: Event) => {
                const query = (e.target as HTMLInputElement).value;
                this.handleSymbolSearch(query);
            });
            searchInput.addEventListener('click', (e: Event) => e.stopPropagation());
        }

        const modalBody = document.getElementById('symbolModalBody');
        if (modalBody) {
            modalBody.addEventListener('click', (e: Event) => {
                const target = e.target as HTMLElement;

                const starBtn = target.closest('.symbol-star-btn') as HTMLElement;
                if (starBtn) {
                    e.stopPropagation();
                    const value = starBtn.dataset.value;
                    if (value) this.toggleSymbolFavorite(value, starBtn);
                    return;
                }

                const row = target.closest('.symbol-modal-row') as HTMLElement;
                if (!row) return;

                const value = row.dataset.value;
                if (!value) return;

                modalBody.querySelectorAll('.symbol-modal-row').forEach(el => el.classList.remove('active'));
                row.classList.add('active');

                this.updateSymbolPill(value);
                if (hiddenSelect) hiddenSelect.value = value;
                this.closeSymbolModal();

                this.currentSymbol = value;
                this.callbacks.onSymbolChange(value);
            });
        }
    }

    // ── Local search only — no backend requests ──
    private handleSymbolSearch(query: string): void {
        const trimmed = query.trim();

        if (trimmed === '') {
            this.filterByCategory(this.activeCategory);
            const emptySearch = document.getElementById('symbolEmptySearch');
            if (emptySearch) emptySearch.style.display = 'none';
            return;
        }

        this.filterSymbolModal(trimmed.toLowerCase());
    }

    private openSymbolModal(): void {
        const overlay     = document.getElementById('symbolModalOverlay');
        const searchInput = document.getElementById('symbolSearchInput') as HTMLInputElement;
        if (!overlay) return;

        overlay.classList.add('open');
        this.filterByCategory(this.activeCategory);

        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 50);
        }

        const modalBody = document.getElementById('symbolModalBody');
        if (modalBody) {
            modalBody.querySelectorAll('.symbol-modal-row').forEach(el => {
                el.classList.toggle('active', (el as HTMLElement).dataset.value === this.currentSymbol);
            });
        }
    }

    private closeSymbolModal(): void {
        const overlay = document.getElementById('symbolModalOverlay');
        if (overlay) overlay.classList.remove('open');

        // ── Reset search ──
        const searchInput = document.getElementById('symbolSearchInput') as HTMLInputElement;
        if (searchInput) searchInput.value = '';
        const emptySearch = document.getElementById('symbolEmptySearch');
        if (emptySearch) emptySearch.style.display = 'none';
        this.filterByCategory(this.activeCategory);
    }

    private handleSymbolModalClickOutside(e: Event): void {
        const overlay = document.getElementById('symbolModalOverlay');
        if (!overlay || !overlay.classList.contains('open')) return;
        const modal      = document.getElementById('symbolModal');
        const symbolPill = document.getElementById('symbolPill');
        if (modal && !modal.contains(e.target as Node) && e.target !== symbolPill) {
            this.closeSymbolModal();
        }
    }

    // ================================================================
    // CATEGORY FILTER — frontend only
    // ================================================================

    private filterByCategory(cat: string): void {
        const modalBody   = document.getElementById('symbolModalBody');
        const emptyFav    = document.getElementById('symbolEmptyFavorites');
        const emptySearch = document.getElementById('symbolEmptySearch');
        if (!modalBody) return;

        const favorites  = this.loadSymbolFavorites();
        const catSymbols = categoryMap[cat] || null;

        let visibleCount = 0;

        modalBody.querySelectorAll('.symbol-modal-row').forEach(el => {
            const row   = el as HTMLElement;
            const value = row.dataset.value || '';
            const clean = stripBrokerSuffix(value);

            let show = false;

            if (cat === 'favorites') {
                show = favorites.includes(value);
            } else if (cat === 'all') {
                show = true;
            } else if (catSymbols) {
                show = catSymbols.includes(value) || catSymbols.includes(clean);
            } else {
                show = true;
            }

            row.style.display = show ? '' : 'none';
            if (show) visibleCount++;
        });

        if (emptyFav) {
            emptyFav.style.display =
                cat === 'favorites' && visibleCount === 0 ? 'flex' : 'none';
        }
        if (emptySearch) emptySearch.style.display = 'none';
    }

    private filterSymbolModal(query: string): void {
        const modalBody   = document.getElementById('symbolModalBody');
        const emptySearch = document.getElementById('symbolEmptySearch');
        if (!modalBody) return;

        let totalVisible = 0;

        modalBody.querySelectorAll('.symbol-modal-row').forEach(el => {
            const row   = el as HTMLElement;
            const name  = (row.dataset.value || '').toLowerCase();
            const desc  = (row.dataset.desc  || '').toLowerCase();
            const match = name.includes(query) || desc.includes(query);
            row.style.display = match ? '' : 'none';
            if (match) totalVisible++;
        });

        if (emptySearch) {
            emptySearch.style.display =
                totalVisible === 0 && query !== '' ? 'block' : 'none';
        }
    }

    // ================================================================
    // SYMBOL FAVORITES
    // ================================================================

    private loadSymbolFavorites(): string[] {
        try {
            return JSON.parse(localStorage.getItem(SYMBOL_FAVORITES_KEY) || '[]');
        } catch { return []; }
    }

    private saveSymbolFavorites(favs: string[]): void {
        localStorage.setItem(SYMBOL_FAVORITES_KEY, JSON.stringify(favs));
    }

    private toggleSymbolFavorite(value: string, starEl: HTMLElement): void {
        const favs  = this.loadSymbolFavorites();
        const index = favs.indexOf(value);

        if (index === -1) {
            favs.push(value);
            starEl.classList.add('active');
        } else {
            favs.splice(index, 1);
            starEl.classList.remove('active');
        }

        this.saveSymbolFavorites(favs);

        document.querySelectorAll(`.symbol-star-btn[data-value="${value}"]`).forEach(btn => {
            btn.classList.toggle('active', favs.includes(value));
        });
    }

    // ================================================================
    // SYMBOL PILL UPDATE
    // ================================================================

    private updateSymbolPill(symbol: string): void {
        const symbolText = document.getElementById('symbolText');
        if (symbolText) symbolText.textContent = symbol;
        this.updateSymbolFlags(symbol);
    }

    private updateSymbolFlags(symbol: string): void {
        const baseEl  = document.getElementById('symbolFlagBase');
        const quoteEl = document.getElementById('symbolFlagQuote');
        if (!baseEl || !quoteEl) return;

        const lookup = stripBrokerSuffix(symbol);
        const config = symbolIconMap[lookup];
        if (!config) return;

        if (config.baseType === 'flag') {
            baseEl.className             = 'flag-circle flag-base';
            baseEl.style.backgroundImage = `url('${config.base}')`;
            baseEl.innerHTML             = '';
        } else {
            baseEl.className             = `flag-circle flag-base icon-circle ${config.base}`;
            baseEl.style.backgroundImage = '';
            baseEl.innerHTML             = iconCircleMap[config.base] || '';
        }

        if (config.quoteType === 'flag') {
            quoteEl.className             = 'flag-circle flag-quote';
            quoteEl.style.backgroundImage = `url('${config.quote}')`;
            quoteEl.innerHTML             = '';
        } else {
            quoteEl.className             = `flag-circle flag-quote icon-circle ${config.quote}`;
            quoteEl.style.backgroundImage = '';
            quoteEl.innerHTML             = iconCircleMap[config.quote] || '';
        }
    }

    // ================================================================
    // TIMEFRAME CONTROLS
    // ================================================================

    private setupTimeframeControls(): void {
        const tfGroup        = document.getElementById('tfGroup');
        const tfMoreBtn      = document.getElementById('tfMoreBtn');
        const tfMore         = document.getElementById('tfMore');
        const tfMoreDropdown = document.getElementById('tfMoreDropdown');
        const hiddenSelect   = document.getElementById('timeframeSelect') as HTMLSelectElement;

        if (!tfGroup || !hiddenSelect) return;

        hiddenSelect.value = this.currentTimeframe;
        this.updateTimeframeButtons(this.currentTimeframe);

        tfGroup.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;
            const btn    = target.closest('.tf-btn:not(.tf-more-btn)') as HTMLElement;
            if (!btn) return;

            const tf = btn.dataset.tf;
            if (!tf) return;

            this.closeAllDropdowns();
            this.updateTimeframeButtons(tf);
            hiddenSelect.value    = tf;
            this.currentTimeframe = tf;
            this.callbacks.onTimeframeChange(tf);
        });

        if (tfMoreBtn && tfMore) {
            tfMoreBtn.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                const isOpen = tfMore.classList.contains('open');
                this.closeAllDropdowns();
                if (!isOpen) tfMore.classList.add('open');
            });
        }

        if (tfMoreDropdown) {
            tfMoreDropdown.addEventListener('click', (e: Event) => {
                const target = e.target as HTMLElement;
                const item   = target.closest('.tf-more-item') as HTMLElement;
                if (!item) return;

                const tf = item.dataset.tf;
                if (!tf) return;

                this.closeAllDropdowns();
                this.updateTimeframeButtons(tf);
                hiddenSelect.value    = tf;
                this.currentTimeframe = tf;
                this.callbacks.onTimeframeChange(tf);
            });
        }

        hiddenSelect.addEventListener('change', (e: Event) => {
            const newTf = (e.target as HTMLSelectElement).value;
            if (newTf !== this.currentTimeframe) {
                this.currentTimeframe = newTf;
                this.updateTimeframeButtons(newTf);
                this.callbacks.onTimeframeChange(newTf);
            }
        });
    }

    private updateTimeframeButtons(timeframe: string): void {
        document.querySelectorAll('.tf-btn:not(.tf-more-btn)').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tf-more-item').forEach(item => item.classList.remove('active'));

        const matchingBtn = document.querySelector(`.tf-btn[data-tf="${timeframe}"]`) as HTMLElement;
        if (matchingBtn) {
            matchingBtn.classList.add('active');
            return;
        }

        const matchingMoreItem = document.querySelector(`.tf-more-item[data-tf="${timeframe}"]`) as HTMLElement;
        if (matchingMoreItem) {
            matchingMoreItem.classList.add('active');
            const tfMoreBtn = document.getElementById('tfMoreBtn');
            if (tfMoreBtn) tfMoreBtn.classList.add('active');
        }
    }

    // ================================================================
    // CHART TYPE CONTROLS
    // ================================================================

    private setupChartTypeControls(): void {
        const chartTypePill     = document.getElementById('chartTypePill');
        const chartTypeDropdown = document.getElementById('chartTypeDropdown');
        const hiddenSelect      = document.getElementById('chartTypeSelect') as HTMLSelectElement;

        if (!chartTypePill || !hiddenSelect) return;

        hiddenSelect.value = this.currentChartType;
        this.updateChartTypePill(this.currentChartType);

        chartTypePill.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            const isOpen = chartTypePill.classList.contains('open');
            this.closeAllDropdowns();
            if (!isOpen) chartTypePill.classList.add('open');
        });

        if (chartTypeDropdown) {
            chartTypeDropdown.addEventListener('click', (e: Event) => {
                const target = e.target as HTMLElement;
                const item   = target.closest('.chart-type-item') as HTMLElement;
                if (!item) return;

                const type  = item.dataset.type;
                const icon  = item.dataset.icon;
                const label = item.dataset.label;
                if (!type) return;

                chartTypeDropdown.querySelectorAll('.chart-type-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');

                this.updateChartTypePill(type, icon, label);
                hiddenSelect.value = type;
                chartTypePill.classList.remove('open');

                this.currentChartType = type;
                this.callbacks.onChartTypeChange(type);
            });
        }

        hiddenSelect.addEventListener('change', (e: Event) => {
            const newType = (e.target as HTMLSelectElement).value;
            if (newType !== this.currentChartType) {
                this.currentChartType = newType;
                this.updateChartTypePill(newType);
                this.callbacks.onChartTypeChange(newType);
            }
        });
    }

    private updateChartTypePill(type: string, icon?: string, label?: string): void {
        const chartTypeIcon = document.getElementById('chartTypeIcon');
        const chartTypeText = document.getElementById('chartTypeText');

        const typeMap: Record<string, { icon: string; label: string }> = {
            'candlestick': { icon: 'fa-chart-candlestick', label: 'Candles'  },
            'bar':         { icon: 'fa-chart-bar',         label: 'Bars'     },
            'line':        { icon: 'fa-chart-line',        label: 'Line'     },
            'area':        { icon: 'fa-chart-area',        label: 'Area'     },
            'baseline':    { icon: 'fa-minus',             label: 'Baseline' }
        };

        const mapped     = typeMap[type] || typeMap['candlestick'];
        const finalIcon  = icon  || mapped.icon;
        const finalLabel = label || mapped.label;

        if (chartTypeIcon) chartTypeIcon.className = `fas ${finalIcon} chart-type-icon`;
        if (chartTypeText) chartTypeText.textContent = finalLabel;

        document.querySelectorAll('.chart-type-item').forEach(item => {
            item.classList.toggle('active', (item as HTMLElement).dataset.type === type);
        });
    }

    // ================================================================
    // INDICATORS MODAL
    // ================================================================

    private setupIndicatorsModal(): void {
        const indicatorsBtn = document.getElementById('indicatorsBtn');
        const overlay       = document.getElementById('indicatorsModalOverlay');
        const closeBtn      = document.getElementById('indicatorsModalClose');
        const searchInput   = document.getElementById('indicatorSearchInput') as HTMLInputElement;

        if (!indicatorsBtn || !overlay) return;

        indicatorsBtn.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            this.closeAllDropdowns();
            overlay.classList.add('open');
            this.activeIndCat = 'favorites';
            this.setActiveIndNav('favorites');
            this.renderIndCategory('favorites');
            this.updateIndicatorCounts();
            if (searchInput) {
                searchInput.value = '';
                setTimeout(() => searchInput.focus(), 50);
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                overlay.classList.remove('open');
            });
        }

        document.addEventListener('click', this.boundIndicatorClose);

        if (searchInput) {
            searchInput.addEventListener('input', (e: Event) => {
                const query = (e.target as HTMLInputElement).value.toLowerCase();
                this.filterIndicators(query);
            });
        }

        const list = document.getElementById('indicatorsRightList');
        if (list) {
            list.addEventListener('click', (e: Event) => {
                const target = e.target as HTMLElement;

                const starBtn = target.closest('.ind-star-btn') as HTMLElement;
                if (starBtn) {
                    e.stopPropagation();
                    const value = starBtn.dataset.value;
                    const name  = starBtn.dataset.name;
                    if (value && name) this.toggleFavorite(value, name, starBtn);
                    return;
                }

                const row = target.closest('.ind-row') as HTMLElement;
                if (!row) return;

                const value = row.dataset.value;
                const type  = row.dataset.type;
                if (!value) return;

                if (type === 'strategy') {
                    this.deployStrategyFromModal(value);
                } else {
                    document.dispatchEvent(new CustomEvent('add-indicator', {
                        detail: { type: value }
                    }));
                }

                overlay.classList.remove('open');
            });
        }

        const applyBtn = document.getElementById('indicatorsApplyBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                overlay.classList.remove('open');
            });
        }

        const customStrategyBtn = document.getElementById('indicatorsCreateBtn');
        if (customStrategyBtn) {
            customStrategyBtn.addEventListener('click', () => {
                overlay.classList.remove('open');
                document.dispatchEvent(new CustomEvent('open-strategy-tab'));
            });
        }
    }

    private setActiveIndNav(cat: string): void {
        const nav = document.getElementById('indicatorsLeftNav');
        if (!nav) return;
        nav.querySelectorAll('.ind-nav-item').forEach(el => {
            el.classList.toggle('active', (el as HTMLElement).dataset.cat === cat);
        });
    }

    // ================================================================
    // INDICATOR FAVORITES
    // ================================================================

    private loadFavorites(): string[] {
        try {
            return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
        } catch { return []; }
    }

    private saveFavorites(favorites: string[]): void {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }

    private toggleFavorite(value: string, name: string, starEl: HTMLElement): void {
        const favorites = this.loadFavorites();
        const index     = favorites.indexOf(value);

        if (index === -1) {
            favorites.push(value);
            starEl.classList.add('active');
        } else {
            favorites.splice(index, 1);
            starEl.classList.remove('active');
        }

        this.saveFavorites(favorites);
        this.updateIndicatorCounts();
    }

    // ================================================================
    // FILTER INDICATORS
    // ================================================================

    private filterIndicators(query: string): void {
        const list        = document.getElementById('indicatorsRightList');
        const emptySearch = document.getElementById('indEmptySearch');
        if (!list) return;

        let totalVisible = 0;

        list.querySelectorAll('.ind-row').forEach(el => {
            const text  = el.textContent?.toLowerCase() || '';
            const match = query === '' || text.includes(query);
            (el as HTMLElement).style.display = match ? '' : 'none';
            if (match) totalVisible++;
        });

        if (emptySearch) {
            emptySearch.style.display =
                totalVisible === 0 && query !== '' ? 'block' : 'none';
        }
    }

    // ================================================================
    // STRATEGY DEPLOY
    // ================================================================

    private deployStrategyFromModal(key: string): void {
        if (!this.config) {
            document.dispatchEvent(new CustomEvent('show-notification', {
                detail: { type: 'error', title: 'Strategy Error', message: 'Config not loaded yet' }
            }));
            return;
        }

        const strategy = this.config.strategies.find(s => s.key === key);

        if (!strategy) {
            document.dispatchEvent(new CustomEvent('show-notification', {
                detail: { type: 'error', title: 'Strategy Error', message: `Unknown strategy: ${key}` }
            }));
            return;
        }

        document.dispatchEvent(new CustomEvent('deploy-strategy', {
            detail: {
                strategyType: key.toLowerCase(),
                symbol:       this.currentSymbol,
                timeframe:    this.currentTimeframe,
                params:       {}
            }
        }));
    }

    // ================================================================
    // CLICK OUTSIDE
    // ================================================================

    private handleIndicatorClickOutside(e: Event): void {
        const overlay       = document.getElementById('indicatorsModalOverlay');
        const indicatorsBtn = document.getElementById('indicatorsBtn');
        if (!overlay || !overlay.classList.contains('open')) return;
        const modal = overlay.querySelector('.indicators-modal') as HTMLElement;
        if (modal && !modal.contains(e.target as Node) && e.target !== indicatorsBtn) {
            overlay.classList.remove('open');
        }
    }

    private setupClickOutside(): void {
        document.addEventListener('click', this.boundClickOutside);
    }

    private closeAllDropdowns(): void {
        document.getElementById('symbolPill')?.classList.remove('open');
        document.getElementById('chartTypePill')?.classList.remove('open');
        document.getElementById('tfMore')?.classList.remove('open');
    }

    // ================================================================
    // ACTION BUTTONS
    // ================================================================

    private setupActionButtons(): void {
        const resetBtn = document.getElementById('resetChartBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('chart-reset-request'));
            });
        }

        const downloadBtn = document.getElementById('downloadChartBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('chart-download-request'));
            });
        }
    }

    // ================================================================
    // PUBLIC UPDATE METHODS
    // ================================================================

    public updateSymbol(symbol: string): void {
        this.currentSymbol = symbol;
        const select = document.getElementById('chartPairsSelect') as HTMLSelectElement;
        if (select && select.value !== symbol) select.value = symbol;
        this.updateSymbolPill(symbol);
    }

    public updateTimeframe(timeframe: string): void {
        this.currentTimeframe = timeframe;
        const select = document.getElementById('timeframeSelect') as HTMLSelectElement;
        if (select && select.value !== timeframe) select.value = timeframe;
        this.updateTimeframeButtons(timeframe);
    }

    public updateChartType(chartType: string): void {
        this.currentChartType = chartType;
        const select = document.getElementById('chartTypeSelect') as HTMLSelectElement;
        if (select && select.value !== chartType) select.value = chartType;
        this.updateChartTypePill(chartType);
    }

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        document.removeEventListener('click', this.boundClickOutside);
        document.removeEventListener('click', this.boundIndicatorClose);
        document.removeEventListener('click', this.boundSymbolModalClose);
        document.removeEventListener('available-config-received', this.boundAvailableConfig);
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.isInitialized = false;
    }
}
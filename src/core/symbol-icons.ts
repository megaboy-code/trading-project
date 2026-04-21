// ================================================================
// 🌐 SYMBOL ICONS — Shared icon/flag utility
// Used by: chart-ui.ts, watchlist-module.ts
// Flags: flagcdn.com | Crypto: jsdelivr cryptocurrency-icons
// ================================================================

// ================================================================
// SYMBOL ICON MAP — flag/icon URLs per symbol
// ================================================================

export const symbolIconMap: Record<string, {
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
    'GBPJPY': { base: 'https://flagcdn.com/w320/gb.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
    'EURJPY': { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/jp.png', baseType: 'flag', quoteType: 'flag' },
    'EURGBP': { base: 'https://flagcdn.com/w320/eu.png', quote: 'https://flagcdn.com/w320/gb.png', baseType: 'flag', quoteType: 'flag' },
    'USDCNH': { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/cn.png', baseType: 'flag', quoteType: 'flag' },
    'US30':   { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
    'US500':  { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
    'NAS100': { base: 'https://flagcdn.com/w320/us.png', quote: 'https://flagcdn.com/w320/us.png', baseType: 'flag', quoteType: 'flag' },
    'GER40':  { base: 'https://flagcdn.com/w320/de.png', quote: 'https://flagcdn.com/w320/de.png', baseType: 'flag', quoteType: 'flag' },
    'UK100':  { base: 'https://flagcdn.com/w320/gb.png', quote: 'https://flagcdn.com/w320/gb.png', baseType: 'flag', quoteType: 'flag' },
    'XAUUSD': { base: 'xau', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'XAGUSD': { base: 'xag', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'USOIL':  { base: 'oil', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'BTCUSD': { base: 'btc', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'ETHUSD': { base: 'eth', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'LTCUSD': { base: 'ltc', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'XRPUSD': { base: 'xrp', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
    'SOLUSD': { base: 'sol', quote: 'https://flagcdn.com/w320/us.png', baseType: 'icon', quoteType: 'flag' },
};

// ================================================================
// CRYPTO LOGO MAP — real images from jsdelivr
// ================================================================

export const cryptoLogoMap: Record<string, string> = {
    'btc': 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/btc.png',
    'eth': 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png',
    'ltc': 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/ltc.png',
    'xrp': 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/xrp.png',
    'sol': 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png',
};

// ================================================================
// METAL ICON MAP — FA icon + color for metals/commodities
// ================================================================

export const metalIconMap: Record<string, { icon: string; color: string; bg: string; border: string }> = {
    'xau': { icon: 'fas fa-coins',    color: '#C9A227', bg: 'rgba(201,162,39,0.15)', border: 'rgba(201,162,39,0.4)' },
    'xag': { icon: 'fas fa-coins',    color: '#C0C0C0', bg: 'rgba(192,192,192,0.15)', border: 'rgba(192,192,192,0.4)' },
    'oil': { icon: 'fas fa-oil-well', color: '#8B6914', bg: 'rgba(139,105,20,0.15)',  border: 'rgba(139,105,20,0.4)'  },
};

// ================================================================
// STRIP BROKER SUFFIX — shared utility
// Removes broker suffixes like .m, m, c, /
// ================================================================

export function stripBrokerSuffix(symbol: string): string {
    return symbol
        .toUpperCase()
        .replace('/', '')
        .replace(/\.[A-Z0-9]+$/, '')
        .replace(/[MC]$/, '');
}

// ================================================================
// BUILD FLAG STACK — returns HTML string
// Used by: chart-ui.ts (innerHTML context)
// Forex: two overlapping circles | Icon: single circle only
// ================================================================

export function buildFlagStack(symbol: string): string {
    const lookup = stripBrokerSuffix(symbol);
    const config = symbolIconMap[lookup];

    if (!config) {
        return `<div class="wl-symbol-icon-wrap">
            <div class="wl-symbol-icon"></div>
        </div>`;
    }

    // ── Icon type (crypto / metal) — single circle only ──
    if (config.baseType === 'icon') {
        if (cryptoLogoMap[config.base]) {
            return `<div class="wl-symbol-icon-wrap">
                <div class="wl-symbol-icon">
                    <img src="${cryptoLogoMap[config.base]}" alt="${config.base.toUpperCase()}">
                </div>
            </div>`;
        }

        const metal = metalIconMap[config.base];
        if (metal) {
            return `<div class="wl-symbol-icon-wrap">
                <div class="wl-symbol-icon" style="background:${metal.bg}; border-color:${metal.border}; color:${metal.color};">
                    <i class="${metal.icon}"></i>
                </div>
            </div>`;
        }

        return `<div class="wl-symbol-icon-wrap">
            <div class="wl-symbol-icon"></div>
        </div>`;
    }

    // ── Both flags — overlapping pair ──
    return `<div class="wl-flag-container">
        <div class="wl-flag-circle wl-flag-base"  style="background-image:url('${config.base}')"></div>
        <div class="wl-flag-circle wl-flag-quote" style="background-image:url('${config.quote}')"></div>
    </div>`;
}

// ================================================================
// BUILD ICON ELEMENT — returns HTMLElement
// Used by: watchlist-module.ts (DOM element context)
// ================================================================

export function buildIconElement(symbolName: string): HTMLElement {
    const lookup = stripBrokerSuffix(symbolName);
    const config = symbolIconMap[lookup];

    if (!config) {
        const fallback = document.createElement('div');
        fallback.className = 'wl-flag-container';
        const circle = document.createElement('div');
        circle.className        = 'wl-flag-circle wl-flag-base';
        circle.style.background = '#444';
        fallback.appendChild(circle);
        return fallback;
    }

    // ── Both flags — overlapping pair ──
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

    // ── Icon type (crypto / metal) — single circle ──
    const wrap = document.createElement('div');
    wrap.className = 'wl-symbol-icon-wrap';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'wl-symbol-icon';

    const key = config.base;

    if (cryptoLogoMap[key]) {
        const img = document.createElement('img');
        img.src = cryptoLogoMap[key];
        img.alt = key.toUpperCase();
        iconWrap.appendChild(img);
    } else if (metalIconMap[key]) {
        const metal = metalIconMap[key];
        iconWrap.style.background   = metal.bg;
        iconWrap.style.borderColor  = metal.border;
        iconWrap.style.color        = metal.color;
        iconWrap.innerHTML          = `<i class="${metal.icon}"></i>`;
    } else {
        iconWrap.style.background = '#444';
    }

    wrap.appendChild(iconWrap);
    return wrap;
}

// ================================================================
// UPDATE SYMBOL FLAGS — updates existing DOM elements
// Used by: chart-ui.ts updateSymbolFlags()
// ================================================================

export function applySymbolFlags(
    baseEl:  HTMLElement,
    quoteEl: HTMLElement,
    symbol:  string
): void {
    const lookup = stripBrokerSuffix(symbol);
    const config = symbolIconMap[lookup];
    if (!config) return;

    // ── Base ──
    if (config.baseType === 'flag') {
        baseEl.className             = 'flag-circle flag-base';
        baseEl.style.backgroundImage = `url('${config.base}')`;
        baseEl.style.background      = '';
        baseEl.innerHTML             = '';
    } else if (cryptoLogoMap[config.base]) {
        baseEl.className             = 'flag-circle flag-base';
        baseEl.style.backgroundImage = `url('${cryptoLogoMap[config.base]}')`;
        baseEl.style.backgroundSize  = 'cover';
        baseEl.innerHTML             = '';
    } else if (metalIconMap[config.base]) {
        const metal = metalIconMap[config.base];
        baseEl.className             = 'flag-circle flag-base icon-circle';
        baseEl.style.backgroundImage = '';
        baseEl.style.background      = metal.bg;
        baseEl.style.borderColor     = metal.border;
        baseEl.style.color           = metal.color;
        baseEl.innerHTML             = `<i class="${metal.icon}"></i>`;
    }

    // ── Quote ──
    if (config.quoteType === 'flag') {
        quoteEl.className             = 'flag-circle flag-quote';
        quoteEl.style.backgroundImage = `url('${config.quote}')`;
        quoteEl.style.background      = '';
        quoteEl.innerHTML             = '';
    }
}

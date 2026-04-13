// ================================================================
// ⚡ CHART UTILITIES - Shared helpers
// ================================================================

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'LINK', 'SOL', 'BNB', 'XLM', 'DOGE', 'SHIB'];

const MAJOR_FOREX_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD',
    'NZDUSD', 'USDCAD', 'EURGBP', 'EURJPY', 'EURCHF',
    'GBPJPY', 'GBPCHF', 'CHFJPY', 'AUDJPY', 'CADJPY',
    'NZDJPY', 'AUDCAD', 'AUDCHF', 'AUDNZD', 'CADCHF',
    'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD',
    'GBPNZD', 'NZDCAD', 'NZDCHF'
];

const INDICES = ['US30', 'SPX', 'NAS', 'DJI', 'DAX', 'FTSE', 'NIKKEI', 'JPN', 'CAC', 'HSI'];

// ── Strip broker suffixes e.g. ETHUSDm → ETHUSD, EURUSD.m → EURUSD ──
function stripBrokerSuffix(symbol: string): string {
    return symbol
        .toUpperCase()
        .replace('/', '')
        .replace(/\.[A-Z0-9]+$/, '')
        .replace(/[MC]$/, '');
}

export function getDecimalPrecision(symbol: string): number {
    if (!symbol) return 5;
    const sym = stripBrokerSuffix(symbol);

    const isCrypto = CRYPTO_SYMBOLS.some(crypto => sym.includes(crypto));

    if (isCrypto) {
        if (sym.endsWith('USD') || sym.endsWith('USDT')) return 2;
        return 8;
    }

    if (MAJOR_FOREX_PAIRS.includes(sym)) return 5;
    if (sym.includes('JPY')) return 3;
    if (sym.includes('XAU') || sym.includes('GOLD')) return 2;
    if (sym.includes('XAG') || sym.includes('SILVER')) return 3;
    if (INDICES.some(index => sym.includes(index))) return 1;

    return 5;
}

export function getMinMove(symbol: string): number {
    const precision = getDecimalPrecision(symbol);
    return 1 / Math.pow(10, precision);
}

export function getPriceFormatter(symbol: string): (price: number) => string {
    const precision = getDecimalPrecision(symbol);
    return (price: number): string => {
        if (price === null || price === undefined) return '--';
        return price.toFixed(precision);
    };
}

export function createDynamicPriceFormatter(getSymbol: () => string): (price: number) => string {
    return (price: number): string => {
        if (price === null || price === undefined) return '--';
        const precision = getDecimalPrecision(getSymbol());
        return price.toFixed(precision);
    };
}

export function hexToRgba(hex: string, alpha: number): string {
    const fullHex = hex.length === 4
        ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
        : hex;

    const r = parseInt(fullHex.slice(1, 3), 16);
    const g = parseInt(fullHex.slice(3, 5), 16);
    const b = parseInt(fullHex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

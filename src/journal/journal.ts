// ===============================================================
// 📝 COMPLETE JOURNAL MODULE - Full Journal Only 
// ===============================================================

export interface Trade {
    id: number;
    date: string;
    time: string;
    pair: string;
    direction: 'LONG' | 'SHORT';
    size: string;
    pnl: number;
    entry: string;
    exit: string;
    pips: string;
    duration: string;
    notes: string;
    imageUrl: string | null;
}

export class JournalModule {
    private trades: Trade[] = [];
    private currentDisplayDate: Date = new Date();
    private selectedDate: Date = new Date();
    private isInitialized: boolean = false;
    private isDestroyed: boolean = false;
    private currentFilter: string = 'all';
    private currentTradeId: number | null = null;
    private eventListeners: Map<string, EventListener[]> = new Map();

    // DOM Elements
    private elements: any = {};

    constructor() {
        console.log("📝 Journal Module Constructed");
    }

    public mount(): void {
        if (this.isInitialized) return;
        
        this.cacheElements();
        this.loadData();
        this.renderCalendar();
        this.renderTradesTab();
        this.updateDailyTrades(this.selectedDate);
        this.setupEventHandlers();
        
        this.isInitialized = true;
        console.log("✅ Journal Module Mounted");
    }

    private cacheElements(): void {
        // Calendar elements
        this.elements.calendarTitle = document.getElementById('journal-calendar-title');
        this.elements.calendarDays = document.getElementById('journal-calendar-days');
        this.elements.selectedDateHeader = document.getElementById('journal-selected-date');
        this.elements.dailyTradesList = document.getElementById('journal-daily-trades');
        
        // Trades tab elements
        this.elements.totalTradesStat = document.getElementById('totalTradesStat');
        this.elements.winRateStat = document.getElementById('winRateStat');
        this.elements.netPnlStat = document.getElementById('netPnlStat');
        this.elements.filterDropdown = document.getElementById('journal-filter-dropdown');
        this.elements.filterStats = document.getElementById('filterStats');
        this.elements.tradesTableBody = document.getElementById('journal-filtered-trades');
        
        // Modal elements
        this.elements.modal = document.getElementById('journal-trade-modal');
        this.elements.modalHeader = document.getElementById('modalHeader');
        this.elements.modalTitle = document.getElementById('modalTitle');
        this.elements.modalEntry = document.getElementById('modalEntry');
        this.elements.modalExit = document.getElementById('modalExit');
        this.elements.modalPips = document.getElementById('modalPips');
        this.elements.modalDuration = document.getElementById('modalDuration');
        this.elements.modalSize = document.getElementById('modalSize');
        this.elements.tradeNotes = document.getElementById('tradeNotes');
        this.elements.imageSection = document.getElementById('imageSection');
        this.elements.chartImageLink = document.getElementById('chartImageLink');
        this.elements.downloadImageBtn = document.getElementById('downloadImageBtn');
        this.elements.saveNotesBtn = document.getElementById('saveNotesBtn');
        this.elements.closeModalBtn = document.getElementById('closeModalBtn');
        
        // View all button
        this.elements.viewAllBtn = document.querySelector('.journal-view-all');
    }

    private generateSampleTrades(): Trade[] {
        return [
            { 
                id: 1, date: '2025-04-08', time: '14:32', pair: 'EURUSD', direction: 'LONG', size: '0.5', pnl: 125,
                entry: '1.08500', exit: '1.08750', pips: '+25', duration: '45 min',
                notes: '✅ Strategy: Breakout above resistance. RSI confirmation. Volume spike.',
                imageUrl: 'https://via.placeholder.com/800x400?text=EURUSD+Chart'
            },
            { 
                id: 2, date: '2025-04-08', time: '13:15', pair: 'GBPUSD', direction: 'SHORT', size: '0.3', pnl: -45,
                entry: '1.27500', exit: '1.27350', pips: '-15', duration: '25 min',
                notes: '⚠️ Strategy: Short entry. Stop hit early. News spike caused reversal.',
                imageUrl: null
            },
            { 
                id: 3, date: '2025-04-07', time: '11:45', pair: 'XAUUSD', direction: 'LONG', size: '0.1', pnl: 87,
                entry: '2650.00', exit: '2658.50', pips: '+85', duration: '2 hours',
                notes: '',
                imageUrl: null
            },
            { 
                id: 4, date: '2025-04-07', time: '09:30', pair: 'USDJPY', direction: 'LONG', size: '0.4', pnl: 220,
                entry: '145.20', exit: '145.80', pips: '+60', duration: '1.5 hours',
                notes: 'Strong breakout with volume confirmation',
                imageUrl: 'https://via.placeholder.com/800x400?text=USDJPY+Chart'
            },
            { 
                id: 5, date: '2025-04-06', time: '16:20', pair: 'BTCUSD', direction: 'SHORT', size: '0.05', pnl: -32,
                entry: '68500', exit: '68700', pips: '-200', duration: '30 min',
                notes: '',
                imageUrl: null
            },
            { 
                id: 6, date: '2025-04-05', time: '10:00', pair: 'EURUSD', direction: 'LONG', size: '0.2', pnl: 55,
                entry: '1.08200', exit: '1.08350', pips: '+15', duration: '20 min',
                notes: 'Quick scalp on support bounce',
                imageUrl: null
            },
            { 
                id: 7, date: '2025-04-04', time: '15:45', pair: 'GBPUSD', direction: 'SHORT', size: '0.4', pnl: -78,
                entry: '1.27800', exit: '1.28000', pips: '-20', duration: '40 min',
                notes: 'Premature entry before news',
                imageUrl: null
            },
            { 
                id: 8, date: '2025-04-03', time: '12:30', pair: 'XAUUSD', direction: 'LONG', size: '0.15', pnl: 150,
                entry: '2640.00', exit: '2655.00', pips: '+150', duration: '3 hours',
                notes: 'Perfect trend following setup',
                imageUrl: 'https://via.placeholder.com/800x400?text=XAUUSD+Chart'
            },
            { 
                id: 9, date: '2025-03-31', time: '14:15', pair: 'EURUSD', direction: 'SHORT', size: '0.3', pnl: -25,
                entry: '1.09000', exit: '1.09100', pips: '-10', duration: '15 min',
                notes: '',
                imageUrl: null
            },
            { 
                id: 10, date: '2025-03-30', time: '11:00', pair: 'GBPUSD', direction: 'LONG', size: '0.5', pnl: 95,
                entry: '1.27000', exit: '1.27250', pips: '+25', duration: '1 hour',
                notes: 'Support bounce with divergence',
                imageUrl: null
            },
        ];
    }

    private loadData(): void {
        const saved = localStorage.getItem('megaFlowzJournal');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.trades = data.trades || this.generateSampleTrades();
            } catch (e) {
                this.trades = this.generateSampleTrades();
            }
        } else {
            this.trades = this.generateSampleTrades();
        }
    }

    private saveData(): void {
        const data = {
            trades: this.trades,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem('megaFlowzJournal', JSON.stringify(data));
    }

    // ==================== CALENDAR METHODS ====================
    
    private renderCalendar(): void {
        const year = this.currentDisplayDate.getFullYear();
        const month = this.currentDisplayDate.getMonth();
        
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                            'July', 'August', 'September', 'October', 'November', 'December'];
        if (this.elements.calendarTitle) {
            this.elements.calendarTitle.textContent = `${monthNames[month]} ${year}`;
        }
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDate = new Date(year, month, 0);
        const daysInPrevMonth = prevMonthDate.getDate();
        
        const today = new Date();
        const todayStr = this.formatDateYMD(today);
        const selectedStr = this.formatDateYMD(this.selectedDate);
        
        let calendarHTML = '';
        
        // Previous month days
        for (let i = firstDayOfMonth - 1; i >= 0; i--) {
            const prevDay = daysInPrevMonth - i;
            calendarHTML += `<div class="journal-calendar-day empty"><div class="journal-day-number">${prevDay}</div></div>`;
        }
        
        // Current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dateStr = this.formatDateYMD(dateObj);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedStr;
            const dayData = this.getDayData(dateStr);
            
            let extraClass = '';
            let statusClass = '';
            let pnlHTML = '';
            let countHTML = '';
            
            if (isToday) extraClass += ' today';
            if (isSelected) extraClass += ' selected';
            
            if (dayData) {
                if (dayData.wins > 0 && dayData.losses === 0) statusClass = ' win-day';
                else if (dayData.losses > 0 && dayData.wins === 0) statusClass = ' loss-day';
                else if (dayData.wins > 0 && dayData.losses > 0) statusClass = ' mixed-day';
                
                const pnlClass = dayData.pnl >= 0 ? 'positive' : 'negative';
                const pnlSymbol = dayData.pnl >= 0 ? '+' : '-';
                pnlHTML = `<div class="journal-day-pnl ${pnlClass}">${pnlSymbol}$${Math.abs(dayData.pnl)}</div>`;
                countHTML = `<div class="journal-day-count">${dayData.total} trade${dayData.total !== 1 ? 's' : ''}</div>`;
            }
            
            calendarHTML += `
                <div class="journal-calendar-day${extraClass}${statusClass}" data-year="${year}" data-month="${month}" data-day="${day}">
                    <div class="journal-day-number">${day}</div>
                    ${pnlHTML}
                    ${countHTML}
                </div>
            `;
        }
        
        // Next month days
        const totalCells = firstDayOfMonth + daysInMonth;
        const remainingCells = 42 - totalCells;
        for (let i = 1; i <= remainingCells; i++) {
            calendarHTML += `<div class="journal-calendar-day empty"><div class="journal-day-number">${i}</div></div>`;
        }
        
        if (this.elements.calendarDays) {
            this.elements.calendarDays.innerHTML = calendarHTML;
        }
    }
    
    private getDayData(dateStr: string): { total: number; wins: number; losses: number; pnl: number } | null {
        const dayTrades = this.trades.filter(t => t.date === dateStr);
        if (dayTrades.length === 0) return null;
        
        const totalPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
        const wins = dayTrades.filter(t => t.pnl > 0).length;
        const losses = dayTrades.filter(t => t.pnl < 0).length;
        
        return {
            total: dayTrades.length,
            wins: wins,
            losses: losses,
            pnl: totalPnl
        };
    }
    
    private updateDailyTrades(date: Date): void {
        if (!this.elements.dailyTradesList) return;
        
        const dateStr = this.formatDateYMD(date);
        const dayTrades = this.trades.filter(t => t.date === dateStr);
        
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if (this.elements.selectedDateHeader) {
            this.elements.selectedDateHeader.textContent = date.toLocaleDateString('en-US', options);
        }
        
        if (dayTrades.length === 0) {
            this.elements.dailyTradesList.innerHTML = '<div class="journal-empty-message">No trades for this day</div>';
            return;
        }
        
        const totalPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
        const wins = dayTrades.filter(t => t.pnl > 0).length;
        const winRate = Math.round((wins / dayTrades.length) * 100);
        
        let summaryHTML = `
            <div class="journal-day-summary">
                <div class="journal-summary-item">
                    <div class="journal-summary-label">Total P&L</div>
                    <div class="journal-summary-value" style="color: ${totalPnl >= 0 ? 'var(--accent-buy)' : 'var(--accent-sell)'}">
                        ${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl)}
                    </div>
                </div>
                <div class="journal-summary-item">
                    <div class="journal-summary-label">Win Rate</div>
                    <div class="journal-summary-value" style="color: var(--accent-info)">${winRate}%</div>
                </div>
                <div class="journal-summary-item">
                    <div class="journal-summary-label">Trades</div>
                    <div class="journal-summary-value">${dayTrades.length}</div>
                </div>
            </div>
        `;
        
        let tradesHTML = '';
        dayTrades.forEach(trade => {
            const directionClass = trade.direction === 'LONG' ? 'long' : 'short';
            const pnlClass = trade.pnl >= 0 ? 'win' : 'loss';
            const pnlSymbol = trade.pnl >= 0 ? '+' : '-';
            
            tradesHTML += `
                <div class="journal-daily-trade ${pnlClass}" data-trade-id="${trade.id}">
                    <div>
                        <span class="journal-daily-trade-pair">${trade.pair}</span>
                        <span class="journal-direction-badge ${directionClass}">${trade.direction}</span>
                        <span class="journal-daily-trade-size">${trade.size}L</span>
                    </div>
                    <div class="journal-daily-trade-pnl ${pnlClass}">
                        ${pnlSymbol}$${Math.abs(trade.pnl)}
                    </div>
                </div>
            `;
        });
        
        this.elements.dailyTradesList.innerHTML = summaryHTML + tradesHTML;
        
        // Add click listeners to daily trades
        document.querySelectorAll('.journal-daily-trade').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const tradeId = parseInt((el as HTMLElement).dataset.tradeId!);
                this.openTradeModal(tradeId);
            });
        });
    }
    
    // ==================== TRADES TAB METHODS ====================
    
    private renderTradesTab(): void {
        this.updateTradesTable();
        this.setupFilterListener();
    }
    
    private getFilteredTrades(): Trade[] {
        let filtered = [...this.trades];
        const today = new Date();
        
        switch (this.currentFilter) {
            case 'win':
                filtered = this.trades.filter(t => t.pnl > 0);
                break;
            case 'loss':
                filtered = this.trades.filter(t => t.pnl < 0);
                break;
            case 'week':
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                filtered = this.trades.filter(t => new Date(t.date) >= weekAgo);
                break;
            case 'month':
                const currentMonth = today.getMonth();
                const currentYear = today.getFullYear();
                filtered = this.trades.filter(t => {
                    const date = new Date(t.date);
                    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
                });
                break;
            default:
                filtered = [...this.trades];
        }
        return filtered;
    }
    
    private calculateStats(trades: Trade[]): { total: number; winRate: number; netPnl: number } {
        const total = trades.length;
        const wins = trades.filter(t => t.pnl > 0).length;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
        return { total, winRate, netPnl };
    }
    
    private updateTradesTable(): void {
        const filtered = this.getFilteredTrades();
        const stats = this.calculateStats(filtered);
        
        // Update stats cards
        if (this.elements.totalTradesStat) {
            this.elements.totalTradesStat.textContent = stats.total.toString();
        }
        if (this.elements.winRateStat) {
            this.elements.winRateStat.textContent = `${stats.winRate}%`;
            this.elements.winRateStat.className = `stat-number ${stats.winRate >= 50 ? 'positive' : 'negative'}`;
        }
        if (this.elements.netPnlStat) {
            this.elements.netPnlStat.textContent = `${stats.netPnl >= 0 ? '+' : ''}$${Math.abs(stats.netPnl)}`;
            this.elements.netPnlStat.className = `stat-number ${stats.netPnl >= 0 ? 'positive' : 'negative'}`;
        }
        
        // Update filter stats text
        if (this.elements.filterStats) {
            switch (this.currentFilter) {
                case 'win': this.elements.filterStats.textContent = `Showing ${filtered.length} winning trades`; break;
                case 'loss': this.elements.filterStats.textContent = `Showing ${filtered.length} losing trades`; break;
                case 'week': this.elements.filterStats.textContent = `Showing ${filtered.length} trades from last 7 days`; break;
                case 'month': this.elements.filterStats.textContent = `Showing ${filtered.length} trades from this month`; break;
                default: this.elements.filterStats.textContent = `Showing all ${filtered.length} trades`;
            }
        }
        
        // Render table
        if (!this.elements.tradesTableBody) return;
        
        if (filtered.length === 0) {
            this.elements.tradesTableBody.innerHTML = `<tr><td colspan="5" class="journal-empty-message">No trades found</td></tr>`;
            return;
        }
        
        let html = '';
        filtered.forEach(trade => {
            const directionClass = trade.direction === 'LONG' ? 'long' : 'short';
            const pnlClass = trade.pnl >= 0 ? 'pnl-profit' : 'pnl-loss';
            const pnlSymbol = trade.pnl >= 0 ? '+' : '-';
            const dateTime = this.formatDateTime(trade.date, trade.time);
            
            html += `
                <tr data-trade-id="${trade.id}">
                    <td>${dateTime}</td>
                    <td>${trade.pair}</td>
                    <td><span class="direction-badge ${directionClass}">${trade.direction}</span></td>
                    <td>${trade.size}</td>
                    <td class="${pnlClass}">${pnlSymbol}$${Math.abs(trade.pnl)}</td>
                </tr>
            `;
        });
        
        this.elements.tradesTableBody.innerHTML = html;
        
        // Add click listeners to table rows
        document.querySelectorAll('#journal-filtered-trades tr').forEach(row => {
            row.addEventListener('click', () => {
                const tradeId = parseInt((row as HTMLElement).dataset.tradeId!);
                this.openTradeModal(tradeId);
            });
        });
    }
    
    // ==================== MODAL METHODS ====================
    
    private openTradeModal(tradeId: number): void {
        const trade = this.trades.find(t => t.id === tradeId);
        if (!trade) return;
        
        this.currentTradeId = trade.id;
        
        // Set header color
        if (this.elements.modalHeader) {
            this.elements.modalHeader.classList.remove('long', 'short');
            this.elements.modalHeader.classList.add(trade.direction.toLowerCase());
        }
        
        if (this.elements.modalTitle) {
            this.elements.modalTitle.textContent = `${trade.pair} - ${trade.direction}`;
        }
        if (this.elements.modalEntry) {
            this.elements.modalEntry.textContent = trade.entry;
        }
        if (this.elements.modalExit) {
            this.elements.modalExit.textContent = trade.exit;
        }
        if (this.elements.modalPips) {
            this.elements.modalPips.textContent = trade.pips;
            this.elements.modalPips.className = 'detail-value';
            if (trade.pips.startsWith('+')) {
                this.elements.modalPips.classList.add('pips-positive');
            } else if (trade.pips.startsWith('-')) {
                this.elements.modalPips.classList.add('pips-negative');
            }
        }
        if (this.elements.modalDuration) {
            this.elements.modalDuration.textContent = trade.duration;
        }
        if (this.elements.modalSize) {
            this.elements.modalSize.textContent = trade.size;
        }
        if (this.elements.tradeNotes) {
            (this.elements.tradeNotes as HTMLTextAreaElement).value = trade.notes || '';
        }
        
        // Show/hide image section
        if (this.elements.imageSection) {
            if (trade.imageUrl) {
                this.elements.imageSection.style.display = 'block';
                if (this.elements.chartImageLink) {
                    this.elements.chartImageLink.href = trade.imageUrl;
                }
            } else {
                this.elements.imageSection.style.display = 'none';
            }
        }
        
        if (this.elements.modal) {
            this.elements.modal.classList.add('active');
        }
    }
    
    private closeModal(): void {
        if (this.elements.modal) {
            this.elements.modal.classList.remove('active');
        }
        this.currentTradeId = null;
    }
    
    private saveNotes(): void {
        if (this.currentTradeId === null) return;
        const notes = (this.elements.tradeNotes as HTMLTextAreaElement).value;
        const trade = this.trades.find(t => t.id === this.currentTradeId);
        if (trade) {
            trade.notes = notes;
            this.saveData();
            // Show temporary success indicator
            const saveBtn = this.elements.saveNotesBtn;
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✓ Saved!';
            setTimeout(() => {
                saveBtn.textContent = originalText;
            }, 1500);
        }
    }
    
    private downloadImage(): void {
        const trade = this.trades.find(t => t.id === this.currentTradeId);
        if (trade && trade.imageUrl) {
            const link = document.createElement('a');
            link.href = trade.imageUrl;
            link.download = `${trade.pair}_chart.png`;
            link.click();
        }
    }
    
    // ==================== EVENT HANDLERS ====================
    
    private setupEventHandlers(): void {
        // Calendar day clicks
        if (this.elements.calendarDays) {
            this.elements.calendarDays.addEventListener('click', (e: Event) => {
                const target = e.target as HTMLElement;
                const dayElement = target.closest('.journal-calendar-day:not(.empty)') as HTMLElement;
                if (dayElement) {
                    const year = parseInt(dayElement.dataset.year!);
                    const month = parseInt(dayElement.dataset.month!);
                    const day = parseInt(dayElement.dataset.day!);
                    this.selectedDate = new Date(year, month, day);
                    this.renderCalendar();
                    this.updateDailyTrades(this.selectedDate);
                }
            });
        }
        
        // Navigation buttons
        document.querySelectorAll('.journal-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const direction = parseInt((btn as HTMLElement).dataset.direction!);
                this.currentDisplayDate = new Date(
                    this.currentDisplayDate.getFullYear(),
                    this.currentDisplayDate.getMonth() + direction,
                    1
                );
                this.renderCalendar();
            });
        });
        
        // Today button
        const todayBtn = document.querySelector('.journal-today-btn');
        if (todayBtn) {
            todayBtn.addEventListener('click', () => {
                const today = new Date();
                this.currentDisplayDate = new Date(today.getFullYear(), today.getMonth(), 1);
                this.selectedDate = today;
                this.renderCalendar();
                this.updateDailyTrades(today);
            });
        }
        
        // View all button
        if (this.elements.viewAllBtn) {
            this.elements.viewAllBtn.addEventListener('click', () => {
                // Switch to trades tab
                document.querySelectorAll('.journal-tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                document.querySelectorAll('.journal-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const tradesTab = document.querySelector('.journal-tab[data-tab="trades"]');
                if (tradesTab) tradesTab.classList.add('active');
                const tradesContent = document.getElementById('journal-trades-tab');
                if (tradesContent) tradesContent.classList.add('active');
            });
        }
        
        // Modal close
        if (this.elements.closeModalBtn) {
            this.elements.closeModalBtn.addEventListener('click', () => this.closeModal());
        }
        if (this.elements.modal) {
            this.elements.modal.addEventListener('click', (e: Event) => {
                if (e.target === this.elements.modal) this.closeModal();
            });
        }
        
        // Save notes
        if (this.elements.saveNotesBtn) {
            this.elements.saveNotesBtn.addEventListener('click', () => this.saveNotes());
        }
        
        // Download image
        if (this.elements.downloadImageBtn) {
            this.elements.downloadImageBtn.addEventListener('click', () => this.downloadImage());
        }
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.modal?.classList.contains('active')) {
                this.closeModal();
            }
        });
    }
    
    private setupFilterListener(): void {
        if (this.elements.filterDropdown) {
            this.elements.filterDropdown.addEventListener('change', (e: Event) => {
                this.currentFilter = (e.target as HTMLSelectElement).value;
                this.updateTradesTable();
            });
        }
    }
    
    // ==================== UTILITY METHODS ====================
    
    private formatDateYMD(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    private formatDateTime(dateStr: string, timeStr: string): string {
        const date = new Date(dateStr);
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const day = date.getDate();
        return `${month} ${day}, ${timeStr}`;
    }
    
    // ==================== PUBLIC METHODS ====================
    
    public destroy(): void {
        this.isDestroyed = true;
        this.isInitialized = false;
        console.log("🧹 Journal Module Destroyed");
    }
}
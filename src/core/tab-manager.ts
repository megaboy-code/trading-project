// ================================================================
// ⚡ TAB MANAGER - TradingView-style tab interface
// ================================================================

import { formatPrice } from '../core/price-utils';

interface Tab {
    id: string;
    title: string;
    icon?: string;
    type: 'chart' | 'analytics' | 'component';
    closable: boolean;
    active: boolean;
}

export class TabManager {
    private static instance: TabManager;
    private tabs: Tab[] = [];
    private activeTabId: string = '';
    private container: HTMLElement | null = null;

    // ==================== LIVE TAB STATE ====================
    private currentSymbol: string = localStorage.getItem('last_symbol') || 'EURUSD';
    private currentTimeframe: string = localStorage.getItem('last_timeframe') || 'H1';
    private currentPrice: string = '';
    private priceDirection: 'up' | 'down' | 'flat' = 'flat';
    private lastPrice: number = 0;
    private lastDirectionChange: number = 0;
    private readonly DIRECTION_COOLDOWN = 300;

    // ✅ Cache last rendered tab label values to skip redundant DOM writes
    private lastRenderedTitle:     string = '';
    private lastRenderedPrice:     string = '';
    private lastRenderedDirection: string = '';

    private readonly defaultTabs: Tab[] = [
        {
            id: 'chart',
            title: 'Chart',
            type: 'chart',
            closable: false,
            active: true
        }
    ];

    private constructor() {
        this.tabs = [...this.defaultTabs];
        this.activeTabId = 'chart';
    }

    static getInstance(): TabManager {
        if (!TabManager.instance) {
            TabManager.instance = new TabManager();
        }
        return TabManager.instance;
    }

    public initialize(): void {
        if (document.getElementById('electron-tab-strip')) return;

        this.createTabStrip();
        this.setupEventListeners();
        this.setupLiveTabListeners();
        this.updateBodyTabClass();

        console.log('✅ Tab Manager initialized');
    }

    // ==================== LIVE TAB LISTENERS ====================

    private setupLiveTabListeners(): void {

        document.addEventListener('price-update', (e: Event) => {
            const { bid } = (e as CustomEvent).detail;
            if (!bid) return;

            const newPrice = bid;
            const now = Date.now();

            if (this.lastPrice !== 0 && now - this.lastDirectionChange > this.DIRECTION_COOLDOWN) {
                if (newPrice > this.lastPrice) {
                    this.priceDirection = 'up';
                    this.lastDirectionChange = now;
                } else if (newPrice < this.lastPrice) {
                    this.priceDirection = 'down';
                    this.lastDirectionChange = now;
                }
            }

            this.lastPrice = newPrice;
            // ✅ Use formatPrice for correct decimal places per symbol
            this.currentPrice = formatPrice(this.currentSymbol, newPrice);
            this.updateChartTabLabel();
        });

        document.addEventListener('symbol-changed', (e: Event) => {
            const { symbol } = (e as CustomEvent).detail;
            if (symbol) {
                this.currentSymbol    = symbol;
                this.currentPrice     = '';
                this.lastPrice        = 0;
                this.priceDirection   = 'flat';
                this.lastDirectionChange = 0;
                // ✅ Reset cache on symbol change so label fully re-renders
                this.lastRenderedTitle     = '';
                this.lastRenderedPrice     = '';
                this.lastRenderedDirection = '';
                this.updateChartTabLabel();
            }
        });

        document.addEventListener('timeframe-changed', (e: Event) => {
            const { timeframe } = (e as CustomEvent).detail;
            if (timeframe) {
                this.currentTimeframe = timeframe;
                // ✅ Reset title cache so timeframe change re-renders
                this.lastRenderedTitle = '';
                this.updateChartTabLabel();
            }
        });

        document.addEventListener('open-strategy-tab', () => this.openStrategyTab());
        document.addEventListener('open-journal-tab',  () => this.openJournalTab());
    }

    // ==================== CHART TAB LABEL UPDATE ====================

    private updateChartTabLabel(): void {
        const tabEl = this.container?.querySelector('[data-tab-id="chart"]');
        if (!tabEl) return;

        const titleEl = tabEl.querySelector('.tab-title')      as HTMLElement;
        const priceEl = tabEl.querySelector('.tab-live-price') as HTMLElement;
        const arrowEl = tabEl.querySelector('.tab-live-arrow') as HTMLElement;

        const newTitle     = `${this.currentSymbol} · ${this.currentTimeframe}`;
        const newPrice     = this.currentPrice;
        const newDirection = this.priceDirection;

        // ✅ Only update title if changed
        if (titleEl && this.lastRenderedTitle !== newTitle) {
            titleEl.textContent    = newTitle;
            this.lastRenderedTitle = newTitle;
        }

        // ✅ Only update price if changed
        if (priceEl && this.lastRenderedPrice !== newPrice) {
            priceEl.textContent    = newPrice;
            this.lastRenderedPrice = newPrice;
        }

        // ✅ Only update direction/arrow if changed
        if (this.lastRenderedDirection !== newDirection) {
            if (priceEl) priceEl.className = `tab-live-price ${newDirection}`;
            if (arrowEl) {
                arrowEl.className   = `tab-live-arrow ${newDirection}`;
                arrowEl.textContent = newDirection === 'up'   ? '▲'
                                    : newDirection === 'down' ? '▼' : '';
            }
            this.lastRenderedDirection = newDirection;
        }
    }

    // ==================== TAB STRIP ====================

    private createTabStrip(): void {
        const tabStrip = document.createElement('div');
        tabStrip.id = 'electron-tab-strip';
        tabStrip.className = 'electron-tab-strip';

        const leftSection = document.createElement('div');
        leftSection.className = 'tab-strip-left';

        this.createUserMenu(leftSection);

        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'tabs-container';
        leftSection.appendChild(tabsContainer);

        const rightSection = document.createElement('div');
        rightSection.className = 'tab-strip-right';

        // AUTO TRADE TOGGLE
        const autoTradeToggle = document.createElement('div');
        autoTradeToggle.className = 'auto-toggle-tab';
        autoTradeToggle.title = 'Auto Trading';
        autoTradeToggle.innerHTML = `
            <label class="switch tab-switch">
                <input type="checkbox" id="autoTradeToggleTab">
                <span class="slider"></span>
            </label>
        `;
        rightSection.appendChild(autoTradeToggle);

        // NOTIFICATION BELL
        const notificationBellTab = document.createElement('div');
        notificationBellTab.className = 'notification-bell-tab';
        notificationBellTab.id = 'notificationBell';
        notificationBellTab.title = 'Notifications';
        notificationBellTab.innerHTML = `
            <i class="fas fa-bell"></i>
            <span class="alert-count" id="alertCount">0</span>
        `;
        rightSection.appendChild(notificationBellTab);

        // ADD TAB BUTTON
        const addTabBtn = document.createElement('button');
        addTabBtn.className = 'tab-control-btn add-tab-btn';
        addTabBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addTabBtn.title = 'New Tab';
        addTabBtn.addEventListener('click', () => this.addNewTab());
        rightSection.appendChild(addTabBtn);

        // WINDOW CONTROLS
        const windowControls = document.createElement('div');
        windowControls.className = 'window-controls';

        const minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'window-control-btn minimize-btn';
        minimizeBtn.innerHTML = '🗕';
        minimizeBtn.title = 'Minimize';
        minimizeBtn.addEventListener('click', () => this.minimizeWindow());

        const maximizeBtn = document.createElement('button');
        maximizeBtn.className = 'window-control-btn maximize-btn';
        maximizeBtn.innerHTML = '🗖';
        maximizeBtn.title = 'Maximize';
        maximizeBtn.addEventListener('click', () => this.toggleMaximize());

        const closeBtn = document.createElement('button');
        closeBtn.className = 'window-control-btn close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.closeWindow());

        windowControls.appendChild(minimizeBtn);
        windowControls.appendChild(maximizeBtn);
        windowControls.appendChild(closeBtn);
        rightSection.appendChild(windowControls);

        tabStrip.appendChild(leftSection);
        tabStrip.appendChild(rightSection);

        document.body.insertBefore(tabStrip, document.body.firstChild);
        this.container = tabStrip;

        this.renderTabs();
        this.setupAutoTradeToggle();
    }

    // ==================== USER MENU ====================

    private createUserMenu(leftSection: HTMLElement): void {

        const userMenuBtn = document.createElement('div');
        userMenuBtn.className = 'user-menu-btn';
        userMenuBtn.id = 'userMenuBtn';
        userMenuBtn.title = 'Account';
        userMenuBtn.innerHTML = `<i class="fas fa-user-circle"></i>`;
        leftSection.appendChild(userMenuBtn);

        const userDropdown = document.createElement('div');
        userDropdown.className = 'user-menu-dropdown';
        userDropdown.id = 'userMenuDropdown';
        userDropdown.innerHTML = `
            <div class="user-menu-header">
                <i class="fas fa-user-circle user-avatar-icon"></i>
                <div class="user-info">
                    <span class="user-name">Trader</span>
                    <span class="user-role">Pro Account</span>
                </div>
            </div>
            <div class="user-menu-divider"></div>
            <div class="user-menu-item" id="menuProfile">
                <i class="fas fa-id-card"></i> Profile
            </div>

            <!-- ✅ Theme item with inline submenu -->
            <div class="user-menu-item user-menu-item-theme" id="menuTheme">
                <i class="fas fa-palette"></i>
                <span>Theme</span>
                <i class="fas fa-chevron-right user-menu-chevron"></i>
            </div>
            <div class="user-theme-submenu" id="userThemeSubmenu">
                <div class="user-theme-option" data-theme="system">
                    <div class="user-theme-dot" style="background:#0b111b; border:1px solid #2a384a;"></div>
                    <span>System</span>
                    <i class="fas fa-check user-theme-check"></i>
                </div>
                <div class="user-theme-option" data-theme="dark">
                    <div class="user-theme-dot" style="background:#0a0e13; border:1px solid #1e2a3a;"></div>
                    <span>Dark</span>
                    <i class="fas fa-check user-theme-check"></i>
                </div>
                <div class="user-theme-option" data-theme="light">
                    <div class="user-theme-dot" style="background:#f8f9fc; border:1px solid #ccd3e0;"></div>
                    <span>Light</span>
                    <i class="fas fa-check user-theme-check"></i>
                </div>
            </div>

            <div class="user-menu-divider"></div>
            <div class="user-menu-item" id="menuHotkeys">
                <i class="fas fa-keyboard"></i> Hotkeys
            </div>
            <div class="user-menu-divider"></div>
            <div class="user-menu-item danger" id="menuLogout">
                <i class="fas fa-sign-out-alt"></i> Logout
            </div>
        `;
        document.body.appendChild(userDropdown);

        // TOGGLE DROPDOWN
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = userDropdown.classList.contains('open');
            userDropdown.classList.toggle('open');
            if (!isOpen) this.syncThemeSelection();
        });

        // ✅ Close dropdown and reset submenu on outside click
        document.addEventListener('click', () => {
            userDropdown.classList.remove('open');
            (userDropdown.querySelector('#userThemeSubmenu') as HTMLElement)?.classList.remove('open');
        });

        // PREVENT DROPDOWN FROM CLOSING ON INSIDE CLICK
        userDropdown.addEventListener('click', (e) => e.stopPropagation());

        // THEME ITEM — TOGGLE SUBMENU
        userDropdown.querySelector('#menuTheme')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const submenu = userDropdown.querySelector('#userThemeSubmenu') as HTMLElement;
            submenu.classList.toggle('open');
        });

        // THEME OPTIONS
        userDropdown.querySelectorAll('.user-theme-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const theme = (option as HTMLElement).dataset.theme!;
                this.applyTheme(theme);
                this.syncThemeSelection();
                // ✅ Close submenu and dropdown after selection
                (userDropdown.querySelector('#userThemeSubmenu') as HTMLElement)?.classList.remove('open');
                userDropdown.classList.remove('open');
            });
        });

        // MENU ITEM ACTIONS
        userDropdown.querySelector('#menuProfile')?.addEventListener('click', () => {
            userDropdown.classList.remove('open');
            document.dispatchEvent(new CustomEvent('open-profile'));
        });

        userDropdown.querySelector('#menuHotkeys')?.addEventListener('click', () => {
            userDropdown.classList.remove('open');
            document.dispatchEvent(new CustomEvent('open-hotkeys'));
        });

        userDropdown.querySelector('#menuLogout')?.addEventListener('click', () => {
            userDropdown.classList.remove('open');
            document.dispatchEvent(new CustomEvent('user-logout'));
        });
    }

    // ==================== THEME ====================

    private applyTheme(theme: string): void {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('app-theme', theme);

        // ✅ Remove active template so chart colors reset to theme defaults
        localStorage.removeItem('mega_flowz_active_template');

        // ✅ Dispatch theme change so chart updates
        document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));

        // ✅ Apply chart colors for the theme
        const colorMap: Record<string, any> = {
            system: { background: '#0b111b', grid: '#1e2a3a', bull: '#00e08a', bear: '#ff3d57',
                       line: '#4c8dff', scaleBorder: '#2a384a', crosshair: '#3a4a5c',
                       textColor: '#c8d4e8', wickBull: '#00e08a', wickBear: '#ff3d57',
                       borderBull: '#00e08a', borderBear: '#ff3d57' },
            dark:   { background: '#0b111b', grid: '#1e2a3a', bull: '#00e08a', bear: '#ff3d57',
                       line: '#4c8dff', scaleBorder: '#2a384a', crosshair: '#3a4a5c',
                       textColor: '#c8d4e8', wickBull: '#00e08a', wickBear: '#ff3d57',
                       borderBull: '#00e08a', borderBear: '#ff3d57' },
            light:  { background: '#f8f9fc', grid: '#e4e8f0', bull: '#0a8a58', bear: '#d42030',
                       line: '#1a54b0', scaleBorder: '#ccd3e0', crosshair: '#8896aa',
                       textColor: '#1a2030', wickBull: '#0a8a58', wickBear: '#d42030',
                       borderBull: '#0a8a58', borderBear: '#d42030' },
        };

        const colors = colorMap[theme];
        if (colors) {
            document.dispatchEvent(new CustomEvent('chart-colors-change', {
                detail: { colors }
            }));
        }

        console.log(`🎨 Theme applied: ${theme}`);
    }

    private syncThemeSelection(): void {
        const current = localStorage.getItem('app-theme') || 'system';
        document.querySelectorAll('.user-theme-option').forEach(option => {
            const check = option.querySelector('.user-theme-check') as HTMLElement;
            const isActive = (option as HTMLElement).dataset.theme === current;
            option.classList.toggle('active', isActive);
            if (check) check.style.opacity = isActive ? '1' : '0';
        });
    }

    // ==================== ON-DEMAND TABS ====================

    public openStrategyTab(): void {
        const existing = this.tabs.find(t => t.id === 'strategy');
        if (existing) {
            this.switchToTab('strategy');
            return;
        }

        const strategyTab: Tab = {
            id: 'strategy',
            title: 'Strategy',
            type: 'analytics',
            closable: true,
            active: false
        };

        this.tabs.push(strategyTab);
        this.switchToTab('strategy');
        console.log('📈 Strategy tab opened');
    }

    public openJournalTab(): void {
        const existing = this.tabs.find(t => t.id === 'journal');
        if (existing) {
            this.switchToTab('journal');
            return;
        }

        const journalTab: Tab = {
            id: 'journal',
            title: 'Journal',
            type: 'component',
            closable: true,
            active: false
        };

        this.tabs.push(journalTab);
        this.switchToTab('journal');
        console.log('📓 Journal tab opened');
    }

    // ==================== AUTO TRADE TOGGLE ====================

    private setupAutoTradeToggle(): void {
        const autoTradeToggle = document.getElementById('autoTradeToggleTab') as HTMLInputElement;
        if (!autoTradeToggle) return;

        autoTradeToggle.addEventListener('change', () => {
            const enabled = autoTradeToggle.checked;
            document.dispatchEvent(new CustomEvent('auto-trade-toggled', {
                detail: { enabled }
            }));
            console.log(`🤖 Auto Trade: ${enabled ? 'ENABLED' : 'DISABLED'}`);
        });
    }

    // ==================== RENDER TABS ====================

    private renderTabs(): void {
        const tabsContainer = this.container?.querySelector('.tabs-container');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';

        this.tabs.forEach(tab => {
            const tabElement = document.createElement('div');
            tabElement.className = `tab ${tab.active ? 'active' : ''} ${tab.closable ? 'closable' : ''}`;
            tabElement.dataset.tabId = tab.id;

            const title = document.createElement('span');
            title.className = 'tab-title';

            if (tab.id === 'chart') {
                title.textContent = `${this.currentSymbol} · ${this.currentTimeframe}`;
            } else {
                title.textContent = tab.title;
            }

            tabElement.appendChild(title);

            if (tab.id === 'chart') {
                const priceEl = document.createElement('span');
                priceEl.className = `tab-live-price ${this.priceDirection}`;
                priceEl.textContent = this.currentPrice;
                tabElement.appendChild(priceEl);

                const arrowEl = document.createElement('span');
                arrowEl.className = `tab-live-arrow ${this.priceDirection}`;
                arrowEl.textContent = this.priceDirection === 'up'   ? '▲'
                                    : this.priceDirection === 'down' ? '▼' : '';
                tabElement.appendChild(arrowEl);
            }

            if (tab.closable) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'tab-close-btn';
                closeBtn.innerHTML = '✕';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeTab(tab.id);
                });
                tabElement.appendChild(closeBtn);
            }

            tabElement.addEventListener('click', () => this.switchToTab(tab.id));
            tabsContainer.appendChild(tabElement);
        });
    }

    // ==================== TAB STATE ====================

    private updateBodyTabClass(): void {
        document.body.classList.remove(
            'tab-chart-active',
            'tab-analytics-active',
            'tab-strategy-active',
            'tab-journal-active',
            'tab-component-active'
        );
        document.body.classList.add(`tab-${this.activeTabId}-active`);
    }

    private updateSidebars(tabId: string): void {
        const drawingSidebar     = document.querySelector('.drawing-sidebar')     as HTMLElement;
        const toolsPanel         = document.querySelector('.tools-panel')         as HTMLElement;
        const workspaceContainer = document.querySelector('.workspace-container') as HTMLElement;

        const isFullscreen = tabId === 'strategy' || tabId === 'journal';

        if (isFullscreen) {
            if (drawingSidebar)     drawingSidebar.style.display    = 'none';
            if (toolsPanel)         toolsPanel.style.display        = 'none';
            if (workspaceContainer) {
                workspaceContainer.style.left  = '0';
                workspaceContainer.style.right = '0';
            }
        } else {
            if (drawingSidebar)     drawingSidebar.style.display    = '';
            if (toolsPanel)         toolsPanel.style.display        = '';
            if (workspaceContainer) {
                workspaceContainer.style.left  = '';
                workspaceContainer.style.right = '';
            }
        }
    }

    // ✅ FIX 1: dispatch tab-switched event so module-manager can lazy load
    public switchToTab(tabId: string): void {
        this.tabs.forEach(tab => {
            tab.active = tab.id === tabId;
        });

        this.activeTabId = tabId;
        this.renderTabs();
        this.updateBodyTabClass();
        this.updateSidebars(tabId);

        document.dispatchEvent(new CustomEvent('tab-switched', {
            detail: { tabId }
        }));

        console.log(`🔀 Switched to tab: ${tabId}`);
    }

    public addNewTab(): void {
        const newTab: Tab = {
            id: `tab-${Date.now()}`,
            title: 'New Tab',
            type: 'component',
            closable: true,
            active: false
        };

        this.tabs.push(newTab);
        this.switchToTab(newTab.id);
    }

    public closeTab(tabId: string): void {
        if (tabId === 'chart') return;

        const tabIndex = this.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        this.tabs.splice(tabIndex, 1);

        if (tabId === this.activeTabId) {
            this.switchToTab('chart');
        } else {
            this.renderTabs();
        }
    }

    private setupEventListeners(): void {
        const tabStrip = document.getElementById('electron-tab-strip');
        tabStrip?.addEventListener('dblclick', () => this.toggleMaximize());
    }

    private minimizeWindow(): void { console.log('Minimize clicked'); }
    private toggleMaximize(): void { console.log('Maximize clicked'); }
    private closeWindow(): void    { console.log('Close clicked'); }

    public destroy(): void {
        const tabStrip = document.getElementById('electron-tab-strip');
        if (tabStrip) tabStrip.remove();
        document.getElementById('userMenuDropdown')?.remove();
        document.body.classList.remove(
            'tab-chart-active',
            'tab-analytics-active',
            'tab-strategy-active',
            'tab-journal-active',
            'tab-component-active'
        );
    }
}

export function initializeTabManager(): TabManager {
    const manager = TabManager.getInstance();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => manager.initialize());
    } else {
        manager.initialize();
    }

    return manager;
}
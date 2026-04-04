// ================================================================
// ⚡ TRADING MODULE - Orchestrator
// Ties TradingPanel + PositionsModal together
// ModuleManager imports only this file
// ================================================================

import { AccountInfo, PositionData, WebSocketMessage } from '../types';
import { TradingPanel }    from './trading-panel';
import { PositionsModal }  from './positions-modal';

export class TradingModule {

    private panel:   TradingPanel;
    private modal:   PositionsModal;

    private positions:   PositionData[] = [];
    private floatingPnl: number = 0;
    private balance:     number = 10_000;

    private boundOpenPositions: EventListener | null = null;
    private boundHotkeyAction:  EventListener | null = null;
    private boundHotkeyTrade:   EventListener | null = null;

    constructor() {
        this.panel = new TradingPanel();
        this.modal = new PositionsModal();

        // Give panel access to positions for hedge/reverse
        this.panel.setGetPositions(() => this.positions);

        this.initialize();
    }

    // ================================================================
    // INITIALIZE
    // ================================================================

    private initialize(): void {
        try {
            this.panel.initialize();
            this.setupPositionsButton();
            this.setupHotkeyListeners();
            this.renderPositionsCount();
        } catch (error) {
            console.error('❌ Trading Module failed:', error);
        }
    }

    // ================================================================
    // PUBLIC API — called by ModuleManager
    // ================================================================

    // ✅ Fix — primitives instead of WebSocketMessage
    public onTick(symbol: string, bid: number, ask: number): void {
        this.panel.onTick(symbol, bid, ask);
        this.modal.updateInlineOnTick(ask);
    }

    public updateAccountInfo(account: AccountInfo): void {
        this.balance = account.balance ?? this.balance;

        this.floatingPnl = (account.equity ?? this.balance) - this.balance;

        this.panel.onAccountUpdate(
            account.balance     ?? this.panel.state.balance,
            account.equity      ?? this.panel.state.equity,
            account.free_margin ?? this.panel.state.freeMargin,
            account.margin      ?? this.panel.state.margin,
            account.leverage    ?? this.panel.state.leverage
        );

        this.panel.renderHero(this.floatingPnl, this.balance);
        this.panel.renderMetrics();
    }

    public updatePositions(positions: PositionData[]): void {
        this.positions   = positions;
        this.floatingPnl = positions.reduce((sum, p) => sum + (p.profit ?? 0), 0);
        this.balance     = this.panel.state.balance;

        this.modal.updatePositions(positions);
        this.renderPositionsCount();

        requestAnimationFrame(() => {
            this.panel.renderHero(this.floatingPnl, this.balance);
            this.panel.renderMetrics();

            const modal = document.getElementById('positionsModal');
            if (modal && !modal.classList.contains('hidden')) {
                this.modal.updateRows(positions);
            }
        });
    }

    public handleTradeConfirmation(data: WebSocketMessage): void {
        // Reserved for future use
    }

    // ================================================================
    // POSITIONS BUTTON
    // ================================================================

    private setupPositionsButton(): void {
        const btn = document.getElementById('openPositionsBtn');
        if (!btn) return;

        this.boundOpenPositions = () => this.modal.open();
        btn.addEventListener('click', this.boundOpenPositions);
    }

    // ================================================================
    // HOTKEYS
    // ================================================================

    private setupHotkeyListeners(): void {
        this.boundHotkeyAction = (e: Event) => {
            const { action } = (e as CustomEvent).detail;
            switch (action) {
                case 'open-positions-modal': this.modal.open();  break;
                case 'close-all-modals':     this.modal.close(); break;
            }
        };
        document.addEventListener('hotkey-global-action', this.boundHotkeyAction);

        this.boundHotkeyTrade = (e: Event) => {
            const { direction } = (e as CustomEvent).detail;
            if (direction === 'buy')  this.panel['executeTrade']?.('BUY');
            if (direction === 'sell') this.panel['executeTrade']?.('SELL');
        };
        document.addEventListener('hotkey-trade-action', this.boundHotkeyTrade);
    }

    // ================================================================
    // POSITIONS COUNT
    // ================================================================

    private renderPositionsCount(): void {
        const count = this.positions.length;
        this.setTextIfChanged('positionsCount',     String(count));
        this.setTextIfChanged('modalPositionCount', String(count));
    }

    private setTextIfChanged(id: string, value: string): void {
        const el = document.getElementById(id);
        if (el && el.textContent !== value) el.textContent = value;
    }

    // ================================================================
    // DESTROY
    // ================================================================

    public destroy(): void {
        if (this.boundHotkeyAction)  document.removeEventListener('hotkey-global-action', this.boundHotkeyAction);
        if (this.boundHotkeyTrade)   document.removeEventListener('hotkey-trade-action',  this.boundHotkeyTrade);
        if (this.boundOpenPositions) document.getElementById('openPositionsBtn')?.removeEventListener('click', this.boundOpenPositions);

        this.panel.destroy();
        this.modal.destroy();
    }
}
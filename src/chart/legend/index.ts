// ================================================================
// 📊 CHART LEGEND - Orchestrator
// ================================================================

import { MainLegend }        from './main-legend';
import { ItemsLegend }       from './items-legend';
import { LegendPaneManager } from './pane-manager';
import { removeElement, formatVolume, setConfigSymbols } from './utils';
import { LegendItem, LegendItemValue, LegendUpdateData, ConnectionStatus } from '../chart-types';

export class ChartLegend {
    private chartContainer:    HTMLElement;
    private legendContainer:   HTMLElement | null = null;
    private mainItemContainer: HTMLElement | null = null;

    private mainLegend:  MainLegend;
    private itemsLegend: ItemsLegend;
    private paneManager: LegendPaneManager;

    private collapsed: boolean = false;

    private abortController: AbortController | null = null;

    constructor(chartContainer: HTMLElement) {
        this.chartContainer = chartContainer;
        this.mainLegend     = new MainLegend();
        this.itemsLegend    = new ItemsLegend();
        this.paneManager    = new LegendPaneManager();
    }

    // ==================== INITIALIZATION ====================

    public initialize(): void {
        this.destroy();
        this.createContainer();
        this.setupEventListeners();
    }

    private createContainer(): void {
        this.legendContainer = document.createElement('div');
        this.legendContainer.id = 'chart-legend';
        this.legendContainer.style.cssText = `
            position: absolute;
            left: 12px;
            top: 12px;
            z-index: 100;
            pointer-events: none;
            user-select: none;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        const mainLegendEl = this.mainLegend.create();

        this.mainLegend.onToggleCollapse = () => {
            this.collapsed = !this.collapsed;
            this.mainLegend.setCollapsed(this.collapsed);
            if (this.mainItemContainer) {
                this.mainItemContainer.style.display = this.collapsed ? 'none' : 'flex';
            }
        };

        this.mainItemContainer = document.createElement('div');
        this.mainItemContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 2px;
            pointer-events: auto;
        `;

        this.paneManager = new LegendPaneManager();
        this.paneManager.setMainContainer(this.mainItemContainer, this.chartContainer);

        this.legendContainer.appendChild(mainLegendEl);
        this.legendContainer.appendChild(this.mainItemContainer);
        this.chartContainer.appendChild(this.legendContainer);
    }

    // ==================== EVENT LISTENERS ====================

    private setupEventListeners(): void {
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        // ── Backend config — populate symbol description map ──
        document.addEventListener('available-config-received', (e: Event) => {
            const config = (e as CustomEvent).detail;
            if (config?.symbols) setConfigSymbols(config.symbols);
        }, { signal });

        // ── Remove item from legend only
        // chart-core handles series + backend unsubscribe via its own listener
        document.addEventListener('legend-item-remove', (e: Event) => {
            const { id } = (e as CustomEvent).detail;
            this.removeItem(id);
        }, { signal });

        // ── Settings and toggle handled directly by chart-core
        // No re-dispatch needed here
    }

    // ==================== PUBLIC API ====================

    public update(data: LegendUpdateData): void {
        if (data.symbol    !== undefined) this.mainLegend.updateSymbol(data.symbol);
        if (data.timeframe !== undefined) this.mainLegend.updateTimeframe(data.timeframe);
        if (data.precision !== undefined) this.mainLegend.updatePrecision(data.precision);
        if (data.volumeVisible !== undefined) {
            const volumeItem = this.itemsLegend.getItem('volume');
            if (data.volumeVisible && !volumeItem) {
                this.addItem({
                    id:     'volume',
                    name:   'VOL',
                    color:  '#10b981',
                    values: [{ value: '--', color: '#10b981' }]
                });
            } else if (!data.volumeVisible && volumeItem) {
                this.removeItem('volume');
            }
        }
    }

    public updateOHLC(
        o: number | null,
        h: number | null,
        l: number | null,
        c: number | null
    ): void {
        this.mainLegend.updateOHLC(o, h, l, c);
    }

    public updateConnectionStatus(status: ConnectionStatus): void {
        this.mainLegend.updateStatus(status);
    }

    public updateVolume(volume: number, isBullish: boolean): void {
        const color     = isBullish ? '#10b981' : '#ef4444';
        const formatted = formatVolume(volume);
        if (this.itemsLegend.hasItem('volume')) {
            this.itemsLegend.updateValue('volume', [{ value: formatted, color }]);
        }
    }

    public addItem(item: LegendItem): void {
        const container = this.paneManager.getContainer(item.pane || null);
        if (!container) {
            console.warn(`⚠️ No container for pane`, item.pane);
            return;
        }
        this.itemsLegend.addItem(item, container);
    }

    public removeItem(id: string): void {
        this.itemsLegend.removeItem(id);
    }

    public updateItemValue(id: string, value: string): void {
        this.itemsLegend.updateSingleValue(id, value);
    }

    public updateItemValues(id: string, values: LegendItemValue[]): void {
        this.itemsLegend.updateValue(id, values);
    }

    public updateItemName(id: string, name: string): void {
        this.itemsLegend.updateName(id, name);
    }

    public updateItemSettings(id: string, settings: Record<string, any>): void {
        this.itemsLegend.updateSettings(id, settings);
    }

    public setItemVisible(id: string, visible: boolean): void {
        this.itemsLegend.setVisible(id, visible);
    }

    public hasItem(id: string): boolean {
        return this.itemsLegend.hasItem(id);
    }

    public async createPaneLegend(pane: any): Promise<void> {
        await this.paneManager.createPaneContainer(pane);
    }

    public removePaneLegend(pane: any): void {
        this.itemsLegend.getAll()
            .filter(item => item.pane === pane)
            .forEach(item => this.itemsLegend.removeItem(item.id));
        this.paneManager.removePaneContainer(pane);
    }

    public clearItems(): void {
        this.itemsLegend.getAll()
            .filter(item => item.icon !== 'fa-robot')
            .forEach(item => this.itemsLegend.removeItem(item.id));
        this.paneManager.clearAll();
    }

    // ==================== DESTROY ====================

    public destroy(): void {
        this.abortController?.abort();
        this.abortController = null;

        this.itemsLegend.destroy();
        this.paneManager.destroy();
        this.mainLegend.destroy();
        removeElement(this.legendContainer);
        this.legendContainer   = null;
        this.mainItemContainer = null;
        this.collapsed         = false;
    }
}

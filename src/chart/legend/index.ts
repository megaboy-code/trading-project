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
    private caretEl:           HTMLElement | null = null;

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

        this.mainItemContainer = document.createElement('div');
        this.mainItemContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 2px;
            pointer-events: auto;
            align-self: flex-start;
        `;

        // ── Caret — below items, hidden by default ──
        this.caretEl = document.createElement('div');
        this.caretEl.style.cssText = `
            display: none;
            align-items: center;
            gap: 4px;
            padding-left: 4px;
            cursor: pointer;
            pointer-events: auto;
            height: 12px;
            user-select: none;
            align-self: flex-start;
        `;

        const caretSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        caretSvg.setAttribute('width', '10');
        caretSvg.setAttribute('height', '7');
        caretSvg.setAttribute('viewBox', '0 0 12 8');
        caretSvg.setAttribute('fill', 'none');
        caretSvg.style.transition = 'transform 200ms ease';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M1 1L6 7L11 1');
        path.setAttribute('stroke', '#64748b');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        caretSvg.appendChild(path);

        const caretCount = document.createElement('span');
        caretCount.dataset.role = 'caret-count';
        caretCount.style.cssText = `
            font-size: 9px;
            color: var(--text-muted);
            font-family: 'Inter', sans-serif;
            display: none;
        `;

        this.caretEl.appendChild(caretSvg);
        this.caretEl.appendChild(caretCount);

        this.caretEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.collapsed = !this.collapsed;
            if (this.mainItemContainer) {
                this.mainItemContainer.style.display = this.collapsed ? 'none' : 'flex';
            }
            caretSvg.style.transform = this.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            const count = this.itemsLegend.getAll().length;
            caretCount.style.display = this.collapsed ? 'inline' : 'none';
            caretCount.textContent   = String(count);
        });

        this.paneManager = new LegendPaneManager();
        this.paneManager.setMainContainer(this.mainItemContainer, this.chartContainer);

        this.legendContainer.appendChild(mainLegendEl);
        this.legendContainer.appendChild(this.mainItemContainer);
        this.legendContainer.appendChild(this.caretEl);
        this.chartContainer.appendChild(this.legendContainer);
    }

    // ==================== CARET VISIBILITY ====================

    private updateCaretVisibility(): void {
        if (!this.caretEl) return;
        const hasItems = this.itemsLegend.getAll().length > 0;
        this.caretEl.style.display = hasItems ? 'flex' : 'none';
        if (!hasItems && this.collapsed) {
            this.collapsed = false;
            if (this.mainItemContainer) this.mainItemContainer.style.display = 'flex';
            const svg = this.caretEl.querySelector('svg') as SVGElement;
            if (svg) (svg as unknown as HTMLElement).style.transform = 'rotate(0deg)';
            const count = this.caretEl.querySelector('[data-role="caret-count"]') as HTMLElement;
            if (count) count.style.display = 'none';
        }
    }

    // ==================== EVENT LISTENERS ====================

    private setupEventListeners(): void {
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        // ── Only populate symbol map if config has symbols ──
        // GET_ACTIVE_STRATEGIES response has empty symbols — skip
        document.addEventListener('available-config-received', (e: Event) => {
            const config = (e as CustomEvent).detail;
            if (config?.symbols && config.symbols.length > 0) {
                setConfigSymbols(config.symbols);
            }
        }, { signal });

        document.addEventListener('legend-item-remove', (e: Event) => {
            const { id } = (e as CustomEvent).detail;
            this.removeItem(id);
        }, { signal });

        document.addEventListener('legend-item-color-update', (e: Event) => {
            const { id, color } = (e as CustomEvent).detail;
            this.itemsLegend.updateColor(id, color);
        }, { signal });

        // ── Sync legend item settings after period change ──
        document.addEventListener('indicator-settings-update', (e: Event) => {
            const { id, settings } = (e as CustomEvent).detail;
            if (id && settings) this.itemsLegend.updateSettings(id, settings);
        }, { signal });

        // ── Strategy TF inactive — remove legend item only, panel stays ──
        document.addEventListener('indicator-tf-inactive', (e: Event) => {
            const { id } = (e as CustomEvent).detail;
            this.removeItem(id);
        }, { signal });

        // ── Detach strategy legend on TF switch — DOM only, no cascade ──
        document.addEventListener('legend-item-detach', (e: Event) => {
            const { id } = (e as CustomEvent).detail;
            this.removeItem(id);
        }, { signal });
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
        this.updateCaretVisibility();
    }

    public removeItem(id: string): void {
        this.itemsLegend.removeItem(id);
        this.updateCaretVisibility();
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

    public getItem(id: string): LegendItem | undefined {
        return this.itemsLegend.getItem(id);
    }

    public updateItemId(oldId: string, newId: string): void {
        this.itemsLegend.updateItemId(oldId, newId);
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
        this.updateCaretVisibility();
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
        this.caretEl           = null;
        this.collapsed         = false;
    }
}

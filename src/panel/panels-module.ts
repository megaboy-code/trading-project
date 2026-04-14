// ================================================================
// ⚡ PANELS MODULE - Icon Click Toggle
// ================================================================

import {
    PanelMap,
    PanelState,
    IPanelUI
} from './panel-types';

export class PanelsModule {
    private isPanelExpanded: boolean = false;
    private activeTool: string = 'trading';

    private panelMap: PanelMap = {
        'trading':   '.trading-panel',
        'watchlist': '.watchlist-panel',
        'calendar':  '.calendar-panel',
        'alerts':    '.alerts-panel',
        'journal':   '.journal-panel',
    };

    // ✅ Tools that do NOT expand the panel — trigger modals or tabs
    private modalTools: string[] = ['settings'];

    // DOM Elements
    private panel: HTMLElement | null = null;
    private toolIcons: NodeListOf<Element> | null = null;
    private panelContents: NodeListOf<Element> | null = null;
    private mainChartArea: HTMLElement | null = null;

    private panelUI: IPanelUI | null = null;

    constructor() {
        console.log("🔧 Panels Module - Icon Click Toggle Sidebar");
    }

    // ==================== UI INJECTION ====================

    public setUI(panelUI: IPanelUI): void {
        this.panelUI = panelUI;
        console.log('✅ PanelUI injected into PanelsModule');
    }

    // ==================== INITIALIZATION ====================

    public initialize(): void {
        if (!this.panelUI) {
            console.error('❌ PanelUI not set! Call setUI() before initialize()');
            return;
        }

        this.cacheElements();
        this.setupEventListeners();
        this.applyInitialState();

        console.log("✅ Panel system ready");
    }

    private cacheElements(): void {
        this.panel         = document.getElementById('toolsPanel');
        this.toolIcons     = document.querySelectorAll('.tool-icon');
        this.panelContents = document.querySelectorAll('.panel-content');
        this.mainChartArea = document.getElementById('mainChartArea');
    }

    private setupEventListeners(): void {
        if (!this.panel) {
            console.error('❌ Tools panel not found in DOM');
            return;
        }

        this.toolIcons?.forEach(icon => {
            icon.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                const tool = (icon as HTMLElement).getAttribute('data-tool');
                if (!tool) return;

                // ✅ Modal/tab tools — never expand panel
                if (this.modalTools.includes(tool)) {
                    this.handleModalTool(tool);
                    return;
                }

                if (this.activeTool === tool && this.isPanelExpanded) {
                    this.collapsePanel();
                } else {
                    this.show(tool);
                }
            });
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.isPanelExpanded) {
                this.collapsePanel();
            }
        });

        window.addEventListener('resize', () => {
            this.adjustChartSpace();
        });
    }

    // ==================== MODAL TOOLS ====================

    private handleModalTool(tool: string): void {
        switch (tool) {
            case 'settings':
                document.dispatchEvent(new CustomEvent('chart-settings-modal-request'));
                break;
        }
    }

    // ==================== VISIBILITY STATES ====================

    private collapsePanel(): void {
        this.isPanelExpanded = false;

        if (this.panel) {
            this.panel.classList.remove('expanded');
            this.panel.classList.add('collapsed');
        }

        this.adjustChartSpace();
        console.log("📤 Panel collapsed");
    }

    private expandPanel(): void {
        this.isPanelExpanded = true;

        if (this.panel) {
            this.panel.classList.remove('collapsed');
            this.panel.classList.add('expanded');
        }

        this.adjustChartSpace();
        console.log("📥 Panel expanded");
    }

    // ==================== TOOL MANAGEMENT ====================

    public show(tool: string): void {
        if (!this.panelMap[tool]) {
            console.warn(`⚠️ Unknown panel tool: ${tool}`);
            return;
        }

        this.activeTool = tool;
        this.updateToolIcons();
        this.updatePanelContent();

        if (!this.isPanelExpanded) {
            this.expandPanel();
        }

        console.log(`🔧 Showing panel: ${tool}`);
    }

    private updateToolIcons(): void {
        this.toolIcons?.forEach(icon => {
            const tool = icon.getAttribute('data-tool');

            // ✅ Modal tools never get active class
            if (this.modalTools.includes(tool || '')) return;

            icon.classList.toggle('active', tool === this.activeTool);
        });
    }

    private updatePanelContent(): void {
        this.panelContents?.forEach(content => {
            content.classList.remove('active');
        });

        const targetSelector = this.panelMap[this.activeTool];
        if (targetSelector) {
            const targetPanel = document.querySelector(targetSelector);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        }
    }

    // ==================== CHART SPACE ====================

    private adjustChartSpace(): void {
        if (!this.mainChartArea) return;

        this.mainChartArea.classList.remove('panel-expanded', 'strategies-expanded');

        if (this.isPanelExpanded) {
            this.mainChartArea.classList.add('panel-expanded');
        }
    }

    // ==================== PUBLIC API ====================

    public getState(): PanelState {
        return {
            isExpanded: this.isPanelExpanded,
            isLocked:   false,
            activeTool: this.activeTool
        };
    }

    public hide(): void {
        this.collapsePanel();
    }

    public toggle(tool: string | null = null): void {
        if (this.isPanelExpanded) {
            this.collapsePanel();
        } else {
            if (tool) {
                this.show(tool);
            } else {
                this.expandPanel();
            }
        }
    }

    // ==================== INITIAL STATE ====================

    private applyInitialState(): void {
        if (this.panel) {
            this.panel.classList.add('collapsed');
        }
        this.activeTool = 'trading';
        this.updateToolIcons();
        this.updatePanelContent();
    }
}

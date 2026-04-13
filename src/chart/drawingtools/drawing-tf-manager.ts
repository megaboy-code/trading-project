// ================================================================
// 🎨 DRAWING TF MANAGER - TF/Symbol switch + visibility
// ================================================================

import { DrawingPersistence, ToolMeta } from './drawing-persistence';

export class DrawingTFManager {
    constructor(
        private lineTools:         () => any,
        private isInitialized:     () => boolean,
        private persistence:       DrawingPersistence,
        private removeTradeArrows: () => void,
        private currentTimeframe:  () => string
    ) {}

    // ==================== SYMBOL / TF SWITCH ====================

    public saveAndSwitchTimeframe(
        newTimeframe:     string,
        currentTimeframe: string,
        onTFUpdated:      (tf: string) => void
    ): void {
        if (currentTimeframe === newTimeframe) return;
        this.persistence.saveDrawings();
        onTFUpdated(newTimeframe);
        console.log(`📐 TF tracking updated: ${newTimeframe}`);
    }

    public saveAndSwitchSymbol(
        newSymbol:     string,
        currentSymbol: string,
        onSymUpdated:  (sym: string) => void
    ): void {
        if (currentSymbol === newSymbol) return;
        this.persistence.saveDrawings();
        onSymUpdated(newSymbol);
        console.log(`📐 Symbol tracking updated: ${newSymbol}`);
    }

    public async onTimeframeChange(
        newTimeframe:     string,
        currentTimeframe: string,
        onTFUpdated:      (tf: string) => void
    ): Promise<void> {
        if (currentTimeframe === newTimeframe) return;
        this.persistence.saveDrawings();
        onTFUpdated(newTimeframe);
        this.removeTradeArrows();

        // ✅ Wait for new TF scale to stabilize before applying visibility
        await new Promise<void>(resolve => requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve())
        ));

        this.applyTFVisibility(newTimeframe);
    }

    public async onSymbolChange(
        newSymbol:     string,
        currentSymbol: string,
        onSymUpdated:  (sym: string) => void
    ): Promise<void> {
        if (currentSymbol === newSymbol) return;
        this.persistence.saveDrawings();
        onSymUpdated(newSymbol);
        this.removeTradeArrows();
    }

    // ==================== VISIBILITY ====================

    public applyTFVisibility(newTimeframe: string): void {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;

        try {
            const json  = lt.exportLineTools();
            const tools = JSON.parse(json);
            if (!Array.isArray(tools)) return;

            tools.forEach((tool: any) => {
                if (!tool?.id) return;

                const visible = this.persistence.shouldToolBeVisible(
                    tool.id,
                    newTimeframe
                );

                // ✅ Always apply — no early return guard
                lt.applyLineToolOptions({
                    id:       tool.id,
                    toolType: tool.toolType,
                    options:  { ...tool.options, visible }
                });
            });

        } catch (error) {
            console.error('❌ applyTFVisibility failed:', error);
        }
    }

    // ==================== ALL TF TOGGLE ====================

    public setToolAllTF(toolId: string, allTF: boolean): void {
        this.persistence.setAllTF(toolId, allTF);
        // ✅ Apply visibility immediately after toggle
        this.applyTFVisibility(this.currentTimeframe());
        console.log(`📐 Tool ${toolId} allTF set to ${allTF}`);
    }

    public getToolMeta(toolId: string): ToolMeta | null {
        return this.persistence.getMeta(toolId);
    }
}

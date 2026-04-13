// ================================================================
// 🎨 DRAWING TF MANAGER - TF/Symbol switch + visibility
// ================================================================

import { DrawingPersistence, ToolMeta } from './drawing-persistence';
import { TF_INTERVALS }                 from './drawing-constants';

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

    // ✅ Now uses persistence.shouldToolBeVisible — single source of truth
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

                // ✅ Only apply if visibility needs to change
                if (tool.options?.visible === visible) return;

                lt.applyLineToolOptions({
                    id:       tool.id,
                    toolType: tool.toolType,
                    options:  { ...tool.options, visible }
                });

                // ✅ Snap timestamps for allTF tools
                const meta = this.persistence.getMeta(tool.id);
                if (meta?.allTF && !meta.deleted && tool.points?.length > 0) {
                    const snappedPoints = this.snapPoints(tool.points, newTimeframe);
                    if (snappedPoints) {
                        lt.applyLineToolOptions({
                            id:       tool.id,
                            toolType: tool.toolType,
                            options:  { ...tool.options, visible },
                            points:   snappedPoints
                        });
                    }
                }
            });

        } catch (error) {
            console.error('❌ applyTFVisibility failed:', error);
        }
    }

    // ==================== SNAP ====================

    public snapPoints(points: any[], timeframe: string): any[] | null {
        if (!Array.isArray(points) || points.length === 0) return null;
        const interval = TF_INTERVALS[timeframe];
        if (!interval) return null;

        return points.map(point => ({
            ...point,
            timestamp: point.timestamp
                ? Math.floor(point.timestamp / interval) * interval
                : point.timestamp
        }));
    }

    // ==================== ALL TF TOGGLE ====================

    public setToolAllTF(toolId: string, allTF: boolean): void {
        this.persistence.setAllTF(toolId, allTF);
        // ✅ Apply visibility immediately to current TF — no flicker on toggle
        this.applyTFVisibility(this.currentTimeframe());
        console.log(`📐 Tool ${toolId} allTF set to ${allTF}`);
    }

    public getToolMeta(toolId: string): ToolMeta | null {
        return this.persistence.getMeta(toolId);
    }
}

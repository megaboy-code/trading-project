// ================================================================
// 🤖 STRATEGY DRAWING MANAGER
// Owns full lifecycle of strategy drawing tools + legend entries
// Called by ModuleManager — no drawing logic leaks into it
// ================================================================

import { hexToRgba } from '../chart-utils';

interface IDrawingModule {
    injectStrategyMeta(toolId: string, symbol: string, timeframe: string, strategyKey: string): void;
    createOrUpdateLineTool(type: string, points: any[], options: any, id: string): Promise<void>;
    refreshVisibility(): void;
    removeStrategyDrawings(strategyKey: string, symbol: string, timeframe: string): void;
}

interface IStrategiesModule {
    addStrategy(item: any): void;
}

interface DeployedStrategy {
    strategyKey: string;
    symbol:      string;
    timeframe:   string;
    color:       string;
}

export class StrategyDrawingManager {

    // ── Guard — prevent duplicate legend entries on incremental updates ──
    private deployedStrategyLegendIds = new Set<string>();

    // ── Store deployed strategies for TF/symbol switch re-add ──
    private deployedStrategies: Map<string, DeployedStrategy> = new Map();

    constructor(
        private drawingModule:      IDrawingModule,
        private strategiesInstance: IStrategiesModule | null,
        private updateBadge:        () => void
    ) {}

    // ================================================================
    // ON DATA — called from ModuleManager on onStrategyDrawingUpdate
    // ================================================================

    public async onData(data: any): Promise<void> {
        const firstDrawing = data.drawings[0];
        if (!firstDrawing) return;

        await Promise.all(data.drawings.map(async (drawing: any) => {
            const points = drawing.points.map((p: any) => ({
                timestamp: p.timestamp,
                price:     p.price
            }));

            const options = this.buildOptions(drawing);

            // ✅ Inject meta FIRST — saveDrawings() sees strategy:true
            // and skips localStorage persistence
            this.drawingModule.injectStrategyMeta(
                drawing.id,
                drawing.symbol,
                drawing.timeframe,
                data.strategy_key
            );

            await this.drawingModule.createOrUpdateLineTool(
                drawing.tool_type,
                points,
                options,
                drawing.id
            );
        }));

        // ✅ Re-apply visibility after all tools placed
        this.drawingModule.refreshVisibility();

        // ── Legend + panel — only once per strategy per TF ──
        const legendId = `${data.strategy_key}_${firstDrawing.symbol}_${firstDrawing.timeframe}`;

        if (!this.deployedStrategyLegendIds.has(legendId)) {
            this.deployedStrategyLegendIds.add(legendId);

            // ── Store for TF/symbol switch re-add ──
            this.deployedStrategies.set(legendId, {
                strategyKey: data.strategy_key,
                symbol:      firstDrawing.symbol,
                timeframe:   firstDrawing.timeframe,
                color:       firstDrawing.color ?? '#00d394'
            });

            this.addLegendEntry(
                legendId,
                data.strategy_key,
                firstDrawing.symbol,
                firstDrawing.timeframe,
                firstDrawing.color ?? '#00d394'
            );
        }
    }

    // ================================================================
    // BUILD OPTIONS — maps decoded drawing fields to tool options
    // ================================================================

    private buildOptions(drawing: any): any {
        const borderColor = hexToRgba(drawing.color, drawing.border_opacity);
        const fillColor   = drawing.fill_color
            ? hexToRgba(drawing.fill_color, drawing.fill_opacity)
            : hexToRgba(drawing.color,      drawing.fill_opacity);

        const base: any = {
            showPriceAxisLabels: drawing.show_price_labels,
            showTimeAxisLabels:  drawing.show_time_labels,
            locked:              true,
            editable:            false,
            defaultHoverCursor:  'default'
        };

        switch (drawing.tool_type) {

            case 'Rectangle':
                return {
                    ...base,
                    rectangle: {
                        background: { color: fillColor },
                        border: {
                            color:  borderColor,
                            width:  drawing.border_width,
                            style:  drawing.border_style,
                            radius: drawing.border_radius
                        },
                        extend: {
                            left:  drawing.extend_left,
                            right: drawing.extend_right
                        }
                    },
                    text: this.buildTextOptions(drawing)
                };

            case 'ParallelChannel':
                return {
                    ...base,
                    channelLine: {
                        color: borderColor,
                        width: drawing.border_width,
                        style: drawing.border_style
                    },
                    showMiddleLine: drawing.show_middle_line,
                    middleLine: {
                        color: drawing.middle_line_color || borderColor,
                        width: drawing.middle_line_width,
                        style: drawing.middle_line_style
                    },
                    background: { color: fillColor },
                    extend: {
                        left:  drawing.extend_left,
                        right: drawing.extend_right
                    },
                    text: this.buildTextOptions(drawing)
                };

            case 'TrendLine':
            case 'Ray':
            case 'ExtendedLine':
            case 'HorizontalLine':
            case 'HorizontalRay':
            case 'VerticalLine':
            case 'Arrow':
                return {
                    ...base,
                    line: {
                        color: borderColor,
                        width: drawing.border_width,
                        style: drawing.border_style
                    },
                    extend: {
                        left:  drawing.extend_left,
                        right: drawing.extend_right
                    },
                    text: this.buildTextOptions(drawing)
                };

            default:
                // ── Fallback — rectangle layout ──
                return {
                    ...base,
                    rectangle: {
                        background: { color: fillColor },
                        border: {
                            color:  borderColor,
                            width:  drawing.border_width,
                            style:  drawing.border_style,
                            radius: drawing.border_radius
                        },
                        extend: {
                            left:  drawing.extend_left,
                            right: drawing.extend_right
                        }
                    },
                    text: this.buildTextOptions(drawing)
                };
        }
    }

    // ================================================================
    // BUILD TEXT OPTIONS — shared across tool types
    // ================================================================

    private buildTextOptions(drawing: any): any {
        if (!drawing.text) return undefined;
        return {
            value: drawing.text,
            font: {
                size:  drawing.font_size,
                color: drawing.font_color || drawing.color,
                bold:  drawing.font_bold,
                style: drawing.font_italic ? 'italic' : 'normal'
            },
            align: {
                h: drawing.text_align_h,
                v: drawing.text_align_v
            }
        };
    }

    // ================================================================
    // ON STRATEGY REMOVE — called from ModuleManager remove-strategy
    // ================================================================

    public onStrategyRemove(
        strategyKey: string,
        symbol:      string,
        timeframe:   string
    ): void {
        const legendId = `${strategyKey}_${symbol}_${timeframe}`;

        this.deployedStrategyLegendIds.delete(legendId);
        this.deployedStrategies.delete(legendId);

        this.drawingModule.removeStrategyDrawings(strategyKey, symbol, timeframe);
    }

    // ================================================================
    // ON TF CHANGE — called from ModuleManager timeframe-changed
    // ── Detaches legend DOM only — no cascade into remove-strategy ──
    // ── Drawing tools hide themselves via applyTFVisibility ──
    // ── Hard remove only happens via X button → legend-item-remove ──
    // ================================================================

    public onTFChange(oldTF: string, newTF: string): void {
        // ── Detach legend entries for old TF — DOM only, no cascade ──
        const toDetach: string[] = [];

        this.deployedStrategyLegendIds.forEach(id => {
            if (id.endsWith(`_${oldTF}`)) {
                toDetach.push(id);
            }
        });

        toDetach.forEach(id => {
            this.deployedStrategyLegendIds.delete(id);
            document.dispatchEvent(new CustomEvent('legend-item-detach', {
                detail: { id }
            }));
        });

        // ── Re-add legend entries for new TF if already deployed ──
        this.deployedStrategies.forEach((strategy, legendId) => {
            if (strategy.timeframe === newTF &&
                !this.deployedStrategyLegendIds.has(legendId))
            {
                this.deployedStrategyLegendIds.add(legendId);
                this.addLegendEntry(
                    legendId,
                    strategy.strategyKey,
                    strategy.symbol,
                    strategy.timeframe,
                    strategy.color
                );
            }
        });
    }

    // ================================================================
    // ON SYMBOL CHANGE — called from ModuleManager symbol-changed
    // ── Same pattern as onTFChange but matches by symbol ──
    // ── Frontend handles drawing visibility — legend detach only ──
    // ================================================================

    public onSymbolChange(oldSymbol: string, newSymbol: string): void {
        // ── Detach legend entries for old symbol — DOM only, no cascade ──
        const toDetach: string[] = [];

        this.deployedStrategyLegendIds.forEach(id => {
            const strategy = this.deployedStrategies.get(id);
            if (strategy && strategy.symbol === oldSymbol) {
                toDetach.push(id);
            }
        });

        toDetach.forEach(id => {
            this.deployedStrategyLegendIds.delete(id);
            document.dispatchEvent(new CustomEvent('legend-item-detach', {
                detail: { id }
            }));
        });

        // ── Re-add legend entries for new symbol if already deployed ──
        this.deployedStrategies.forEach((strategy, legendId) => {
            if (strategy.symbol === newSymbol &&
                !this.deployedStrategyLegendIds.has(legendId))
            {
                this.deployedStrategyLegendIds.add(legendId);
                this.addLegendEntry(
                    legendId,
                    strategy.strategyKey,
                    strategy.symbol,
                    strategy.timeframe,
                    strategy.color
                );
            }
        });
    }

    // ================================================================
    // PRIVATE — add legend + panel entry
    // ================================================================

    private addLegendEntry(
        legendId:    string,
        strategyKey: string,
        symbol:      string,
        timeframe:   string,
        color:       string
    ): void {
        document.dispatchEvent(new CustomEvent('indicator-added', {
            detail: {
                id:       legendId,
                name:     strategyKey,
                color,
                icon:     'fa-robot',
                pane:     null,
                values:   [],
                settings: {}
            }
        }));

        this.strategiesInstance?.addStrategy({
            id:        legendId,
            name:      strategyKey,
            symbol,
            tf:        timeframe,
            status:    'running',
            pnl:       null,
            trades:    0,
            winrate:   null,
            volume:    0.01,
            risk:      1.0,
            iconColor: 'green'
        });

        this.updateBadge();
    }
}

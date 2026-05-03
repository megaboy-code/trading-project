// ================================================================
// 🤖 STRATEGY DRAWING MANAGER
// Owns full lifecycle of strategy drawing tools only
// Legend owned by indicator-manager — fires events, never touches legend directly
// strategy-legend-add  → indicator-manager adds legend entry with guard
// strategy-legend-remove → indicator-manager cleans legendIds
// ================================================================

import { hexToRgba } from '../chart-utils';

interface IDrawingModule {
    injectStrategyMeta(toolId: string, symbol: string, timeframe: string, strategyKey: string): void;
    createOrUpdateLineTool(type: string, points: any[], options: any, id: string): Promise<void>;
    refreshVisibility(): void;
    removeStrategyDrawings(strategyKey: string, symbol: string, timeframe: string): void;
    softDeleteDrawingById(id: string): void;
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

    // ── Deployed strategies — source of truth for TF/symbol switch ──
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

        await Promise.all(data.drawings.map(async (drawing: any) => {
            const points = drawing.points.map((p: any) => ({
                timestamp: p.timestamp,
                price:     p.price
            }));

            const options = this.buildOptions(drawing);

            // ── Inject meta FIRST — saveDrawings() sees strategy:true ──
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

        // ── Soft delete removed_ids ──
        for (const id of data.removed_ids ?? []) {
            this.drawingModule.softDeleteDrawingById(id);
        }

        // ── Re-apply visibility after all tools placed + removals ──
        this.drawingModule.refreshVisibility();

        // ── Panel + legend — only once per strategy per TF ──
        if (!firstDrawing) return;

        const legendId = `${data.strategy_key}_${firstDrawing.symbol}_${firstDrawing.timeframe}`;

        // ── Store for TF/symbol switch re-add ──
        // ── Always update even if already stored — color may change ──
        if (!this.deployedStrategies.has(legendId)) {
            this.deployedStrategies.set(legendId, {
                strategyKey: data.strategy_key,
                symbol:      firstDrawing.symbol,
                timeframe:   firstDrawing.timeframe,
                color:       firstDrawing.color ?? '#00d394'
            });

            // ── Fire event — indicator-manager owns legend add + guard ──
            this.fireLegendAdd(
                legendId,
                data.strategy_key,
                firstDrawing.symbol,
                firstDrawing.timeframe,
                firstDrawing.color ?? '#00d394'
            );

            // ── Panel — strategies module owns panel entry ──
            this.addPanelEntry(
                legendId,
                data.strategy_key,
                firstDrawing.symbol,
                firstDrawing.timeframe
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

            case 'Text':
                return {
                    ...base,
                    text: this.buildTextOptions(drawing)
                };

            default:
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
    // BUILD TEXT OPTIONS
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
            box: {
                alignment: {
                    horizontal: drawing.text_align_h,
                    vertical:   drawing.text_align_v
                }
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

        this.deployedStrategies.delete(legendId);

        // ── Fire remove event — indicator-manager cleans legendIds ──
        document.dispatchEvent(new CustomEvent('strategy-legend-remove', {
            detail: { legendId }
        }));

        this.drawingModule.removeStrategyDrawings(strategyKey, symbol, timeframe);
    }

    // ================================================================
    // ON TF CHANGE — drawing tools hide via applyTFVisibility
    // Legend detach — fire event, indicator-manager handles
    // Re-add legend for new TF if already deployed
    // ================================================================

    public onTFChange(oldTF: string, newTF: string): void {
        // ── Detach legend entries for old TF ──
        this.deployedStrategies.forEach((strategy, legendId) => {
            if (strategy.timeframe === oldTF) {
                document.dispatchEvent(new CustomEvent('legend-item-detach', {
                    detail: { id: legendId }
                }));
                // ── Tell indicator-manager to clean its legendIds ──
                document.dispatchEvent(new CustomEvent('strategy-legend-remove', {
                    detail: { legendId }
                }));
            }
        });

        // ── Re-add legend entries for new TF if already deployed ──
        this.deployedStrategies.forEach((strategy, legendId) => {
            if (strategy.timeframe === newTF) {
                this.fireLegendAdd(
                    legendId,
                    strategy.strategyKey,
                    strategy.symbol,
                    strategy.timeframe,
                    strategy.color
                );

                this.addPanelEntry(
                    legendId,
                    strategy.strategyKey,
                    strategy.symbol,
                    strategy.timeframe
                );
            }
        });
    }

    // ================================================================
    // ON SYMBOL CHANGE — same pattern as onTFChange but by symbol
    // ================================================================

    public onSymbolChange(oldSymbol: string, newSymbol: string): void {
        // ── Detach legend entries for old symbol ──
        this.deployedStrategies.forEach((strategy, legendId) => {
            if (strategy.symbol === oldSymbol) {
                document.dispatchEvent(new CustomEvent('legend-item-detach', {
                    detail: { id: legendId }
                }));
                document.dispatchEvent(new CustomEvent('strategy-legend-remove', {
                    detail: { legendId }
                }));
            }
        });

        // ── Re-add legend entries for new symbol if already deployed ──
        this.deployedStrategies.forEach((strategy, legendId) => {
            if (strategy.symbol === newSymbol) {
                this.fireLegendAdd(
                    legendId,
                    strategy.strategyKey,
                    strategy.symbol,
                    strategy.timeframe,
                    strategy.color
                );

                this.addPanelEntry(
                    legendId,
                    strategy.strategyKey,
                    strategy.symbol,
                    strategy.timeframe
                );
            }
        });
    }

    // ================================================================
    // PRIVATE — fire legend add event
    // indicator-manager owns the guard — no duplicate check here
    // ================================================================

    private fireLegendAdd(
        legendId:    string,
        strategyKey: string,
        symbol:      string,
        timeframe:   string,
        color:       string
    ): void {
        document.dispatchEvent(new CustomEvent('strategy-legend-add', {
            detail: { legendId, strategyKey, symbol, timeframe, color }
        }));
    }

    // ================================================================
    // PRIVATE — add panel entry
    // Strategies panel is separate from legend — always add
    // ================================================================

    private addPanelEntry(
        legendId:    string,
        strategyKey: string,
        symbol:      string,
        timeframe:   string
    ): void {
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

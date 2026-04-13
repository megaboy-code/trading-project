// ================================================================
// 🎨 DRAWING PERSISTENCE - Save, load, purge drawing tools
// ================================================================

import { TF_INTERVALS } from './drawing-constants';

const NON_PERSISTENT_TOOLS = new Set<string>(['TradeArrow']);

export interface ToolMeta {
    timeframe: string;
    symbol:    string;
    allTF:     boolean;
    deleted:   boolean;
}

export class DrawingPersistence {
    private _metaMap: Map<string, ToolMeta> = new Map();

    constructor(
        private lineTools:        () => any,
        private isInitialized:    () => boolean,
        private currentSymbol:    () => string,
        private currentTimeframe: () => string
    ) {}

    private get STORAGE_KEY(): string {
        return `chart_drawings_${this.currentSymbol()}_${this.currentTimeframe()}`;
    }

    // ✅ Shared key for allTF tools — per symbol, not per TF
    private get ALL_STORAGE_KEY(): string {
        return `chart_drawings_${this.currentSymbol()}_ALL`;
    }

    public storageKeyFor(symbol: string, timeframe: string): string {
        return `chart_drawings_${symbol}_${timeframe}`;
    }

    public allStorageKeyFor(symbol: string): string {
        return `chart_drawings_${symbol}_ALL`;
    }

    // ==================== VISIBILITY RESOLVER ====================

    // ✅ Single source of truth for tool visibility
    // deleted   → always hidden
    // allTF     → always visible
    // per-TF    → only visible on matching timeframe
    public shouldToolBeVisible(toolId: string, timeframe: string): boolean {
        const meta = this._metaMap.get(toolId);
        if (!meta) return true;
        if (meta.deleted) return false;
        if (meta.allTF) return true;
        return meta.timeframe === timeframe;
    }

    // ==================== META ====================

    public getMeta(toolId: string): ToolMeta | null {
        return this._metaMap.get(toolId) ?? null;
    }

    public setMeta(toolId: string, meta: ToolMeta): void {
        this._metaMap.set(toolId, meta);
    }

    public deleteMeta(toolId: string): void {
        const meta = this._metaMap.get(toolId);
        if (meta) {
            meta.deleted = true;
            this._metaMap.set(toolId, meta);
        } else {
            this._metaMap.set(toolId, {
                timeframe: this.currentTimeframe(),
                symbol:    this.currentSymbol(),
                allTF:     true,
                deleted:   true
            });
        }
    }

    public injectMeta(toolId: string, symbol: string, timeframe: string): void {
        if (!this._metaMap.has(toolId)) {
            this._metaMap.set(toolId, {
                timeframe,
                symbol,
                allTF:   false,
                deleted: false
            });
        }
    }

    public setAllTF(toolId: string, allTF: boolean): void {
        const meta = this._metaMap.get(toolId);
        if (!meta) return;
        meta.allTF = allTF;
        this._metaMap.set(toolId, meta);
        this.saveDrawings();
    }

    public clearMeta(): void {
        this._metaMap.clear();
    }

    // ==================== SAVE ====================

    public saveDrawings(storageKey?: string): void {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;
        try {
            const allDrawings = this.exportDrawings();
            const tools       = JSON.parse(allDrawings);
            if (!Array.isArray(tools)) return;

            const allTFTools:  any[] = [];
            const perTFTools:  any[] = [];

            tools
                .filter((t: any) => !NON_PERSISTENT_TOOLS.has(t.toolType))
                .filter((t: any) => t.points && t.points.length > 0)
                .forEach((t: any) => {
                    const meta = this._metaMap.get(t.id) ?? {
                        timeframe: this.currentTimeframe(),
                        symbol:    this.currentSymbol(),
                        allTF:     true,
                        deleted:   false
                    };

                    if (meta.deleted) return;

                    const entry = {
                        ...t,
                        options: { ...t.options, visible: true },
                        _meta:   meta
                    };

                    if (meta.allTF) {
                        allTFTools.push(entry);
                    } else {
                        perTFTools.push(entry);
                    }
                });

            // ✅ allTF tools → ALL key
            localStorage.setItem(this.ALL_STORAGE_KEY, JSON.stringify(allTFTools));

            // ✅ per-TF tools → TF key (or custom key if provided)
            const key = storageKey ?? this.STORAGE_KEY;
            localStorage.setItem(key, JSON.stringify(perTFTools));

        } catch (error) {
            console.error('❌ Failed to save drawings:', error);
        }
    }

    // ==================== PURGE ====================

    public purgeAndSave(): void {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;
        try {
            const allDrawings = this.exportDrawings();
            const tools       = JSON.parse(allDrawings);
            if (!Array.isArray(tools)) return;

            const deletedIds:  string[] = [];
            const allTFTools:  any[] = [];
            const perTFTools:  any[] = [];

            tools
                .filter((t: any) => !NON_PERSISTENT_TOOLS.has(t.toolType))
                .filter((t: any) => t.points && t.points.length > 0)
                .forEach((t: any) => {
                    const meta = this._metaMap.get(t.id) ?? {
                        timeframe: this.currentTimeframe(),
                        symbol:    this.currentSymbol(),
                        allTF:     true,
                        deleted:   false
                    };

                    if (meta.deleted) {
                        deletedIds.push(t.id);
                        return;
                    }

                    const entry = {
                        ...t,
                        options: { ...t.options, visible: true },
                        _meta:   meta
                    };

                    if (meta.allTF) {
                        allTFTools.push(entry);
                    } else {
                        perTFTools.push(entry);
                    }
                });

            // ✅ Save split
            localStorage.setItem(this.ALL_STORAGE_KEY, JSON.stringify(allTFTools));
            localStorage.setItem(this.STORAGE_KEY,     JSON.stringify(perTFTools));

            // ✅ Ghost deleted tools from engine
            if (deletedIds.length > 0 && typeof lt.removeLineToolsById === 'function') {
                lt.removeLineToolsById(deletedIds);
            }

        } catch (error) {
            console.error('❌ Failed to purge and save drawings:', error);
        }
    }

    // ==================== LOAD ====================

    public async loadDrawings(
        loadAndRegisterGroup: (group: string) => Promise<void>,
        TOOL_GROUP_MAP: Record<string, string>
    ): Promise<void> {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;
        try {
            // ✅ Load both ALL key and TF key
            const savedAll = localStorage.getItem(this.ALL_STORAGE_KEY);
            const savedTF  = localStorage.getItem(this.STORAGE_KEY);

            const allTFTools = savedAll && savedAll !== '[]' ? JSON.parse(savedAll) : [];
            const perTFTools = savedTF  && savedTF  !== '[]' ? JSON.parse(savedTF)  : [];

            // ✅ Merge both sets
            const tools = [
                ...(Array.isArray(allTFTools) ? allTFTools : []),
                ...(Array.isArray(perTFTools) ? perTFTools : [])
            ];

            if (tools.length === 0) {
                console.log(`📋 No drawings for ${this.currentSymbol()} ${this.currentTimeframe()}`);
                return;
            }

            // ✅ Load required tool groups
            const groupsNeeded = new Set<string>();
            tools.forEach((tool: any) => {
                if (NON_PERSISTENT_TOOLS.has(tool.toolType)) return;
                if (tool._meta?.deleted) return;
                const group = TOOL_GROUP_MAP[tool.toolType];
                if (group) groupsNeeded.add(group);
            });

            await Promise.all(
                Array.from(groupsNeeded).map(g => loadAndRegisterGroup(g))
            );

            // ✅ Filter deleted
            const persistable = tools.filter((t: any) =>
                !NON_PERSISTENT_TOOLS.has(t.toolType) &&
                !t._meta?.deleted
            );

            if (persistable.length === 0) {
                console.log(`📋 No drawings for ${this.currentSymbol()} ${this.currentTimeframe()}`);
                return;
            }

            // ✅ Inject meta — never overwrite deleted:true
            persistable.forEach((t: any) => {
                if (t._meta && t.id) {
                    const existingMeta = this._metaMap.get(t.id);
                    if (existingMeta?.deleted) return;
                    this._metaMap.set(t.id, t._meta);
                }
            });

            // ✅ Build clean tools with correct visibility from shouldToolBeVisible
            const cleanTools = persistable
                .filter((t: any) => {
                    const meta = this._metaMap.get(t.id);
                    return !meta?.deleted;
                })
                .map(({ _meta, ...rest }: any) => ({
                    ...rest,
                    options: {
                        ...rest.options,
                        visible: this.shouldToolBeVisible(rest.id, this.currentTimeframe())
                    }
                }));

            // ✅ Snap allTF tool points to current TF candle opens on load
            const interval = TF_INTERVALS[this.currentTimeframe()];
            const snappedTools = cleanTools.map((t: any) => {
                const meta = this._metaMap.get(t.id);
                if (meta?.allTF && t.points?.length > 0 && interval) {
                    return {
                        ...t,
                        points: t.points.map((p: any) => ({
                            ...p,
                            timestamp: p.timestamp
                                ? Math.floor(p.timestamp / interval) * interval
                                : p.timestamp
                        }))
                    };
                }
                return t;
            });

            if (snappedTools.length > 0) {
                this.importDrawings(JSON.stringify(snappedTools));
            }

            console.log(`✅ Drawings restored for ${this.currentSymbol()} ${this.currentTimeframe()}`);

        } catch (error) {
            console.error('❌ Failed to load drawings:', error);
        }
    }

    // ==================== REMOVE ONE FROM STORAGE ====================

    public removeToolFromStorage(toolId: string): void {
        try {
            const meta = this._metaMap.get(toolId);

            if (meta?.allTF) {
                // ✅ allTF tool — remove from ALL key only
                const saved = localStorage.getItem(this.ALL_STORAGE_KEY);
                if (!saved) return;
                const tools    = JSON.parse(saved);
                if (!Array.isArray(tools)) return;
                const filtered = tools.filter((t: any) => t.id !== toolId);
                localStorage.setItem(this.ALL_STORAGE_KEY, JSON.stringify(filtered));
            } else {
                // ✅ per-TF tool — remove from TF key only
                const saved = localStorage.getItem(this.STORAGE_KEY);
                if (!saved) return;
                const tools    = JSON.parse(saved);
                if (!Array.isArray(tools)) return;
                const filtered = tools.filter((t: any) => t.id !== toolId);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
            }
        } catch (error) {
            console.error('❌ Failed to remove tool from storage:', error);
        }
    }

    // ==================== EXPORT / IMPORT ====================

    public exportDrawings(): string {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return '[]';
        try {
            if (typeof lt.exportLineTools === 'function') {
                return lt.exportLineTools();
            }
        } catch (error) {
            console.error('❌ Failed to export drawings:', error);
        }
        return '[]';
    }

    public importDrawings(json: string): void {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;
        try {
            if (typeof lt.importLineTools === 'function') {
                lt.importLineTools(json);
                console.log('✅ Drawings imported successfully');
            }
        } catch (error) {
            console.error('❌ Failed to import drawings:', error);
        }
    }

    public clearSavedDrawings(): void {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem(this.ALL_STORAGE_KEY);
        } catch (error) {
            console.error('❌ Failed to clear saved drawings:', error);
        }
    }
}

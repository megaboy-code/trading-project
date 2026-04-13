// ================================================================
// 🎨 DRAWING PERSISTENCE - Save, load, purge drawing tools
// ================================================================

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

    public storageKeyFor(symbol: string, timeframe: string): string {
        return `chart_drawings_${symbol}_${timeframe}`;
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
                allTF:   true,
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

            const persistable = Array.isArray(tools)
                ? tools
                    .filter((t: any) => !NON_PERSISTENT_TOOLS.has(t.toolType))
                    .filter((t: any) => t.points && t.points.length > 0)
                    .filter((t: any) => {
                        const meta = this._metaMap.get(t.id);
                        return !meta?.deleted;
                    })
                    .map((t: any) => ({
                        ...t,
                        // ✅ Always save visible:true — shouldToolBeVisible
                        // resolves correct visibility on load
                        options: { ...t.options, visible: true },
                        _meta: this._metaMap.get(t.id) ?? {
                            timeframe: this.currentTimeframe(),
                            symbol:    this.currentSymbol(),
                            allTF:     true,
                            deleted:   false
                        }
                    }))
                : [];

            const key = storageKey ?? this.STORAGE_KEY;
            localStorage.setItem(key, JSON.stringify(persistable));
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

            const deletedIds: string[] = [];

            const persistable = Array.isArray(tools)
                ? tools
                    .filter((t: any) => !NON_PERSISTENT_TOOLS.has(t.toolType))
                    .filter((t: any) => t.points && t.points.length > 0)
                    .map((t: any) => ({
                        ...t,
                        options: { ...t.options, visible: true },
                        _meta: this._metaMap.get(t.id) ?? {
                            timeframe: this.currentTimeframe(),
                            symbol:    this.currentSymbol(),
                            allTF:     true,
                            deleted:   false
                        }
                    }))
                    .filter((t: any) => {
                        if (t._meta.deleted) {
                            deletedIds.push(t.id);
                            return false;
                        }
                        return true;
                    })
                : [];

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(persistable));

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
            const saved = localStorage.getItem(this.STORAGE_KEY);

            if (saved && saved !== '[]') {
                const tools = JSON.parse(saved);

                if (Array.isArray(tools) && tools.length > 0) {
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
                }

                const persistable = Array.isArray(tools)
                    ? tools.filter((t: any) =>
                        !NON_PERSISTENT_TOOLS.has(t.toolType) &&
                        !t._meta?.deleted
                    )
                    : [];

                if (persistable.length > 0) {
                    persistable.forEach((t: any) => {
                        if (t._meta && t.id) {
                            // ✅ Never overwrite deleted:true with saved deleted:false
                            const existingMeta = this._metaMap.get(t.id);
                            if (existingMeta?.deleted) return;
                            this._metaMap.set(t.id, t._meta);
                        }
                    });

                    // ✅ Use shouldToolBeVisible — correct visibility at import time
                    // No post-patch applyTFVisibility needed
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

                    if (cleanTools.length > 0) {
                        this.importDrawings(JSON.stringify(cleanTools));
                    }
                }

                console.log(`✅ Drawings restored for ${this.currentSymbol()} ${this.currentTimeframe()}`);
            } else {
                console.log(`📋 No drawings for ${this.currentSymbol()} ${this.currentTimeframe()}`);
            }

        } catch (error) {
            console.error('❌ Failed to load drawings:', error);
        }
    }

    // ==================== REMOVE ONE FROM STORAGE ====================

    public removeToolFromStorage(toolId: string): void {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) return;
            const tools    = JSON.parse(saved);
            if (!Array.isArray(tools)) return;
            const filtered = tools.filter((t: any) => t.id !== toolId);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
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
        } catch (error) {
            console.error('❌ Failed to clear saved drawings:', error);
        }
    }
}
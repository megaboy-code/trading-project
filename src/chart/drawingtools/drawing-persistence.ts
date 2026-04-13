// ================================================================
// 🎨 DRAWING PERSISTENCE - Save, load, purge drawing tools
// ================================================================

import { TF_INTERVALS } from './drawing-constants';

const NON_PERSISTENT_TOOLS = new Set<string>(['TradeArrow']);
const GLOBAL_STORAGE_KEY   = 'chart_drawings_all';
const MIGRATED_FLAG_KEY    = 'chart_drawings_migrated_v2';

export interface ToolMeta {
    timeframe: string;
    symbol:    string;
    allTF:     boolean;
    deleted:   boolean;
}

interface StoredTool {
    id:       string;
    toolType: string;
    points:   any[];
    options:  any;
    _meta:    ToolMeta;
}

export class DrawingPersistence {
    private _metaMap: Map<string, ToolMeta> = new Map();

    constructor(
        private lineTools:        () => any,
        private isInitialized:    () => boolean,
        private currentSymbol:    () => string,
        private currentTimeframe: () => string
    ) {}

    // ==================== MIGRATION ====================

    // ✅ One-time migration — clear all old per-symbol-TF keys
    private migrateOldKeys(): void {
        if (localStorage.getItem(MIGRATED_FLAG_KEY)) return;
        try {
            Object.keys(localStorage)
                .filter(k =>
                    k.startsWith('chart_drawings_') &&
                    k !== GLOBAL_STORAGE_KEY &&
                    k !== MIGRATED_FLAG_KEY
                )
                .forEach(k => localStorage.removeItem(k));

            localStorage.setItem(MIGRATED_FLAG_KEY, '1');
            console.log('✅ Drawing storage migrated to global key');
        } catch (error) {
            console.error('❌ Migration failed:', error);
        }
    }

    // ==================== GLOBAL STORAGE HELPERS ====================

    private readAllTools(): StoredTool[] {
        try {
            const saved = localStorage.getItem(GLOBAL_STORAGE_KEY);
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private writeAllTools(tools: StoredTool[]): void {
        try {
            localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(tools));
        } catch (error) {
            console.error('❌ Failed to write tools to storage:', error);
        }
    }

    // ==================== VISIBILITY RESOLVER ====================

    public shouldToolBeVisible(toolId: string, timeframe: string): boolean {
        const meta = this._metaMap.get(toolId);
        if (!meta)          return true;
        if (meta.deleted)   return false;
        if (meta.allTF)     return true;
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

    public saveDrawings(): void {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;
        try {
            const engineExport = this.exportDrawings();
            const engineTools  = JSON.parse(engineExport);
            if (!Array.isArray(engineTools)) return;

            // ✅ Read existing global storage
            const existingTools = this.readAllTools();

            // ✅ Build map of existing tools by ID for merge
            const existingMap = new Map<string, StoredTool>();
            existingTools.forEach(t => existingMap.set(t.id, t));

            // ✅ Process current engine tools
            engineTools
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
                        // ✅ Remove deleted tools from global storage
                        existingMap.delete(t.id);
                        return;
                    }

                    existingMap.set(t.id, {
                        ...t,
                        options: { ...t.options, visible: true },
                        _meta:   meta
                    });
                });

            this.writeAllTools(Array.from(existingMap.values()));
        } catch (error) {
            console.error('❌ Failed to save drawings:', error);
        }
    }

    // ==================== PURGE ====================

    public purgeAndSave(): void {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;
        try {
            const engineExport = this.exportDrawings();
            const engineTools  = JSON.parse(engineExport);
            if (!Array.isArray(engineTools)) return;

            const deletedIds:  string[]      = [];
            const existingTools              = this.readAllTools();
            const existingMap                = new Map<string, StoredTool>();
            existingTools.forEach(t => existingMap.set(t.id, t));

            engineTools
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
                        existingMap.delete(t.id);
                        return;
                    }

                    existingMap.set(t.id, {
                        ...t,
                        options: { ...t.options, visible: true },
                        _meta:   meta
                    });
                });

            this.writeAllTools(Array.from(existingMap.values()));

            // ✅ Remove deleted ghosts from engine on destroy
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
        TOOL_GROUP_MAP:       Record<string, string>
    ): Promise<void> {
        const lt = this.lineTools();
        if (!lt || !this.isInitialized()) return;
        try {
            // ✅ Run one-time migration first
            this.migrateOldKeys();

            const allTools = this.readAllTools();

            if (allTools.length === 0) {
                console.log(`📋 No drawings for ${this.currentSymbol()} ${this.currentTimeframe()}`);
                return;
            }

            const symbol    = this.currentSymbol();
            const timeframe = this.currentTimeframe();

            // ✅ Filter tools for current symbol + TF
            // allTF tools show on any TF for the same symbol
            // per-TF tools only show on exact TF match
            const relevant = allTools.filter((t: StoredTool) => {
                if (!t._meta) return false;
                if (t._meta.deleted) return false;
                if (t._meta.symbol !== symbol) return false;
                return t._meta.allTF || t._meta.timeframe === timeframe;
            });

            if (relevant.length === 0) {
                console.log(`📋 No drawings for ${symbol} ${timeframe}`);
                return;
            }

            // ✅ Load required tool groups
            const groupsNeeded = new Set<string>();
            relevant.forEach((tool: StoredTool) => {
                if (NON_PERSISTENT_TOOLS.has(tool.toolType)) return;
                const group = TOOL_GROUP_MAP[tool.toolType];
                if (group) groupsNeeded.add(group);
            });

            await Promise.all(
                Array.from(groupsNeeded).map(g => loadAndRegisterGroup(g))
            );

            // ✅ Inject meta — never overwrite deleted:true
            relevant.forEach((t: StoredTool) => {
                if (t._meta && t.id) {
                    const existingMeta = this._metaMap.get(t.id);
                    if (existingMeta?.deleted) return;
                    this._metaMap.set(t.id, t._meta);
                }
            });

            // ✅ Build clean tools with correct visibility
            // Snap allTF tool timestamps to current TF bar grid
            const interval = TF_INTERVALS[timeframe];

            const cleanTools = relevant
                .filter((t: StoredTool) => {
                    const meta = this._metaMap.get(t.id);
                    return !meta?.deleted;
                })
                .map(({ _meta, ...rest }: any) => {
                    const meta    = this._metaMap.get(rest.id);
                    const visible = this.shouldToolBeVisible(rest.id, timeframe);

                    // ✅ Snap timestamps for allTF tools
                    let points = rest.points;
                    if (meta?.allTF && points?.length > 0 && interval) {
                        points = points.map((p: any) => ({
                            ...p,
                            timestamp: p.timestamp
                                ? Math.floor(p.timestamp / interval) * interval
                                : p.timestamp
                        }));
                    }

                    return {
                        ...rest,
                        points,
                        options: { ...rest.options, visible }
                    };
                });

            if (cleanTools.length > 0) {
                this.importDrawings(JSON.stringify(cleanTools));
            }

            console.log(`✅ Drawings restored for ${symbol} ${timeframe}`);

        } catch (error) {
            console.error('❌ Failed to load drawings:', error);
        }
    }

    // ==================== REMOVE ONE FROM STORAGE ====================

    // ✅ Single key — just filter by ID
    public removeToolFromStorage(toolId: string): void {
        try {
            const tools    = this.readAllTools();
            const filtered = tools.filter(t => t.id !== toolId);
            this.writeAllTools(filtered);
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
            // ✅ Only remove tools for current symbol from global storage
            const tools    = this.readAllTools();
            const symbol   = this.currentSymbol();
            const filtered = tools.filter(t => t._meta?.symbol !== symbol);
            this.writeAllTools(filtered);
        } catch (error) {
            console.error('❌ Failed to clear saved drawings:', error);
        }
    }
}

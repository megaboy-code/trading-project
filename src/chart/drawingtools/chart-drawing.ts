// ================================================================
// 🎨 CHART DRAWING - Orchestrator
// ================================================================

import {
  IChartApi,
  ISeriesApi,
  SeriesType
} from 'lightweight-charts';

import { createLineToolsPlugin } from 'lightweight-charts-line-tools-core';
import { DrawingToolbar }        from './ui/drawing-toolbar';
import { DrawingPersistence }    from './drawing-persistence';
import { DrawingTFManager }      from './drawing-tf-manager';
import { DrawingTradeArrows }    from './drawing-trade-arrows';

// ==================== TOOL GROUP MAP ====================

const TOOL_GROUP_MAP: Record<string, string> = {
  TrendLine:         'lines',
  Ray:               'lines',
  Arrow:             'lines',
  ExtendedLine:      'lines',
  HorizontalLine:    'lines',
  HorizontalRay:     'lines',
  VerticalLine:      'lines',
  CrossLine:         'lines',
  Callout:           'lines',
  Rectangle:         'shapes',
  Circle:            'shapes',
  Triangle:          'shapes',
  Text:              'text',
  ParallelChannel:   'advanced',
  FibRetracement:    'advanced',
  PriceRange:        'advanced',
  Path:              'advanced',
  Brush:             'freehand',
  Highlighter:       'freehand',
  LongShortPosition: 'position',
  TradeArrow:        'signals',
};

const registeredGroups = new Set<string>();

export interface DrawingToolsConfig {
  precision:      number;
  showLabels:     boolean;
  priceFormatter: (price: number) => string;
}

export class ChartDrawingModule {
  private lineTools:     any = null;
  private chart:         IChartApi | null = null;
  private series:        ISeriesApi<SeriesType> | null = null;
  private config:        DrawingToolsConfig;
  private isInitialized: boolean = false;

  private toolbar: DrawingToolbar | null = null;

  private isDrawingActive:   boolean = false;
  private isSelectionMode:   boolean = false;
  private lastCrosshairTime: number = 0;
  private readonly CROSSHAIR_THROTTLE_MS = 16;

  private pendingToolFormatting: any[] = [];
  private formatBatchTimeout:    number | null = null;

  private eventHandlers: { [key: string]: any } = {};

  private setDrawingStateCallback?:   (active: boolean) => void;
  private setSelectionStateCallback?: (active: boolean) => void;

  private themeObserver: MutationObserver | null = null;

  private _currentSymbol:    string;
  private _currentTimeframe: string;

  // ✅ Fix 1 — chart type switch flag
  private _isSwitchingChartType: boolean = false;

  // ==================== SUB MODULES ====================
  private persistence: DrawingPersistence;
  private tfManager:   DrawingTFManager;
  private arrows:      DrawingTradeArrows;

  constructor(
    chart:     IChartApi,
    series:    ISeriesApi<SeriesType>,
    config:    DrawingToolsConfig,
    callbacks?: {
      setDrawingState?:   (active: boolean) => void;
      setSelectionState?: (active: boolean) => void;
    },
    initialSymbol?:    string,
    initialTimeframe?: string
  ) {
    this.chart   = chart;
    this.series  = series;
    this.config  = config;
    this.setDrawingStateCallback   = callbacks?.setDrawingState;
    this.setSelectionStateCallback = callbacks?.setSelectionState;

    this._currentSymbol    = initialSymbol    || 'EURUSD';
    this._currentTimeframe = initialTimeframe || 'H1';

    // ==================== INIT SUB MODULES ====================

    this.persistence = new DrawingPersistence(
      () => this.lineTools,
      () => this.isInitialized,
      () => this._currentSymbol,
      () => this._currentTimeframe
    );

    this.tfManager = new DrawingTFManager(
      () => this.lineTools,
      () => this.isInitialized,
      this.persistence,
      () => this.arrows.removeTradeArrows()
    );

    this.arrows = new DrawingTradeArrows(
      () => this.lineTools,
      () => this.isInitialized,
      (group: string) => this.loadAndRegisterGroup(group)
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.persistence.purgeAndSave());
    }
  }

  // ================================================================
  // INITIALIZATION
  // ================================================================

  public async initialize(): Promise<boolean> {
    try {
      console.log('🔧 Initializing drawing module...');

      if (!this.chart || !this.series) {
        console.error('❌ Chart or series not provided');
        return false;
      }

      this.lineTools = createLineToolsPlugin(this.chart, this.series);

      if (!this.lineTools) {
        console.error('❌ Failed to create line tools plugin');
        return false;
      }

      this.setupToolOptions();
      this.wireChartEvents();
      this.subscribeToToolEvents();
      this.setupThemeListener();
      this.setupSettingsListeners();

      await this.initializeToolbar();

      this.isInitialized = true;

      await this.persistence.loadDrawings(
        (g) => this.loadAndRegisterGroup(g),
        TOOL_GROUP_MAP
      );

      console.log('✅ Drawing module initialized');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize drawing tools:', error);
      return false;
    }
  }

  // ================================================================
  // THEME
  // ================================================================

  private getThemeTextColor(): string {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    return theme === 'light' ? '#000000' : '#ffffff';
  }

  private setupThemeListener(): void {
    this.themeObserver = new MutationObserver(() => {
      const textColor = this.getThemeTextColor();
      this.updateAllToolsTextColor(textColor);
    });

    this.themeObserver.observe(document.documentElement, {
      attributes:      true,
      attributeFilter: ['data-theme']
    });
  }

  private updateAllToolsTextColor(color: string): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      const json  = this.lineTools.exportLineTools();
      const tools = JSON.parse(json);
      if (!Array.isArray(tools)) return;

      tools.forEach((tool: any) => {
        if (tool.options?.text !== undefined) {
          this.lineTools.applyLineToolOptions({
            id:       tool.id,
            toolType: tool.toolType,
            options:  { text: { font: { color } } }
          });
        }
      });

      this.persistence.saveDrawings();
    } catch (e) {
      console.error('❌ Failed to update tools text color:', e);
    }
  }

  // ================================================================
  // SETTINGS LISTENERS
  // ================================================================

  private setupSettingsListeners(): void {
    document.addEventListener('chart-setting-toggle', (e: Event) => {
      const { key, value } = (e as CustomEvent).detail;

      if (key === 'showBuyArrows') {
        this.arrows.showBuyArrows = value as boolean;
        if (!value) {
          this.arrows.removeTradeArrows('buy');
        } else {
          document.dispatchEvent(new CustomEvent('chart-arrows-toggle-on', {
            detail: { type: 'buy' }
          }));
        }
      }

      if (key === 'showSellArrows') {
        this.arrows.showSellArrows = value as boolean;
        if (!value) {
          this.arrows.removeTradeArrows('sell');
        } else {
          document.dispatchEvent(new CustomEvent('chart-arrows-toggle-on', {
            detail: { type: 'sell' }
          }));
        }
      }
    });
  }

  // ================================================================
  // LAZY TOOL REGISTRATION
  // ================================================================

  private async loadAndRegisterGroup(groupName: string): Promise<void> {
    if (registeredGroups.has(groupName)) return;

    try {
      switch (groupName) {
        case 'lines': {
          const { registerLinesPlugin } = await import('./tools/lines');
          registerLinesPlugin(this.lineTools);
          break;
        }
        case 'shapes': {
          const { SHAPE_TOOLS } = await import('./tools/shapes');
          Object.entries(SHAPE_TOOLS).forEach(([name, tool]) => {
            try { this.lineTools.registerLineTool(name, tool); }
            catch (error) { console.warn(`⚠️ Failed to register tool ${name}:`, error); }
          });
          break;
        }
        case 'text': {
          const { TEXT_TOOLS } = await import('./tools/text');
          Object.entries(TEXT_TOOLS).forEach(([name, tool]) => {
            try { this.lineTools.registerLineTool(name, tool); }
            catch (error) { console.warn(`⚠️ Failed to register tool ${name}:`, error); }
          });
          break;
        }
        case 'advanced': {
          const { ADVANCED_TOOLS } = await import('./tools/advanced');
          Object.entries(ADVANCED_TOOLS).forEach(([name, tool]) => {
            try { this.lineTools.registerLineTool(name, tool); }
            catch (error) { console.warn(`⚠️ Failed to register tool ${name}:`, error); }
          });
          break;
        }
        case 'freehand': {
          const { FREEHAND_TOOLS } = await import('./tools/freehand');
          Object.entries(FREEHAND_TOOLS).forEach(([name, tool]) => {
            try { this.lineTools.registerLineTool(name, tool); }
            catch (error) { console.warn(`⚠️ Failed to register tool ${name}:`, error); }
          });
          break;
        }
        case 'position': {
          const { POSITION_TOOLS } = await import('./tools/position');
          Object.entries(POSITION_TOOLS).forEach(([name, tool]) => {
            try { this.lineTools.registerLineTool(name, tool); }
            catch (error) { console.warn(`⚠️ Failed to register tool ${name}:`, error); }
          });
          break;
        }
        case 'signals': {
          const { SIGNAL_TOOLS } = await import('./tools/signals');
          Object.entries(SIGNAL_TOOLS).forEach(([name, tool]) => {
            try { this.lineTools.registerLineTool(name, tool); }
            catch (error) { console.warn(`⚠️ Failed to register signal tool ${name}:`, error); }
          });
          break;
        }
        default:
          console.warn(`⚠️ Unknown tool group: ${groupName}`);
          return;
      }

      registeredGroups.add(groupName);
      console.log(`✅ Tool group loaded: ${groupName}`);

    } catch (error) {
      console.error(`❌ Failed to load tool group ${groupName}:`, error);
    }
  }

  // ================================================================
  // SETUP
  // ================================================================

  private setupToolOptions(): void {
    if (!this.lineTools || !this.chart) return;

    this.chart.applyOptions({
      localization: {
        priceFormatter: this.config.priceFormatter
      }
    });

    const globalOptions = {
      precision:  this.config.precision,
      showLabels: this.config.showLabels,
      textStyle: {
        fontSize:   12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color:      '#e2e8f0'
      }
    };

    if (typeof this.lineTools.setOptions === 'function') {
      this.lineTools.setOptions(globalOptions);
    }
  }

  private wireChartEvents(): void {
    if (!this.chart || !this.lineTools) return;

    const clickHandler = (param: any) => {
      if (this.isDrawingActive || this.isSelectionMode) {
        if (typeof this.lineTools.onClick === 'function') {
          this.lineTools.onClick(param);
        }
      }
    };

    const dblClickHandler = (param: any) => {
      if (typeof this.lineTools.onDoubleClick === 'function') {
        this.lineTools.onDoubleClick(param);
      }
    };

    this.chart.subscribeClick(clickHandler);
    this.eventHandlers.click = clickHandler;

    this.chart.subscribeDblClick(dblClickHandler);
    this.eventHandlers.dblClick = dblClickHandler;
  }

  private subscribeToToolEvents(): void {
    if (!this.lineTools) return;

    if (typeof this.lineTools.on === 'function') {
      this.lineTools.on('line-tool-created', (tool: any) => {
        if (tool?.id) {
          this.persistence.injectMeta(
            tool.id,
            this._currentSymbol,
            this._currentTimeframe
          );
        }
        this.pendingToolFormatting.push(tool);
        this.scheduleBatchFormatting();
        this.persistence.saveDrawings();
      });
    }

    if (typeof this.lineTools.subscribeLineToolsAfterEdit === 'function') {
      this.lineTools.subscribeLineToolsAfterEdit(() => {
        this.persistence.saveDrawings();
      });
    }
  }

  private async initializeToolbar(): Promise<void> {
    this.toolbar = new DrawingToolbar(
      this.lineTools,
      {
        setDrawingState:      (active: boolean)                 => this.setDrawingState(active),
        setSelectionState:    (active: boolean)                 => this.setSelectionState(active),
        clearAllDrawings:     ()                                => this.clearAllDrawings(),
        startDrawing:         (toolType: string, options?: any) => this.startDrawing(toolType, options),
        updateToolProperties: (toolId: string, updates: any)   => this.updateToolProperties(toolId, updates),
        lockTool:             (toolId: string, locked: boolean) => this.lockTool(toolId, locked),
        deleteTool:           (toolId: string)                  => this.deleteTool(toolId),
        setToolAllTF:         (toolId: string, allTF: boolean)  => this.tfManager.setToolAllTF(toolId, allTF),
        getToolMeta:          (toolId: string)                  => this.tfManager.getToolMeta(toolId)
      }
    );
    await this.toolbar.initialize();
  }

  private scheduleBatchFormatting(): void {
    if (this.formatBatchTimeout) clearTimeout(this.formatBatchTimeout);

    this.formatBatchTimeout = window.setTimeout(() => {
      if (this.pendingToolFormatting.length > 0) {
        this.pendingToolFormatting.forEach(tool => this.applyPriceFormattingToTool(tool));
        this.pendingToolFormatting = [];
      }
      this.formatBatchTimeout = null;
    }, 100);
  }

  // ================================================================
  // DRAWING STATE
  // ================================================================

  public setDrawingState(active: boolean): void {
    this.isDrawingActive = active;
    if (this.setDrawingStateCallback) this.setDrawingStateCallback(active);
  }

  public setSelectionState(active: boolean): void {
    this.isSelectionMode = active;
    if (this.setSelectionStateCallback) this.setSelectionStateCallback(active);
  }

  public activateDrawingMode(toolType?: string): void {
    this.setDrawingState(true);
    this.setSelectionState(false);
    if (toolType) this.startDrawing(toolType);
  }

  public deactivateDrawingMode(): void {
    this.setDrawingState(false);
    this.setSelectionState(false);
  }

  public activateSelectionMode(): void {
    this.setSelectionState(true);
    this.setDrawingState(false);
  }

  public deactivateSelectionMode(): void {
    this.setSelectionState(false);
  }

  public isUserInteracting(): boolean {
    return this.isDrawingActive || this.isSelectionMode;
  }

  // ================================================================
  // FIX 1 — CHART TYPE SWITCH FLAG
  // ================================================================

  public beginChartTypeSwitch(): void {
    this._isSwitchingChartType = true;
  }

  public endChartTypeSwitch(): void {
    this._isSwitchingChartType = false;
  }

  // ================================================================
  // SYMBOL + TF SWITCHING
  // ================================================================

  public async onTimeframeChange(timeframe: string): Promise<void> {
    await this.tfManager.onTimeframeChange(
      timeframe,
      this._currentTimeframe,
      (tf) => { this._currentTimeframe = tf; }
    );
  }

  public async onSymbolChange(symbol: string): Promise<void> {
    await this.tfManager.onSymbolChange(
      symbol,
      this._currentSymbol,
      (sym) => { this._currentSymbol = sym; }
    );
  }

  public clearToolsOnly(): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      if (typeof this.lineTools.removeAllLineTools === 'function') {
        this.lineTools.removeAllLineTools();
      }
    } catch (error) {
      console.error('❌ clearToolsOnly failed:', error);
    }
  }

  public async onDataReady(): Promise<void> {
    if (!this.lineTools || !this.isInitialized) return;

    // ✅ Fix 1 — skip loadDrawings during chart type switch
    if (this._isSwitchingChartType) return;

    try {
      await new Promise<void>(resolve => requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve())
      ));

      if (!this.lineTools || !this.isInitialized) return;

      await this.persistence.loadDrawings(
        (g) => this.loadAndRegisterGroup(g),
        TOOL_GROUP_MAP
      );

      console.log(`📐 Drawings restored for ${this._currentSymbol} ${this._currentTimeframe}`);
      document.dispatchEvent(new CustomEvent('chart-drawings-ready'));

    } catch (error) {
      console.error('❌ onDataReady failed:', error);
    }
  }

  // ================================================================
  // PUBLIC API
  // ================================================================

  public async startDrawing(toolType: string, options?: any): Promise<void> {
    if (!this.lineTools || !this.isInitialized) {
      console.warn('⚠️ Drawing tools not initialized');
      return;
    }

    try {
      const groupName = TOOL_GROUP_MAP[toolType];
      if (groupName) await this.loadAndRegisterGroup(groupName);

      if (options) {
        this.lineTools.addLineTool(toolType, [], options);
      } else {
        this.lineTools.addLineTool(toolType);
      }

    } catch (error) {
      console.error(`❌ Failed to start drawing tool ${toolType}:`, error);
    }
  }

  public clearAllDrawings(): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      // ✅ Remove all tools from engine
      if (typeof this.lineTools.removeAllLineTools === 'function') {
        this.lineTools.removeAllLineTools();
      }

      this.persistence.clearMeta();

      // ✅ Delegate storage clear to persistence
      // clearSavedDrawings removes only current symbol tools
      this.persistence.clearSavedDrawings();

      console.log(`🗑️ Drawings cleared for ${this._currentSymbol}`);
    } catch (error) {
      console.error('❌ Failed to clear drawings:', error);
    }
  }

  public removeSelectedDrawings(): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      if (typeof this.lineTools.removeSelectedLineTools === 'function') {
        this.lineTools.removeSelectedLineTools();
        this.persistence.saveDrawings();
      }
    } catch (error) {
      console.error('❌ Failed to remove selected drawings:', error);
    }
  }

  // ================================================================
  // TRADE ARROWS — delegate to sub module
  // ================================================================

  public async placeTradeArrow(params: {
    id:          string;
    type:        'buy' | 'sell';
    timestamp:   number;
    price:       number;
    priceLabel:  string;
    color?:      string;
    priceLine?:  'hover' | 'always';
  }): Promise<void> {
    await this.arrows.placeTradeArrow(params);
  }

  public removeTradeArrows(type?: 'buy' | 'sell'): void {
    this.arrows.removeTradeArrows(type);
  }

  // ================================================================
  // TOOL PROPERTY MANAGEMENT
  // ================================================================

  public updateToolProperties(toolId: string, updates: any): void {
    if (!this.lineTools || !this.isInitialized) return;

    try {
      let currentToolData = null;

      if (typeof this.lineTools.getLineToolByID === 'function') {
        const toolDataJson = this.lineTools.getLineToolByID(toolId);
        if (toolDataJson) {
          const parsed = JSON.parse(toolDataJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            currentToolData = parsed[0];
          }
        }
      }

      if (!currentToolData) return;

      const mergedOptions = this.deepMerge(currentToolData.options || {}, updates);

      if (typeof this.lineTools.createOrUpdateLineTool === 'function') {
        this.lineTools.createOrUpdateLineTool(
          currentToolData.toolType,
          currentToolData.points,
          mergedOptions,
          toolId
        );
        this.persistence.saveDrawings();
      }
    } catch (error) {
      console.error('❌ Failed to update tool properties:', error);
    }
  }

  public lockTool(toolId: string, locked: boolean): void {
    const toolDataJson = this.lineTools?.getLineToolByID(toolId);
    if (!toolDataJson) return;

    const parsed = JSON.parse(toolDataJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const currentToolData = parsed[0];
    this.updateToolProperties(toolId, {
      locked,
      editable: !locked,
      defaultHoverCursor: locked
        ? 'default'
        : (currentToolData.options?.defaultHoverCursor || 'pointer')
    });
  }

  // ✅ Soft delete — hide + remove from global storage, no detach
  public deleteTool(toolId: string): void {
    if (!this.lineTools || !this.isInitialized) return;

    try {
      if (typeof this.lineTools.getLineToolByID === 'function') {
        const toolDataJson = this.lineTools.getLineToolByID(toolId);
        if (toolDataJson) {
          const parsed = JSON.parse(toolDataJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (parsed[0].options?.locked) return;

            // ✅ Hide immediately — no detach
            this.lineTools.applyLineToolOptions({
              id:       toolId,
              toolType: parsed[0].toolType,
              options:  { ...parsed[0].options, visible: false }
            });
          }
        }
      }

      // ✅ Mark deleted in metaMap
      this.persistence.deleteMeta(toolId);

      // ✅ Remove from global storage immediately — single key, single operation
      this.persistence.removeToolFromStorage(toolId);

      console.log(`🗑️ Tool ${toolId} deleted`);

    } catch (error) {
      console.error('❌ Failed to delete tool:', error);
    }
  }

  // ================================================================
  // CROSSHAIR
  // ================================================================

  public onCrosshairMove(param: any): void {
    if (!this.lineTools || typeof this.lineTools.onCrosshairMove !== 'function') return;

    const now = Date.now();
    if (now - this.lastCrosshairTime < this.CROSSHAIR_THROTTLE_MS) return;
    this.lastCrosshairTime = now;

    this.lineTools.onCrosshairMove(param);
  }

  // ================================================================
  // LINE TOOLS CORE API
  // ================================================================

  public getLineTools(): any                 { return this.lineTools; }
  public addLineTool(toolType: string): void { this.startDrawing(toolType); }
  public removeAllLineTools(): void          { this.clearAllDrawings(); }
  public removeSelectedLineTools(): void     { this.removeSelectedDrawings(); }
  public isReady(): boolean                  { return this.isInitialized; }
  public isUserDrawing(): boolean            { return this.isUserInteracting(); }
  public getAvailableToolTypes(): string[]   { return Object.keys(TOOL_GROUP_MAP); }

  public subscribeLineToolsAfterEdit(callback: (tools: any) => void): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      if (typeof this.lineTools.subscribeLineToolsAfterEdit === 'function') {
        this.lineTools.subscribeLineToolsAfterEdit(callback);
      }
    } catch (error) {
      console.error('❌ Failed to subscribe to AfterEdit:', error);
    }
  }

  public subscribeLineToolsDoubleClick(callback: (tools: any) => void): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      if (typeof this.lineTools.subscribeLineToolsDoubleClick === 'function') {
        this.lineTools.subscribeLineToolsDoubleClick(callback);
      }
    } catch (error) {
      console.error('❌ Failed to subscribe to DoubleClick:', error);
    }
  }

  public getLineToolByID(id: string): string {
    if (!this.lineTools || !this.isInitialized) return '[]';
    try {
      if (typeof this.lineTools.getLineToolByID === 'function') {
        return this.lineTools.getLineToolByID(id);
      }
    } catch (error) {
      console.error('❌ Failed to get line tool by ID:', error);
    }
    return '[]';
  }

  public createOrUpdateLineTool(type: string, points: any[], options: any, id: string): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      if (typeof this.lineTools.createOrUpdateLineTool === 'function') {
        this.lineTools.createOrUpdateLineTool(type, points, options, id);
        this.persistence.saveDrawings();
      }
    } catch (error) {
      console.error('❌ Failed to create/update line tool:', error);
    }
  }

  public applyLineToolOptions(toolData: any): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      if (typeof this.lineTools.applyLineToolOptions === 'function') {
        this.lineTools.applyLineToolOptions(toolData);
        this.persistence.saveDrawings();
      }
    } catch (error) {
      console.error('❌ Failed to apply line tool options:', error);
    }
  }

  public getToolCount(): number {
    if (!this.lineTools || !this.isInitialized) return 0;
    try {
      if (typeof this.lineTools.getAllTools === 'function') {
        const tools = this.lineTools.getAllTools();
        return Array.isArray(tools) ? tools.length : 0;
      }
    } catch (error) {
      console.error('❌ Failed to get tool count:', error);
    }
    return 0;
  }

  // ================================================================
  // PERSISTENCE — delegate
  // ================================================================

  public saveDrawings(): void          { this.persistence.saveDrawings(); }
  public clearSavedDrawings(): void    { this.persistence.clearSavedDrawings(); }

  public exportDrawings(): string {
    return this.persistence.exportDrawings();
  }

  public importDrawings(json: string): void {
    this.persistence.importDrawings(json);
  }

  // ================================================================
  // CONFIG
  // ================================================================

  public updateConfig(newConfig: Partial<DrawingToolsConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.chart) {
      this.chart.applyOptions({
        localization: {
          priceFormatter: this.config.priceFormatter
        }
      });
    }

    if (this.lineTools && typeof this.lineTools.setOptions === 'function') {
      this.lineTools.setOptions({
        precision:  this.config.precision,
        showLabels: this.config.showLabels
      });
    }

    this.updateAllToolsPriceFormatting();
  }

  private updateAllToolsPriceFormatting(): void {
    if (!this.lineTools || !this.isInitialized) return;
    try {
      if (typeof this.lineTools.getAllTools === 'function') {
        const tools = this.lineTools.getAllTools();
        if (Array.isArray(tools)) {
          tools.forEach(tool => this.applyPriceFormattingToTool(tool));
        }
      }
    } catch (error) {
      console.error('❌ Failed to update all tools price formatting:', error);
    }
  }

  private applyPriceFormattingToTool(tool: any): void {
    if (!tool || typeof tool !== 'object') return;
    try {
      if (typeof tool.setPriceFormatter === 'function') {
        tool.setPriceFormatter(this.config.priceFormatter);
      }
      if (tool.priceLabels && Array.isArray(tool.priceLabels)) {
        tool.priceLabels.forEach((label: any) => {
          if (label && typeof label.update === 'function') {
            const currentPrice = label.getPrice ? label.getPrice() : null;
            if (currentPrice !== null && currentPrice !== undefined) {
              label.update({ text: this.config.priceFormatter(currentPrice) });
            }
          }
        });
      }
    } catch (error) {}
  }

  // ================================================================
  // UPDATE SERIES
  // ================================================================

  public updateSeries(newSeries: ISeriesApi<SeriesType>): void {
    if (!this.chart || !this.lineTools) return;

    const savedDrawings = this.persistence.exportDrawings();
    this.series = newSeries;

    try {
      if (typeof this.lineTools.destroy === 'function') {
        this.lineTools.destroy();
      }
    } catch (error) {
      console.error('❌ Error destroying old line tools:', error);
    }

    this.lineTools = createLineToolsPlugin(this.chart, this.series);

    if (this.lineTools) {
      registeredGroups.clear();
      this.setupToolOptions();
      this.subscribeToToolEvents();
      this.toolbar?.resubscribeCoreEvents();

      if (savedDrawings && savedDrawings !== '[]') {
        try {
          const tools       = JSON.parse(savedDrawings);
          const persistable = Array.isArray(tools)
            ? tools
                .filter((t: any) => t.points && t.points.length > 0)
                .filter((t: any) => {
                  const meta = this.persistence.getMeta(t.id);
                  return !meta?.deleted;
                })
                .map((t: any) => ({
                  ...t,
                  options: {
                    ...t.options,
                    visible: this.persistence.shouldToolBeVisible(
                      t.id,
                      this._currentTimeframe
                    )
                  }
                }))
            : [];
          if (persistable.length > 0) {
            this.persistence.importDrawings(JSON.stringify(persistable));
          }
        } catch (e) {}
      }
    }
  }

  // ================================================================
  // HELPERS
  // ================================================================

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // ================================================================
  // DESTROY
  // ================================================================

  public destroy(): void {
    console.log('🧹 Destroying drawing module...');

    // ✅ purgeAndSave — clean global storage + remove deleted ghosts from engine
    this.persistence.purgeAndSave();

    // ✅ Remove all tools from engine on destroy — safe here
    if (this.lineTools && typeof this.lineTools.removeAllLineTools === 'function') {
      try { this.lineTools.removeAllLineTools(); } catch (error) {}
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    if (this.toolbar) {
      this.toolbar.destroy();
      this.toolbar = null;
    }

    if (this.formatBatchTimeout) {
      clearTimeout(this.formatBatchTimeout);
      this.formatBatchTimeout = null;
    }

    this.pendingToolFormatting = [];
    this.arrows.destroy();

    const oldLineTools = this.lineTools;
    this.lineTools     = null;

    this.isDrawingActive = false;
    this.isSelectionMode = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', () => this.persistence.purgeAndSave());
    }

    setTimeout(() => {
      if (oldLineTools && typeof oldLineTools.destroy === 'function') {
        try { oldLineTools.destroy(); } catch (error) {}
      }
    }, 100);

    this.chart         = null;
    this.series        = null;
    this.isInitialized = false;
    this.eventHandlers = {};
    this.persistence.clearMeta();

    console.log('✅ Drawing module destroyed');
  }
}
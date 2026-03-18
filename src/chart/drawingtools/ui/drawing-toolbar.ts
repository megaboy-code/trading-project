// ================================================================
// 🎨 DRAWING TOOLBAR - UI for drawing tools
// ================================================================

import { ToolPropertiesModal } from './tool-properties-modal';
import { loadToolTemplate, saveToolTemplate } from './tool-schemas';

export class DrawingToolbar {
  private drawingModule:      any;
  private activeDrawingTool:  string | null = null;
  private drawingToolButtons: NodeListOf<HTMLButtonElement> | null = null;
  private selectedTool:       any = null;
  private isInitialized:      boolean = false;

  private propertiesModal: ToolPropertiesModal | null = null;
  private quickToolbar:    any = null;

  private setDrawingState:      (active: boolean) => void;
  private setSelectionState:    (active: boolean) => void;
  private clearAllDrawings:     () => void;
  private startDrawing:         (toolType: string, options?: any) => void;
  private updateToolProperties: (toolId: string, updates: any) => void;
  private lockTool:             (toolId: string, locked: boolean) => void;
  private deleteTool:           (toolId: string) => void;

  constructor(
    drawingModule: any,
    callbacks: {
      setDrawingState:      (active: boolean) => void;
      setSelectionState:    (active: boolean) => void;
      clearAllDrawings:     () => void;
      startDrawing:         (toolType: string, options?: any) => void;
      updateToolProperties: (toolId: string, updates: any) => void;
      lockTool:             (toolId: string, locked: boolean) => void;
      deleteTool:           (toolId: string) => void;
    }
  ) {
    this.drawingModule        = drawingModule;
    this.setDrawingState      = callbacks.setDrawingState;
    this.setSelectionState    = callbacks.setSelectionState;
    this.clearAllDrawings     = callbacks.clearAllDrawings;
    this.startDrawing         = callbacks.startDrawing;
    this.updateToolProperties = callbacks.updateToolProperties;
    this.lockTool             = callbacks.lockTool;
    this.deleteTool           = callbacks.deleteTool;
  }

  // ==================== INITIALIZATION ====================

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.setupDrawingToolButtons();
    this.createPropertiesModal();
    this.setupKeyboardShortcuts();
    await this.initQuickToolbar();
    this.setupCoreEventSubscriptions();

    this.isInitialized = true;
    console.log('✅ Drawing toolbar ready');
  }

  public destroy(): void {
    if (this.drawingToolButtons) {
      this.drawingToolButtons.forEach(btn => {
        const newBtn = btn.cloneNode(true) as HTMLButtonElement;
        btn.parentNode?.replaceChild(newBtn, btn);
      });
    }
    if (this.propertiesModal) { this.propertiesModal.destroy(); this.propertiesModal = null; }
    if (this.quickToolbar)    { this.quickToolbar.destroy();    this.quickToolbar    = null; }
    this.setDrawingState(false);
    this.setSelectionState(false);
    this.isInitialized = false;
  }

  // ==================== APPLY TOOL OPTIONS ====================

  private applyToolOptions(updates: any): void {
    if (!this.selectedTool || !this.drawingModule?.applyLineToolOptions) return;

    // ✅ Deep merge to preserve nested properties
    const mergedOptions = this.deepMerge(this.selectedTool.options || {}, updates);

    this.drawingModule.applyLineToolOptions({
      id:       this.selectedTool.id,
      toolType: this.selectedTool.toolType,
      points:   this.selectedTool.points,
      options:  mergedOptions
    });

    // ✅ Keep selectedTool in sync
    this.selectedTool.options = mergedOptions;
  }

  private saveTemplate(toolType: string, options: any): void {
    const { locked, editable, ...cleanOptions } = options;
    saveToolTemplate(toolType, cleanOptions);
  }

  // ==================== QUICK TOOLBAR ====================

  private async initQuickToolbar(): Promise<void> {
    const { ToolQuickToolbar } = await import('./tool-quick-toolbar');

    this.quickToolbar = new ToolQuickToolbar({
      // ✅ Single onToolUpdate replaces old color/width/style callbacks
      onToolUpdate: (toolId: string, updates: any) => {
        this.applyToolOptions(updates);
        if (this.selectedTool?.toolType) {
          this.saveTemplate(this.selectedTool.toolType, this.selectedTool.options);
        }
      },

      onSettingsClick: (tool: any) => {
        this.showToolProperties(tool);
      },

      onLockToggle: (toolId: string, locked: boolean) => {
        this.applyToolOptions({ locked, editable: !locked });
        this.lockTool(toolId, locked);
      },

      onDelete: (toolId: string) => {
        this.deleteTool(toolId);
        this.selectedTool = null;
        this.hideToolProperties();
      }
    });

    console.log('✅ Quick toolbar ready');
  }

  // ==================== DRAWING TOOL BUTTONS ====================

  private setupDrawingToolButtons(): void {
    const drawingToolBar = document.querySelector('.drawing-tools-vertical');
    if (!drawingToolBar) {
      console.warn('⚠️ Drawing tools bar not found');
      return;
    }

    this.drawingToolButtons = drawingToolBar.querySelectorAll('button');

    this.drawingToolButtons.forEach(button => {
      const toolId = button.getAttribute('data-tool');
      const action = button.getAttribute('data-action');

      button.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();

        if (action === 'clear-drawings') {
          this.clearAllDrawings();
          this.deactivateAllTools();
          this.hideToolProperties();
          this.quickToolbar?.hide();
          return;
        }

        if (action === 'edit-drawings') {
          this.enterSelectionMode(button);
          return;
        }

        if (toolId) this.handleDrawingToolClick(button, toolId);
      });
    });
  }

  private handleDrawingToolClick(button: HTMLButtonElement, toolId: string): void {
    if (toolId === 'cursor') {
      const isActive = button.classList.contains('active');
      this.drawingToolButtons?.forEach(btn => btn.classList.remove('active'));
      if (!isActive) {
        button.classList.add('active');
        document.dispatchEvent(new CustomEvent('chart-toggle-crosshair'));
        this.setDrawingState(false);
        this.setSelectionState(false);
      } else {
        document.dispatchEvent(new CustomEvent('chart-toggle-crosshair'));
      }
      this.activeDrawingTool = null;
      return;
    }

    if (this.activeDrawingTool === toolId) {
      this.deactivateAllTools();
      this.hideToolProperties();
      return;
    }

    this.deactivateAllTools();
    this.hideToolProperties();
    this.activateDrawingTool(button, toolId);
  }

  private activateDrawingTool(button: HTMLButtonElement, toolId: string): void {
    button.classList.add('active');
    this.activeDrawingTool = toolId;
    this.setDrawingState(true);

    const template = loadToolTemplate(toolId);
    this.startDrawing(toolId, template || undefined);
  }

  private enterSelectionMode(button: HTMLButtonElement): void {
    const isActive = button.classList.contains('active');
    this.drawingToolButtons?.forEach(btn => btn.classList.remove('active'));
    if (!isActive) {
      button.classList.add('active');
      this.setSelectionState(true);
    } else {
      this.setSelectionState(false);
    }
    this.activeDrawingTool = null;
  }

  private deactivateAllTools(): void {
    this.drawingToolButtons?.forEach(btn => btn.classList.remove('active'));
    this.activeDrawingTool = null;
    this.setDrawingState(false);
    this.setSelectionState(false);
    this.hideToolProperties();
  }

  // ==================== CORE EVENT SUBSCRIPTIONS ====================

  private setupCoreEventSubscriptions(): void {
    if (!this.drawingModule) return;

    if (this.drawingModule.subscribeLineToolsAfterEdit) {
      this.drawingModule.subscribeLineToolsAfterEdit((payload: any) => {
        if (payload?.stage === 'lineToolFinished') {
          this.deactivateAllTools();
          this.quickToolbar?.hide();
          return;
        }
        const tool = payload?.selectedLineTool || payload;
        if (tool?.id) {
          this.selectedTool = tool;
          this.quickToolbar?.updateTool(tool);
        }
      });
    }

    if (this.drawingModule.subscribeLineToolsDoubleClick) {
      this.drawingModule.subscribeLineToolsDoubleClick((payload: any) => {
        const tool = payload?.selectedLineTool || payload;

        if (tool?.toolType === 'Callout' && tool?.enterEditMode) {
          tool.enterEditMode();
          return;
        }

        if (tool?.id) {
          this.selectedTool = tool;
          this.quickToolbar?.show(tool);
        }
      });
    }
  }

  // ==================== KEYBOARD ====================

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (!this.selectedTool) return;
        if (this.selectedTool.options?.locked) {
          alert('This tool is locked. Unlock it first to delete.');
          return;
        }
        if (this.drawingModule?.removeSelectedLineTools) {
          this.drawingModule.removeSelectedLineTools();
          this.hideToolProperties();
          this.quickToolbar?.hide();
          this.selectedTool = null;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        this.deactivateAllTools();
        this.hideToolProperties();
        this.quickToolbar?.hide();
      }

      // ✅ p — open tool properties only when a tool is selected
      if ((e.key === 'p' || e.key === 'P') && this.selectedTool) {
        e.preventDefault();
        e.stopPropagation();
        this.showToolProperties(this.selectedTool);
      }

      if ((e.key === 'l' || e.key === 'L') && this.selectedTool) {
        e.preventDefault();
        const locked = this.selectedTool.options?.locked || false;
        this.applyToolOptions({ locked: !locked, editable: locked });
        this.lockTool(this.selectedTool.id, !locked);
        this.quickToolbar?.updateTool(this.selectedTool);
      }
    });
  }

  // ==================== PROPERTIES MODAL ====================

  private createPropertiesModal(): void {
    this.propertiesModal = new ToolPropertiesModal(
      this.drawingModule,
      {
        onToolUpdate: (toolId: string, updates: any) => {
          this.applyToolOptions(updates);
          if (this.selectedTool?.toolType) {
            this.saveTemplate(this.selectedTool.toolType, this.selectedTool.options);
          }
          this.quickToolbar?.updateTool(this.selectedTool);
        },

        onToolLock: (toolId: string, locked: boolean) => {
          this.applyToolOptions({ locked, editable: !locked });
          this.lockTool(toolId, locked);
          this.quickToolbar?.updateTool(this.selectedTool);
        },

        onToolDelete: (toolId: string) => {
          this.deleteTool(toolId);
          this.selectedTool = null;
          this.quickToolbar?.hide();
        }
      }
    );
  }

  private showToolProperties(tool: any): void {
    if (!this.propertiesModal || !tool) return;

    if (this.drawingModule && typeof this.drawingModule.getLineToolByID === 'function') {
      try {
        const json = this.drawingModule.getLineToolByID(tool.id);
        if (json) {
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.selectedTool = parsed[0];
            this.propertiesModal.show(parsed[0]);
            return;
          }
        }
      } catch (e) {}
    }

    this.propertiesModal.show(tool);
  }

  private hideToolProperties(): void {
    this.propertiesModal?.hide();
    this.selectedTool = null;
  }

  // ==================== HELPERS ====================

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

  // ==================== PUBLIC API ====================

  public activateTool(toolId: string): void {
    if (!this.drawingToolButtons) return;
    const button = Array.from(this.drawingToolButtons).find(
      btn => btn.getAttribute('data-tool') === toolId
    );
    if (button) this.handleDrawingToolClick(button, toolId);
  }

  public deactivateCurrentTool(): void {
    this.deactivateAllTools();
    this.hideToolProperties();
    this.quickToolbar?.hide();
  }

  public getActiveTool(): string | null { return this.activeDrawingTool; }
  public getSelectedTool(): any         { return this.selectedTool; }
}
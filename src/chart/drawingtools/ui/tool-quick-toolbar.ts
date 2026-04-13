// ================================================================
// ⚡ TOOL QUICK TOOLBAR - Floating toolbar for drawn tools
// ================================================================

import {
  getSchemaForTool,
  getPropertyValue,
  PropertyField
} from './tool-schemas';

type ControlType = 'color' | 'width' | 'style';

interface QuickControl {
  type:    ControlType;
  key:     string;
  label:   string;
  default: any;
}

const QUICK_CONTROLS: Record<string, QuickControl[]> = {
  TrendLine:      lineControls(),
  Ray:            lineControls(),
  Arrow:          lineControls(),
  ExtendedLine:   lineControls(),
  HorizontalLine: lineControls(),
  HorizontalRay:  lineControls(),
  VerticalLine:   lineControls(),
  CrossLine:      lineControls(),
  Path:           lineControls(),
  Text: [
    { type: 'color', key: 'text.font.color', label: 'Text Color', default: '#2962ff' }
  ],
  Callout: [
    { type: 'color', key: 'line.color',                label: 'Line Color',   default: '#2962ff' },
    { type: 'color', key: 'text.font.color',           label: 'Text Color',   default: '#ffffff' },
    { type: 'color', key: 'text.box.border.color',     label: 'Border Color', default: 'rgba(74,144,226,1)' },
    { type: 'color', key: 'text.box.background.color', label: 'BG Color',     default: 'rgba(19,73,133,1)' },
    { type: 'width', key: 'line.width',                label: 'Line Width',   default: 2 },
    { type: 'style', key: 'line.style',                label: 'Line Style',   default: 0 },
  ],
  Rectangle: [
    { type: 'color', key: 'rectangle.border.color',     label: 'Border Color', default: '#9c27b0' },
    { type: 'color', key: 'rectangle.background.color', label: 'Fill Color',   default: 'rgba(156,39,176,0.2)' },
    { type: 'width', key: 'rectangle.border.width',     label: 'Border Width', default: 1 },
    { type: 'style', key: 'rectangle.border.style',     label: 'Border Style', default: 0 },
  ],
  Circle: [
    { type: 'color', key: 'circle.border.color',     label: 'Border Color', default: '#9c27b0' },
    { type: 'color', key: 'circle.background.color', label: 'Fill Color',   default: 'rgba(156,39,176,0.2)' },
    { type: 'width', key: 'circle.border.width',     label: 'Border Width', default: 1 },
    { type: 'style', key: 'circle.border.style',     label: 'Border Style', default: 0 },
  ],
  Triangle: [
    { type: 'color', key: 'triangle.border.color',     label: 'Border Color', default: '#f57c00' },
    { type: 'color', key: 'triangle.background.color', label: 'Fill Color',   default: 'rgba(245,123,0,0.2)' },
    { type: 'width', key: 'triangle.border.width',     label: 'Border Width', default: 1 },
    { type: 'style', key: 'triangle.border.style',     label: 'Border Style', default: 0 },
  ],
  ParallelChannel: [
    { type: 'color', key: 'channelLine.color', label: 'Channel Color',  default: '#2962ff' },
    { type: 'color', key: 'background.color',  label: 'Fill Color',     default: 'rgba(41,98,255,0.2)' },
    { type: 'color', key: 'middleLine.color',  label: 'Mid Line Color', default: '#2962ff' },
    { type: 'width', key: 'channelLine.width', label: 'Line Width',     default: 1 },
    { type: 'style', key: 'channelLine.style', label: 'Line Style',     default: 0 },
  ],
  PriceRange: [
    { type: 'color', key: 'priceRange.rectangle.border.color',     label: 'Border Color', default: '#9c27b0' },
    { type: 'color', key: 'priceRange.rectangle.background.color', label: 'Fill Color',   default: 'rgba(156,39,176,0.2)' },
    { type: 'width', key: 'priceRange.rectangle.border.width',     label: 'Border Width', default: 1 },
    { type: 'style', key: 'priceRange.rectangle.border.style',     label: 'Border Style', default: 0 },
  ],
  FibRetracement: [
    { type: 'width', key: 'line.width', label: 'Line Width', default: 1 },
    { type: 'style', key: 'line.style', label: 'Line Style', default: 0 },
  ],
  Brush: [
    { type: 'color', key: 'line.color',       label: 'Stroke Color', default: 'rgba(0,188,212,1)' },
    { type: 'color', key: 'background.color', label: 'Fill Color',   default: 'rgba(0,0,0,0)' },
    { type: 'width', key: 'line.width',        label: 'Stroke Width', default: 2 },
  ],
  Highlighter: [
    { type: 'color', key: 'line.color',       label: 'Highlight Color', default: 'rgba(255,255,0,0.4)' },
    { type: 'color', key: 'background.color', label: 'Fill Color',      default: 'rgba(0,0,0,0)' },
    { type: 'width', key: 'line.width',        label: 'Highlight Width', default: 20 },
  ],
  LongShortPosition: [
    { type: 'color', key: 'entryStopLossRectangle.background.color', label: 'Risk Fill',   default: 'rgba(255,0,0,0.2)' },
    { type: 'color', key: 'entryPtRectangle.background.color',       label: 'Reward Fill', default: 'rgba(0,128,0,0.2)' },
  ],
};

function lineControls(): QuickControl[] {
  return [
    { type: 'color', key: 'line.color', label: 'Line Color', default: '#2962ff' },
    { type: 'width', key: 'line.width', label: 'Line Width', default: 2 },
    { type: 'style', key: 'line.style', label: 'Line Style', default: 0 },
  ];
}

export interface QuickToolbarCallbacks {
  onToolUpdate:    (toolId: string, updates: any) => void;
  onSettingsClick: (tool: any) => void;
  onLockToggle:    (toolId: string, locked: boolean) => void;
  onDelete:        (toolId: string) => void;
  // ✅ Fix 3 — per-TF toggle callbacks
  onAllTFToggle:   (toolId: string, allTF: boolean) => void;
  getToolMeta:     (toolId: string) => any | null;
}

export class ToolQuickToolbar {
  private container:   HTMLElement | null = null;
  private currentTool: any = null;
  private callbacks:   QuickToolbarCallbacks;

  private isDragging:  boolean = false;
  private dragOffsetX: number  = 0;
  private dragOffsetY: number  = 0;

  private savedX: number | null = null;
  private savedY: number | null = null;

  private liveValues:     Record<string, any> = {};
  private activeDropdown: string | null = null;

  constructor(callbacks: QuickToolbarCallbacks) {
    this.callbacks = callbacks;
    this.injectStyles();
  }

  // ==================== SHOW / HIDE ====================

  public show(tool: any): void {
    if (!tool) return;

    const sameType   = this.currentTool?.toolType === tool.toolType;
    this.currentTool = tool;
    this.extractLiveValues(tool);

    if (this.container && sameType) {
      this.updateAllControls();
      return;
    }

    if (this.container) this.removeContainer();
    this.createToolbar();
    this.positionToolbar();
  }

  public hide(): void {
    if (!this.container) return;
    this.container.classList.add('qtb-hiding');
    setTimeout(() => { this.removeContainer(); }, 150);
    document.removeEventListener('mousedown', this.handleOutsideClick);
  }

  public updateTool(tool: any): void {
    if (!tool) return;
    this.currentTool = tool;
    this.extractLiveValues(tool);
    if (this.container) this.updateAllControls();
  }

  private removeContainer(): void {
    if (this.container && document.body.contains(this.container)) {
      document.body.removeChild(this.container);
    }
    this.container      = null;
    this.activeDropdown = null;
  }

  // ==================== EXTRACT LIVE VALUES ====================

  private extractLiveValues(tool: any): void {
    const controls = QUICK_CONTROLS[tool.toolType] || [];
    const options  = tool.options || {};
    this.liveValues = {};
    controls.forEach(ctrl => {
      const val = getPropertyValue(options, ctrl.key);
      this.liveValues[ctrl.key] = val !== undefined ? val : ctrl.default;
    });

    if (options.text !== undefined) {
      const textColor = getPropertyValue(options, 'text.font.color');
      this.liveValues['text.font.color'] = textColor || '#2962ff';
    }
  }

  private toolHasText(): boolean {
    const options = this.currentTool?.options;
    if (!options) return false;
    return options.text !== undefined;
  }

  // ==================== CREATE TOOLBAR ====================

  private createToolbar(): void {
    this.container = document.createElement('div');
    this.container.className = 'qtb-container';
    this.container.innerHTML = this.buildHTML();
    document.body.appendChild(this.container);

    this.setupDragging();
    this.setupButtons();
    this.updateAllControls();

    setTimeout(() => {
      document.addEventListener('mousedown', this.handleOutsideClick);
    }, 0);
  }

  private buildHTML(): string {
    const toolType = this.currentTool?.toolType || '';
    const controls = QUICK_CONTROLS[toolType] || [];
    const hasText  = this.toolHasText();

    // ✅ Read allTF from meta for initial button state
    const meta  = this.currentTool?.id
      ? this.callbacks.getToolMeta(this.currentTool.id)
      : null;
    const allTF = meta?.allTF ?? true;

    let controlsHTML = '';

    controls.forEach(ctrl => {
      const safeKey = ctrl.key.replace(/\./g, '_');
      controlsHTML += `<div class="qtb-divider"></div>`;

      if (ctrl.type === 'color') {
        controlsHTML += `
          <div class="qtb-item">
            <button class="qtb-color-btn" id="qtbColor_${safeKey}"
                    title="${ctrl.label}" data-key="${ctrl.key}">
              <div class="qtb-color-dot" id="qtbDot_${safeKey}"></div>
            </button>
          </div>
        `;
      } else if (ctrl.type === 'width') {
        controlsHTML += `
          <div class="qtb-item qtb-dropdown-wrap" id="qtbWidthWrap_${safeKey}">
            <button class="qtb-btn" id="qtbWidthBtn_${safeKey}"
                    title="${ctrl.label}" data-key="${ctrl.key}">
              <div class="qtb-width-preview" id="qtbWidthPrev_${safeKey}"></div>
              <i class="fas fa-chevron-down qtb-chevron"></i>
            </button>
            <div class="qtb-dropdown" id="qtbWidthDd_${safeKey}">
              ${[0.5, 1, 2, 3, 4].map(w => `
                <div class="qtb-dropdown-item qtb-width-item"
                     data-key="${ctrl.key}" data-width="${w}">
                  <div class="qtb-width-line"
                       style="height:${Math.max(1,w)}px;opacity:${w===0.5?0.6:1};"></div>
                  <span class="qtb-width-label">${w}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else if (ctrl.type === 'style') {
        controlsHTML += `
          <div class="qtb-item qtb-dropdown-wrap" id="qtbStyleWrap_${safeKey}">
            <button class="qtb-btn" id="qtbStyleBtn_${safeKey}"
                    title="${ctrl.label}" data-key="${ctrl.key}">
              <div class="qtb-style-preview" id="qtbStylePrev_${safeKey}"></div>
              <i class="fas fa-chevron-down qtb-chevron"></i>
            </button>
            <div class="qtb-dropdown" id="qtbStyleDd_${safeKey}">
              ${[
                { value: 0, label: 'Solid',  cls: 'qtb-style-solid'  },
                { value: 1, label: 'Dashed', cls: 'qtb-style-dashed' },
                { value: 2, label: 'Dotted', cls: 'qtb-style-dotted' },
              ].map(s => `
                <div class="qtb-dropdown-item qtb-style-item"
                     data-key="${ctrl.key}" data-style="${s.value}">
                  <div class="qtb-style-line ${s.cls}"></div>
                  <span class="qtb-style-label">${s.label}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    });

    if (hasText) {
      const textColor    = this.liveValues['text.font.color'] || '#2962ff';
      const displayColor = this.toDisplayColor(textColor);
      controlsHTML += `
        <div class="qtb-divider"></div>
        <div class="qtb-item">
          <button class="qtb-color-btn qtb-text-color-btn" id="qtbTextColorBtn"
                  title="Text Color">
            <div class="qtb-text-color-icon">
              <span class="qtb-t-letter" id="qtbTLetter">T</span>
              <div class="qtb-t-underline" id="qtbTUnderline"
                   style="background:${displayColor};"></div>
            </div>
          </button>
        </div>
      `;
    }

    return `
      <div class="qtb-drag-handle" title="Drag">
        <i class="fas fa-grip-vertical"></i>
      </div>

      ${controlsHTML}

      <div class="qtb-divider"></div>
      <div class="qtb-item">
        <button class="qtb-btn" id="qtbSettingsBtn" title="Settings">
          <i class="fas fa-gear"></i>
        </button>
      </div>

      <div class="qtb-divider"></div>
      <div class="qtb-item">
        <button class="qtb-btn" id="qtbLockBtn" title="Lock tool">
          <i class="fas fa-lock-open" id="qtbLockIcon"></i>
        </button>
      </div>

      <div class="qtb-divider"></div>
      <div class="qtb-item">
        <button class="qtb-btn ${allTF ? 'qtb-btn-active' : ''}"
                id="qtbAllTFBtn"
                title="${allTF ? 'Showing on all timeframes' : 'Locked to current timeframe'}">
          <i class="fas fa-layer-group" id="qtbAllTFIcon"></i>
        </button>
      </div>

      <div class="qtb-divider"></div>
      <div class="qtb-item">
        <button class="qtb-btn qtb-btn-danger" id="qtbDeleteBtn" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
  }

  // ==================== UPDATE ALL CONTROLS ====================

  private updateAllControls(): void {
    if (!this.container) return;
    const controls = QUICK_CONTROLS[this.currentTool?.toolType || ''] || [];

    controls.forEach(ctrl => {
      const safeKey = ctrl.key.replace(/\./g, '_');
      const value   = this.liveValues[ctrl.key];

      if (ctrl.type === 'color') {
        const dot = this.container!.querySelector(`#qtbDot_${safeKey}`) as HTMLElement;
        if (dot) dot.style.background = this.toDisplayColor(value);

      } else if (ctrl.type === 'width') {
        const prev = this.container!.querySelector(`#qtbWidthPrev_${safeKey}`) as HTMLElement;
        if (prev) {
          const w = parseFloat(value) || 1;
          prev.style.cssText = `width:20px;height:${Math.max(1,w)}px;background:var(--text-primary);border-radius:1px;opacity:${w===0.5?0.5:0.8};`;
        }

      } else if (ctrl.type === 'style') {
        const prev = this.container!.querySelector(`#qtbStylePrev_${safeKey}`) as HTMLElement;
        if (prev) {
          const styles: Record<number, string> = { 0: 'solid', 1: 'dashed', 2: 'dotted' };
          prev.style.cssText = `width:22px;height:0;border-top:2px ${styles[value] || 'solid'} var(--text-secondary);margin:auto 0;`;
        }
      }
    });

    const tUnderline = this.container.querySelector('#qtbTUnderline') as HTMLElement;
    if (tUnderline) {
      tUnderline.style.background = this.toDisplayColor(this.liveValues['text.font.color']);
    }

    this.updateLockButton();
    this.updateAllTFButton();
  }

  private updateLockButton(): void {
    const lockIcon = this.container?.querySelector('#qtbLockIcon') as HTMLElement;
    const lockBtn  = this.container?.querySelector('#qtbLockBtn')  as HTMLElement;
    if (!lockIcon || !lockBtn) return;
    const isLocked     = this.currentTool?.options?.locked || false;
    lockIcon.className = isLocked ? 'fas fa-lock' : 'fas fa-lock-open';
    lockBtn.title      = isLocked ? 'Unlock tool' : 'Lock tool';
    lockBtn.classList.toggle('qtb-btn-active', isLocked);
  }

  // ✅ Fix 3 — update allTF button state
  private updateAllTFButton(): void {
    const btn = this.container?.querySelector('#qtbAllTFBtn') as HTMLElement;
    if (!btn || !this.currentTool?.id) return;

    const meta  = this.callbacks.getToolMeta(this.currentTool.id);
    const allTF = meta?.allTF ?? true;

    btn.classList.toggle('qtb-btn-active', allTF);
    btn.title = allTF
      ? 'Showing on all timeframes'
      : 'Locked to current timeframe';
  }

  // ==================== SETUP BUTTONS ====================

  private setupButtons(): void {
    if (!this.container) return;
    const controls = QUICK_CONTROLS[this.currentTool?.toolType || ''] || [];

    controls.forEach(ctrl => {
      const safeKey = ctrl.key.replace(/\./g, '_');

      if (ctrl.type === 'color') {
        const btn = this.container!.querySelector(`#qtbColor_${safeKey}`);
        btn?.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.closeDropdowns();

          const { ColorPicker } = await import('../../../core/color-picker');
          const current = this.parseToHexOpacity(this.liveValues[ctrl.key]);

          const picker = new ColorPicker({
            color:   current.hex,
            opacity: current.opacity,
            onChange: (hex: string, opacity: number) => {
              const newVal = opacity < 1 ? this.hexToRgba(hex, opacity) : hex;
              this.liveValues[ctrl.key] = newVal;

              const dot = this.container?.querySelector(`#qtbDot_${safeKey}`) as HTMLElement;
              if (dot) dot.style.background = this.toDisplayColor(newVal);

              if (this.currentTool) {
                const updates: any = {};
                this.setNestedValue(updates, ctrl.key, newVal);
                this.callbacks.onToolUpdate(this.currentTool.id, updates);
              }
            }
          });
          picker.open(btn as HTMLElement);
        });

      } else if (ctrl.type === 'width') {
        const btn = this.container!.querySelector(`#qtbWidthBtn_${safeKey}`);
        btn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleDropdown(`qtbWidthDd_${safeKey}`);
        });

        this.container!.querySelectorAll(`.qtb-width-item[data-key="${ctrl.key}"]`).forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const width = parseFloat((item as HTMLElement).dataset.width || '1');
            this.liveValues[ctrl.key] = width;
            this.updateAllControls();
            this.closeDropdowns();
            if (this.currentTool) {
              const updates: any = {};
              this.setNestedValue(updates, ctrl.key, width);
              this.callbacks.onToolUpdate(this.currentTool.id, updates);
            }
          });
        });

      } else if (ctrl.type === 'style') {
        const btn = this.container!.querySelector(`#qtbStyleBtn_${safeKey}`);
        btn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleDropdown(`qtbStyleDd_${safeKey}`);
        });

        this.container!.querySelectorAll(`.qtb-style-item[data-key="${ctrl.key}"]`).forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const style = parseInt((item as HTMLElement).dataset.style || '0');
            this.liveValues[ctrl.key] = style;
            this.updateAllControls();
            this.closeDropdowns();
            if (this.currentTool) {
              const updates: any = {};
              this.setNestedValue(updates, ctrl.key, style);
              this.callbacks.onToolUpdate(this.currentTool.id, updates);
            }
          });
        });
      }
    });

    // Text color T button
    const textColorBtn = this.container.querySelector('#qtbTextColorBtn');
    if (textColorBtn) {
      textColorBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.closeDropdowns();

        const { ColorPicker } = await import('../../../core/color-picker');
        const current = this.parseToHexOpacity(this.liveValues['text.font.color']);

        const picker = new ColorPicker({
          color:   current.hex,
          opacity: current.opacity,
          onChange: (hex: string, opacity: number) => {
            const newVal = opacity < 1 ? this.hexToRgba(hex, opacity) : hex;
            this.liveValues['text.font.color'] = newVal;

            const tUnderline = this.container?.querySelector('#qtbTUnderline') as HTMLElement;
            if (tUnderline) tUnderline.style.background = this.toDisplayColor(newVal);

            if (this.currentTool) {
              const updates: any = {};
              this.setNestedValue(updates, 'text.font.color', newVal);
              this.callbacks.onToolUpdate(this.currentTool.id, updates);
            }
          }
        });
        picker.open(textColorBtn as HTMLElement);
      });
    }

    // Settings
    this.container.querySelector('#qtbSettingsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeDropdowns();
      if (this.currentTool) {
        this.hide();
        this.callbacks.onSettingsClick(this.currentTool);
      }
    });

    // Lock
    this.container.querySelector('#qtbLockBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeDropdowns();
      if (this.currentTool) {
        const isLocked                  = this.currentTool.options?.locked || false;
        this.currentTool.options        = this.currentTool.options || {};
        this.currentTool.options.locked = !isLocked;
        this.updateLockButton();
        this.callbacks.onLockToggle(this.currentTool.id, !isLocked);
      }
    });

    // ✅ allTF toggle button — update directly with known new value
    this.container.querySelector('#qtbAllTFBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeDropdowns();
      if (!this.currentTool?.id) return;

      const meta   = this.callbacks.getToolMeta(this.currentTool.id);
      const allTF  = meta?.allTF ?? true;
      const newVal = !allTF;

      this.callbacks.onAllTFToggle(this.currentTool.id, newVal);

      // ✅ Update button directly with known new value — don't re-read meta
      const btn = this.container?.querySelector('#qtbAllTFBtn') as HTMLElement;
      if (btn) {
        btn.classList.toggle('qtb-btn-active', newVal);
        btn.title = newVal
          ? 'Showing on all timeframes'
          : 'Locked to current timeframe';
      }
    });

    // Delete
    this.container.querySelector('#qtbDeleteBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeDropdowns();
      if (this.currentTool) {
        if (this.currentTool.options?.locked) {
          alert('This tool is locked. Unlock it first to delete.');
          return;
        }
        this.callbacks.onDelete(this.currentTool.id);
        this.hide();
      }
    });
  }

  // ==================== DROPDOWNS ====================

  private toggleDropdown(ddId: string): void {
    if (this.activeDropdown === ddId) {
      this.closeDropdowns();
      return;
    }
    this.closeDropdowns();
    const dd = this.container?.querySelector(`#${ddId}`) as HTMLElement;
    if (dd) {
      dd.classList.add('qtb-dropdown-open');
      this.activeDropdown = ddId;
    }
  }

  private closeDropdowns(): void {
    if (!this.container) return;
    this.container.querySelectorAll('.qtb-dropdown').forEach(d =>
      d.classList.remove('qtb-dropdown-open')
    );
    this.activeDropdown = null;
  }

  // ==================== POSITION ====================

  private positionToolbar(): void {
    if (!this.container) return;

    if (this.savedX !== null && this.savedY !== null) {
      this.container.style.left = `${this.savedX}px`;
      this.container.style.top  = `${this.savedY}px`;
      return;
    }

    const chartArea    = document.getElementById('mainChartArea') || document.body;
    const rect         = chartArea.getBoundingClientRect();
    const toolbarWidth = this.container.offsetWidth || 300;
    const x = rect.left + (rect.width - toolbarWidth) / 2;
    const y = rect.top + 48;

    this.container.style.left = `${x}px`;
    this.container.style.top  = `${y}px`;
  }

  // ==================== DRAGGING ====================

  private setupDragging(): void {
    const handle = this.container?.querySelector('.qtb-drag-handle') as HTMLElement;
    if (!handle || !this.container) return;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      this.isDragging  = true;
      const rect       = this.container!.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      this.container!.classList.add('qtb-dragging');
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging || !this.container) return;
      const x      = e.clientX - this.dragOffsetX;
      const y      = e.clientY - this.dragOffsetY;
      const maxX   = window.innerWidth  - this.container.offsetWidth;
      const maxY   = window.innerHeight - this.container.offsetHeight;
      const boundX = Math.max(0, Math.min(x, maxX));
      const boundY = Math.max(0, Math.min(y, maxY));
      this.container.style.left = `${boundX}px`;
      this.container.style.top  = `${boundY}px`;
      this.savedX = boundX;
      this.savedY = boundY;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.container?.classList.remove('qtb-dragging');
        document.body.style.userSelect = '';
      }
    });
  }

  // ==================== OUTSIDE CLICK ====================

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.container) return;
    if (this.container.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('.cp-container')) return;
    this.hide();
  };

  // ==================== COLOR HELPERS ====================

  private parseToHexOpacity(value: any): { hex: string; opacity: number } {
    if (!value || typeof value !== 'string') return { hex: '#3b82f6', opacity: 1 };
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const r   = parseInt(match[1]);
      const g   = parseInt(match[2]);
      const b   = parseInt(match[3]);
      const a   = match[4] !== undefined ? parseFloat(match[4]) : 1;
      const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
      return { hex, opacity: a };
    }
    return { hex: value.startsWith('#') ? value : '#3b82f6', opacity: 1 };
  }

  private hexToRgba(hex: string, opacity: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  private toDisplayColor(value: any): string {
    if (!value) return '#3b82f6';
    return this.parseToHexOpacity(value).hex;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys    = path.split('.');
    const lastKey = keys.pop()!;
    let target    = obj;
    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    }
    target[lastKey] = value;
  }

  // ==================== STYLES ====================

  private injectStyles(): void {
    if (document.getElementById('qtb-styles')) return;

    const style = document.createElement('style');
    style.id    = 'qtb-styles';
    style.textContent = `
      .qtb-container {
        position: fixed;
        display: flex;
        align-items: center;
        gap: 2px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 4px 6px;
        box-shadow: var(--card-shadow);
        z-index: 10002;
        user-select: none;
        animation: qtbFadeIn 0.15s ease;
        min-height: 34px;
        font-family: var(--text-sans);
      }

      .qtb-container.qtb-hiding {
        animation: qtbFadeOut 0.15s ease forwards;
      }

      .qtb-container.qtb-dragging {
        box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        transform: scale(1.02);
      }

      @keyframes qtbFadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      @keyframes qtbFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(-4px); }
      }

      .qtb-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 26px;
        color: var(--text-muted);
        cursor: grab;
        border-radius: 4px;
        transition: color 0.15s;
        flex-shrink: 0;
        font-size: 11px;
      }

      .qtb-drag-handle:hover  { color: var(--text-secondary); background: var(--bg-hover); }
      .qtb-drag-handle:active { cursor: grabbing; color: var(--text-primary); }

      .qtb-divider {
        width: 1px;
        height: 18px;
        background: var(--border);
        flex-shrink: 0;
        margin: 0 2px;
      }

      .qtb-item {
        position: relative;
        display: flex;
        align-items: center;
      }

      .qtb-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 26px;
        padding: 0 6px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 5px;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;
        min-width: 26px;
        font-family: var(--text-sans);
      }

      .qtb-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--border-light);
      }

      .qtb-btn-active {
        background: var(--bg-active) !important;
        color: var(--accent-info) !important;
        border-color: var(--border-light) !important;
      }

      .qtb-btn-danger:hover {
        background: rgba(var(--accent-sell-rgb), 0.12) !important;
        color: var(--accent-sell) !important;
        border-color: rgba(var(--accent-sell-rgb), 0.3) !important;
      }

      .qtb-color-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.15s;
        padding: 0;
      }

      .qtb-color-btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-light);
      }

      .qtb-color-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid var(--border-light);
        transition: border-color 0.15s;
        flex-shrink: 0;
      }

      .qtb-color-btn:hover .qtb-color-dot { border-color: var(--text-muted); }

      .qtb-text-color-btn {
        width: 28px;
        height: 26px;
        flex-direction: column;
        gap: 1px;
      }

      .qtb-text-color-icon {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .qtb-t-letter {
        font-size: 12px;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
        font-family: var(--text-sans);
      }

      .qtb-t-underline {
        width: 14px;
        height: 3px;
        border-radius: 1px;
      }

      .qtb-chevron { font-size: 8px !important; color: var(--text-muted); }

      .qtb-dropdown-wrap { position: relative; }

      .qtb-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: var(--card-shadow);
        padding: 4px;
        display: none;
        flex-direction: column;
        gap: 2px;
        min-width: 100px;
        z-index: 10003;
      }

      .qtb-dropdown-open { display: flex !important; }

      .qtb-dropdown-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.15s;
        white-space: nowrap;
      }

      .qtb-dropdown-item:hover { background: var(--bg-hover); }

      .qtb-width-line {
        width: 50px;
        background: var(--text-secondary);
        border-radius: 1px;
        flex-shrink: 0;
      }

      .qtb-width-label {
        font-size: 11px;
        color: var(--text-muted);
        font-family: var(--text-mono);
        min-width: 20px;
      }

      .qtb-style-line   { width: 50px; height: 0; flex-shrink: 0; }
      .qtb-style-solid  { border-top: 2px solid var(--text-secondary); }
      .qtb-style-dashed { border-top: 2px dashed var(--text-secondary); }
      .qtb-style-dotted { border-top: 2px dotted var(--text-secondary); }

      .qtb-style-label {
        font-size: 11px;
        color: var(--text-muted);
        font-family: var(--text-sans);
      }
    `;

    document.head.appendChild(style);
  }

  // ==================== DESTROY ====================

  public destroy(): void {
    document.removeEventListener('mousedown', this.handleOutsideClick);
    this.removeContainer();
  }
}

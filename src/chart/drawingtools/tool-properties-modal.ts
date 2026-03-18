// ================================================================
// 🎨 TOOL PROPERTIES MODAL - Floating properties editor
// ================================================================

import {
  getSchemaForTool,
  getPropertyValue,
  setPropertyValue,
  saveToolTemplate,
  loadToolTemplate,
  ToolSchema,
  PropertyField
} from './tool-schemas';

export class ToolPropertiesModal {
  private modal: HTMLElement | null = null;
  private currentTool: any = null;
  private drawingModule: any = null;

  private isDragging: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;

  private activeTab: string = 'style';
  private openDropdown: HTMLElement | null = null;

  private liveColorValues: Record<string, { hex: string; opacity: number }> = {};

  private onToolUpdate?: (toolId: string, updates: any) => void;
  private onToolLock?: (toolId: string, locked: boolean) => void;
  private onToolDelete?: (toolId: string) => void;

  constructor(
    drawingModule: any,
    callbacks?: {
      onToolUpdate?: (toolId: string, updates: any) => void;
      onToolLock?: (toolId: string, locked: boolean) => void;
      onToolDelete?: (toolId: string) => void;
    }
  ) {
    this.drawingModule = drawingModule;
    this.onToolUpdate = callbacks?.onToolUpdate;
    this.onToolLock = callbacks?.onToolLock;
    this.onToolDelete = callbacks?.onToolDelete;
    this.injectStyles();
  }

  // ==================== SHOW / HIDE ====================

  public show(tool: any): void {
    if (!tool) return;

    const toolType = tool.toolType;

    // ✅ Merge saved template silently
    const savedTemplate = loadToolTemplate(toolType);
    if (savedTemplate) {
      tool = {
        ...tool,
        options: this.deepMerge(savedTemplate, tool.options || {})
      };
    }

    this.currentTool = tool;
    this.activeTab = 'style';
    this.liveColorValues = {};

    if (this.modal) this.destroyModal();
    this.buildModal(tool);
    this.centerModal();

    setTimeout(() => {
      document.addEventListener('mousedown', this.handleOutsideClick);
    }, 0);
  }

  public hide(): void {
    document.removeEventListener('mousedown', this.handleOutsideClick);
    this.destroyModal();
    this.currentTool = null;
    this.liveColorValues = {};
  }

  private destroyModal(): void {
    if (this.modal && document.body.contains(this.modal)) {
      document.body.removeChild(this.modal);
    }
    this.modal = null;
    this.openDropdown = null;
  }

  // ==================== BUILD MODAL ====================

  private buildModal(tool: any): void {
    const schema = getSchemaForTool(tool.toolType);
    const hasText = schema?.properties.some(p => p.tab === 'text');
    const hasCoords = tool.points && tool.points.length > 0;

    this.modal = document.createElement('div');
    this.modal.className = 'tpm-modal';

    this.modal.innerHTML = `
      <div class="tpm-header" id="tpmHeader">
        <div class="tpm-title">${schema?.displayName || tool.toolType} Properties</div>
        <button class="tpm-close" id="tpmClose">✕</button>
      </div>

      <div class="tpm-tabs">
        <button class="tpm-tab active" data-tab="style">Style</button>
        ${hasText ? `<button class="tpm-tab" data-tab="text">Text</button>` : ''}
        ${hasCoords ? `<button class="tpm-tab" data-tab="coords">Coordinates</button>` : ''}
      </div>

      <div class="tpm-content">
        <div class="tpm-panel active" id="panel-style">
          ${this.buildStylePanel(tool, schema)}
        </div>
        ${hasText ? `
        <div class="tpm-panel" id="panel-text">
          ${this.buildTextPanel(tool, schema)}
        </div>` : ''}
        ${hasCoords ? `
        <div class="tpm-panel" id="panel-coords">
          ${this.buildCoordsPanel(tool)}
        </div>` : ''}
      </div>

      <div class="tpm-footer">
        <div class="tpm-footer-left">
          <div class="tpm-template-wrap">
            <button class="tpm-btn tpm-btn-template" id="tpmTemplateBtn">
              Template <span class="tpm-chevron">▼</span>
            </button>
            <div class="tpm-template-menu" id="tpmTemplateMenu">
              <div class="tpm-template-item" id="tmplSave">💾 Save as Default</div>
              <div class="tpm-template-item" id="tmplApply">✓ Apply Default</div>
            </div>
          </div>
        </div>
        <div class="tpm-footer-right">
          <button class="tpm-btn tpm-btn-cancel" id="tpmCancel">Cancel</button>
          <button class="tpm-btn tpm-btn-ok"     id="tpmOk">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);
    this.setupEvents(tool, schema);
    this.setupDragging();

    // ✅ Seed live color values then attach color pickers
    this.seedLiveColorValues(tool, schema);
    this.attachColorListeners(schema);
  }

  // ==================== SEED LIVE COLOR VALUES ====================

  private seedLiveColorValues(tool: any, schema: ToolSchema | null): void {
    if (!schema) return;
    schema.properties.forEach(prop => {
      if (prop.type !== 'color') return;
      const value = getPropertyValue(tool.options, prop.key) ?? prop.defaultValue;
      const parsed = this.parseColor(value);
      this.liveColorValues[prop.key] = parsed;
    });
  }

  // ==================== ATTACH COLOR LISTENERS ====================

  private async attachColorListeners(schema: ToolSchema | null): Promise<void> {
    if (!this.modal || !schema) return;
    const { ColorPicker } = await import('../../../core/color-picker');

    this.modal.querySelectorAll('.tpm-color-swatch-wrap[data-key]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = el as HTMLElement;
        const key = wrap.dataset.key!;
        const current = this.liveColorValues[key] || { hex: '#3b82f6', opacity: 1 };

        const picker = new ColorPicker({
          color: current.hex,
          opacity: current.opacity,
          onChange: (hex: string, opacity: number) => {
            // ✅ Update live store
            this.liveColorValues[key] = { hex, opacity };

            // ✅ Update swatch visual
            const inner = wrap.querySelector('.tpm-color-swatch-inner') as HTMLElement;
            if (inner) {
              inner.style.background = hex;
              inner.style.opacity = `${opacity}`;
            }

            // ✅ Update opacity label
            const safeKey = key.replace(/\./g, '_');
            const opLabel = this.modal?.querySelector(`#op_${safeKey}`) as HTMLElement;
            if (opLabel) opLabel.textContent = `${Math.round(opacity * 100)}%`;

            // ✅ Live preview on chart
            if (this.currentTool && this.onToolUpdate) {
              const preview: any = {};
              setPropertyValue(
                preview,
                key,
                opacity < 1 ? this.hexToRgba(hex, opacity) : hex
              );
              this.onToolUpdate(this.currentTool.id, preview);
            }
          },
          onClose: () => {
            // ✅ Save recent color on close
            const live = this.liveColorValues[key];
            if (live) {
              // recent color saving handled inside ColorPicker itself
            }
          }
        });

        picker.open(wrap);
      });
    });
  }

  // ==================== STYLE PANEL ====================

  private buildStylePanel(tool: any, schema: ToolSchema | null): string {
    if (!schema) return `<div class="tpm-no-schema">No schema for ${tool.toolType}</div>`;

    const styleProps = schema.properties.filter(p => p.tab === 'style' || !p.tab);
    if (styleProps.length === 0) return '<div class="tpm-no-schema">No style properties</div>';

    const sections: Record<string, PropertyField[]> = {};
    styleProps.forEach(prop => {
      const s = prop.section || 'General';
      if (!sections[s]) sections[s] = [];
      sections[s].push(prop);
    });

    let html = '';
    const keys = Object.keys(sections);
    keys.forEach((sectionName, idx) => {
      sections[sectionName].forEach(prop => {
        html += this.buildPropertyRow(prop, tool);
      });
      if (idx < keys.length - 1) html += `<div class="tpm-section-divider"></div>`;
    });

    return html;
  }

  // ==================== TEXT PANEL ====================

  private buildTextPanel(tool: any, schema: ToolSchema | null): string {
    if (!schema) return '';
    const textProps = schema.properties.filter(p => p.tab === 'text');
    if (textProps.length === 0) return '';

    const sections: Record<string, PropertyField[]> = {};
    textProps.forEach(prop => {
      const s = prop.section || 'Text';
      if (!sections[s]) sections[s] = [];
      sections[s].push(prop);
    });

    let html = '';
    const keys = Object.keys(sections);
    keys.forEach((sectionName, idx) => {
      sections[sectionName].forEach(prop => {
        html += this.buildPropertyRow(prop, tool);
      });
      if (idx < keys.length - 1) html += `<div class="tpm-section-divider"></div>`;
    });

    return html;
  }

  // ==================== COORDS PANEL ====================

  private buildCoordsPanel(tool: any): string {
    const points = tool.points || [];
    if (points.length === 0) return '<div class="tpm-no-schema">No coordinates available</div>';

    return points.map((point: any, i: number) => `
      <div class="tpm-coord-row">
        <span class="tpm-coord-label">Point ${i + 1}</span>
        <span class="tpm-coord-value">${point.price ?? point.value ?? '—'}</span>
        <span class="tpm-coord-value">${point.time ?? '—'}</span>
      </div>
    `).join('');
  }

  // ==================== PROPERTY ROW ====================

  private buildPropertyRow(prop: PropertyField, tool: any): string {
    const value = getPropertyValue(tool.options, prop.key) ?? prop.defaultValue;
    const rowId = `row_${prop.key.replace(/\./g, '_')}`;
    const ctrlId = `ctrl_${prop.key.replace(/\./g, '_')}`;
    const chkId = `chk_${prop.key.replace(/\./g, '_')}`;

    switch (prop.type) {

      case 'color': {
        const swatchId = `swatch_${prop.key.replace(/\./g, '_')}`;
        const parsed = this.parseColor(value);
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              <div class="tpm-color-swatch-wrap" id="${swatchId}" data-key="${prop.key}">
                <div class="tpm-color-swatch-inner"
                     style="background:${parsed.hex};opacity:${parsed.opacity};"></div>
              </div>
              <span class="tpm-opacity-label" id="op_${prop.key.replace(/\./g, '_')}">${Math.round(parsed.opacity * 100)}%</span>
            </div>
          </div>
        `;
      }

      case 'line-width': {
        const ddId = `dd_${prop.key.replace(/\./g, '_')}`;
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              ${this.buildDropdownHTML(ddId, [0.5, 1, 2, 3, 4].map(w => ({
          value: `${w}`,
          html: `<div class="tpm-width-preview" style="height:${Math.max(1, w)}px;opacity:${w === 0.5 ? 0.5 : 0.8}"></div><span>${w}</span>`
        })), `${value}`, `${value}px`)}
            </div>
          </div>
        `;
      }

      case 'line-style': {
        const ddId = `dd_${prop.key.replace(/\./g, '_')}`;
        const labels = ['Solid', 'Dashed', 'Dotted'];
        const classes = ['tpm-style-solid', 'tpm-style-dashed', 'tpm-style-dotted'];
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              ${this.buildDropdownHTML(ddId, [0, 1, 2].map(s => ({
          value: `${s}`,
          html: `<div class="tpm-style-line ${classes[s]}"></div><span>${labels[s]}</span>`
        })), `${value}`, labels[value] || 'Solid')}
            </div>
          </div>
        `;
      }

      case 'corner-radius': {
        const ddId = `dd_${prop.key.replace(/\./g, '_')}`;
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              ${this.buildDropdownHTML(ddId, [0, 2, 4, 8, 12, 20].map(r => ({
          value: `${r}`, html: `<span>${r}px</span>`
        })), `${value}`, `${value}px`)}
            </div>
          </div>
        `;
      }

      case 'font-size': {
        const ddId = `dd_${prop.key.replace(/\./g, '_')}`;
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              ${this.buildDropdownHTML(ddId, [8, 10, 12, 14, 16, 18, 20, 24, 28, 32].map(f => ({
          value: `${f}`, html: `<span>${f}px</span>`
        })), `${value}`, `${value}px`)}
            </div>
          </div>
        `;
      }

      case 'select': {
        const ddId = `dd_${prop.key.replace(/\./g, '_')}`;
        const opts = prop.options || [];
        const selLabel = opts.find(o => o.value === value)?.label || `${value}`;
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              ${this.buildDropdownHTML(ddId, opts.map(o => ({
          value: `${o.value}`, html: `<span>${o.label}</span>`
        })), `${value}`, selLabel)}
            </div>
          </div>
        `;
      }

      case 'checkbox': {
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              <input type="checkbox" class="tpm-checkbox" id="val_${chkId}"
                     ${value ? 'checked' : ''} data-key="${prop.key}">
            </div>
          </div>
        `;
      }

      case 'extend': {
        const ddId = `dd_${prop.key.replace(/\./g, '_')}`;
        const extLeft = getPropertyValue(tool.options, `${prop.keyPrefix}.extend.left`) || false;
        const extRight = getPropertyValue(tool.options, `${prop.keyPrefix}.extend.right`) || false;
        const extLabel = extLeft && extRight ? 'Both' : extLeft ? 'Left' : extRight ? 'Right' : 'None';
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              <div class="tpm-dropdown-wrap">
                <button class="tpm-dropdown-btn" id="${ddId}Btn">
                  <span id="${ddId}Label">${extLabel}</span>
                  <span class="tpm-chevron">▼</span>
                </button>
                <div class="tpm-dropdown-menu" id="${ddId}Menu" style="min-width:140px;">
                  <div class="tpm-extend-item">
                    <input type="checkbox" class="tpm-ext-chk" id="${ddId}Left"
                           data-side="left" data-prefix="${prop.keyPrefix}"
                           ${extLeft ? 'checked' : ''}>
                    <span>Extend Left</span>
                  </div>
                  <div class="tpm-extend-item">
                    <input type="checkbox" class="tpm-ext-chk" id="${ddId}Right"
                           data-side="right" data-prefix="${prop.keyPrefix}"
                           ${extRight ? 'checked' : ''}>
                    <span>Extend Right</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      case 'textarea': {
        return `
          <div class="tpm-row tpm-row-textarea" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}" style="margin-top:5px;align-self:flex-start;">
            <span class="tpm-row-label" style="margin-top:5px;align-self:flex-start;">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              <textarea class="tpm-textarea" id="val_${chkId}"
                        data-key="${prop.key}">${value || ''}</textarea>
            </div>
          </div>
        `;
      }

      case 'text': {
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              <input type="text" class="tpm-text-input" id="val_${chkId}"
                     data-key="${prop.key}" value="${value || ''}">
            </div>
          </div>
        `;
      }

      case 'bold-italic': {
        const bold = getPropertyValue(tool.options, `${prop.keyPrefix}.font.bold`) || false;
        const italic = getPropertyValue(tool.options, `${prop.keyPrefix}.font.italic`) || false;
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              <button class="tpm-toggle-btn ${bold ? 'active' : ''}"
                      id="btnBold_${prop.key.replace(/\./g, '_')}"
                      data-prefix="${prop.keyPrefix}" data-type="bold">
                <b>B</b>
              </button>
              <button class="tpm-toggle-btn ${italic ? 'active' : ''}"
                      id="btnItalic_${prop.key.replace(/\./g, '_')}"
                      data-prefix="${prop.keyPrefix}" data-type="italic">
                <i>I</i>
              </button>
            </div>
          </div>
        `;
      }

      case 'alignment': {
        const ddVId = `ddAlignV_${prop.key.replace(/\./g, '_')}`;
        const ddHId = `ddAlignH_${prop.key.replace(/\./g, '_')}`;
        const alignV = getPropertyValue(tool.options, `${prop.keyPrefix}.alignV`) || 'middle';
        const alignH = getPropertyValue(tool.options, `${prop.keyPrefix}.alignH`) || 'center';
        const vLabel = alignV.charAt(0).toUpperCase() + alignV.slice(1);
        const hLabel = alignH.charAt(0).toUpperCase() + alignH.slice(1);
        return `
          <div class="tpm-row" id="${rowId}" data-key="${prop.key}">
            <input type="checkbox" class="tpm-checkbox tpm-row-chk" id="${chkId}" checked
                   data-ctrl="${ctrlId}">
            <span class="tpm-row-label">${prop.label}</span>
            <div class="tpm-row-controls" id="${ctrlId}">
              ${this.buildDropdownHTML(ddVId, ['Top', 'Middle', 'Bottom'].map(v => ({
          value: v.toLowerCase(), html: `<span>${v}</span>`
        })), alignV, vLabel)}
              ${this.buildDropdownHTML(ddHId, ['Left', 'Center', 'Right'].map(h => ({
          value: h.toLowerCase(), html: `<span>${h}</span>`
        })), alignH, hLabel)}
            </div>
          </div>
        `;
      }

      default:
        return '';
    }
  }

  // ==================== DROPDOWN HTML ====================

  private buildDropdownHTML(
    id: string,
    items: Array<{ value: string; html: string }>,
    selectedValue: string,
    selectedLabel: string
  ): string {
    return `
      <div class="tpm-dropdown-wrap">
        <button class="tpm-dropdown-btn" id="${id}Btn">
          <span id="${id}Label">${selectedLabel}</span>
          <span class="tpm-chevron">▼</span>
        </button>
        <div class="tpm-dropdown-menu" id="${id}Menu">
          ${items.map(item => `
            <div class="tpm-dropdown-item ${item.value === selectedValue ? 'selected' : ''}"
                 data-ddid="${id}" data-value="${item.value}">
              ${item.html}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ==================== SETUP EVENTS ====================

  private setupEvents(tool: any, schema: ToolSchema | null): void {
    if (!this.modal) return;

    // Close
    this.modal.querySelector('#tpmClose')?.addEventListener('click', () => this.hide());
    this.modal.querySelector('#tpmCancel')?.addEventListener('click', () => this.hide());

    // OK
    this.modal.querySelector('#tpmOk')?.addEventListener('click', () => {
      this.applyChanges();
      this.hide();
    });

    // Tabs
    this.modal.querySelectorAll('.tpm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.modal!.querySelectorAll('.tpm-tab').forEach(t => t.classList.remove('active'));
        this.modal!.querySelectorAll('.tpm-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const tabName = (tab as HTMLElement).dataset.tab!;
        this.modal!.querySelector(`#panel-${tabName}`)?.classList.add('active');
      });
    });

    // Row checkboxes
    this.modal.querySelectorAll('.tpm-row-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const ctrlId = input.dataset.ctrl!;
        const ctrl = this.modal!.querySelector(`#${ctrlId}`) as HTMLElement;
        if (ctrl) ctrl.classList.toggle('disabled', !input.checked);
      });
    });

    // Dropdown buttons
    this.modal.querySelectorAll('.tpm-dropdown-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const btnEl = btn as HTMLElement;
        const menuId = btnEl.id.replace('Btn', 'Menu');
        const menu = this.modal!.querySelector(`#${menuId}`) as HTMLElement;
        if (!menu) return;
        const isOpen = menu.classList.contains('open');
        this.closeDropdowns();
        if (!isOpen) {
          menu.classList.add('open');
          btnEl.classList.add('open');
          this.openDropdown = menu;
        }
      });
    });

    // Dropdown items — live preview
    this.modal.querySelectorAll('.tpm-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = item as HTMLElement;
        const ddId = el.dataset.ddid!;
        const value = el.dataset.value!;
        const menu = this.modal!.querySelector(`#${ddId}Menu`) as HTMLElement;
        const label = this.modal!.querySelector(`#${ddId}Label`) as HTMLElement;
        if (menu) menu.querySelectorAll('.tpm-dropdown-item').forEach(i => i.classList.remove('selected'));
        if (label) label.textContent = el.querySelector('span:last-child')?.textContent || value;
        el.classList.add('selected');
        this.closeDropdowns();

        // ✅ Live preview
        if (this.currentTool && this.onToolUpdate) {
          const schema = getSchemaForTool(this.currentTool.toolType);
          if (!schema) return;

          const preview: any = {};

          // ── Alignment dropdowns ──
          if (ddId.startsWith('ddAlignV_') || ddId.startsWith('ddAlignH_')) {
            const safeKey = ddId.replace(/^ddAlignV_/, '').replace(/^ddAlignH_/, '');
            const prop = schema.properties.find(p => p.key.replace(/\./g, '_') === safeKey);
            if (prop?.keyPrefix) {
              const subKey = ddId.startsWith('ddAlignV_')
                ? `${prop.keyPrefix}.alignV`
                : `${prop.keyPrefix}.alignH`;
              setPropertyValue(preview, subKey, value);
              this.onToolUpdate(this.currentTool.id, preview);
            }
            return;
          }

          // ── Standard dropdowns ──
          const safeKey = ddId.replace(/^dd_/, '');
          const prop = schema.properties.find(p => p.key.replace(/\./g, '_') === safeKey);
          if (!prop) return;

          let parsedValue: any = value;
          if (prop.type === 'line-width' || prop.type === 'corner-radius' || prop.type === 'font-size') {
            parsedValue = parseFloat(value);
          } else if (prop.type === 'line-style') {
            parsedValue = parseInt(value);
          }

          setPropertyValue(preview, prop.key, parsedValue);
          this.onToolUpdate(this.currentTool.id, preview);
        }
      });
    });

    // Extend checkboxes — stay open + live preview
    this.modal.querySelectorAll('.tpm-ext-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        const input = e.target as HTMLInputElement;
        const prefix = input.dataset.prefix!;
        const menuEl = input.closest('.tpm-dropdown-menu') as HTMLElement;
        const labelEl = this.modal!.querySelector(
          `#${menuEl?.id.replace('Menu', 'Label')}`
        ) as HTMLElement;
        const leftChk = this.modal!.querySelector(`[data-prefix="${prefix}"][data-side="left"]`) as HTMLInputElement;
        const rightChk = this.modal!.querySelector(`[data-prefix="${prefix}"][data-side="right"]`) as HTMLInputElement;

        if (labelEl) {
          const l = leftChk?.checked, r = rightChk?.checked;
          labelEl.textContent = l && r ? 'Both' : l ? 'Left' : r ? 'Right' : 'None';
        }

        // ✅ Live preview
        if (this.currentTool && this.onToolUpdate) {
          const preview: any = {};
          setPropertyValue(preview, `${prefix}.extend.left`, leftChk?.checked || false);
          setPropertyValue(preview, `${prefix}.extend.right`, rightChk?.checked || false);
          this.onToolUpdate(this.currentTool.id, preview);
        }
      });
    });

    // Bold / Italic — live preview
    this.modal.querySelectorAll('.tpm-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');

        // ✅ Live preview
        if (this.currentTool && this.onToolUpdate) {
          const el = btn as HTMLElement;
          const prefix = el.dataset.prefix!;
          const type = el.dataset.type!;
          if (!prefix || !type) return;
          const active = el.classList.contains('active');
          const preview: any = {};
          setPropertyValue(preview, `${prefix}.font.${type}`, active);
          this.onToolUpdate(this.currentTool.id, preview);
        }
      });
    });
    // Template
    const tmplBtn = this.modal.querySelector('#tpmTemplateBtn') as HTMLElement;
    const tmplMenu = this.modal.querySelector('#tpmTemplateMenu') as HTMLElement;

    tmplBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = tmplMenu.classList.contains('open');
      this.closeDropdowns();
      if (!isOpen) {
        tmplMenu.classList.add('open');
        this.openDropdown = tmplMenu;
      }
    });

    tmplMenu?.addEventListener('mousedown', e => e.stopPropagation());

    this.modal.querySelector('#tmplSave')?.addEventListener('click', () => {
      if (this.currentTool) {
        const updates = this.collectValues();
        saveToolTemplate(this.currentTool.toolType, updates);
        console.log(`✅ Template saved for ${this.currentTool.toolType}`);
      }
      this.closeDropdowns();
    });

    this.modal.querySelector('#tmplApply')?.addEventListener('click', () => {
      if (this.currentTool) {
        const defaults = loadToolTemplate(this.currentTool.toolType);
        if (defaults && this.onToolUpdate) {
          this.onToolUpdate(this.currentTool.id, defaults);
        }
      }
      this.closeDropdowns();
    });
  }

  // ==================== COLLECT VALUES ====================

  private collectValues(): any {
    if (!this.modal || !this.currentTool) return {};
    const schema = getSchemaForTool(this.currentTool.toolType);
    if (!schema) return {};

    const updates: any = {};

    schema.properties.forEach(prop => {
      const key = prop.key;
      const safeKey = key.replace(/\./g, '_');

      switch (prop.type) {

        case 'color': {
          const live = this.liveColorValues[key];
          if (live) {
            setPropertyValue(updates, key, live.opacity < 1
              ? this.hexToRgba(live.hex, live.opacity)
              : live.hex
            );
          }
          break;
        }

        case 'line-width':
        case 'corner-radius':
        case 'font-size': {
          const sel = this.modal!.querySelector(`#dd_${safeKey}Menu .tpm-dropdown-item.selected`) as HTMLElement;
          if (sel) setPropertyValue(updates, key, parseFloat(sel.dataset.value!));
          break;
        }

        case 'line-style': {
          const sel = this.modal!.querySelector(`#dd_${safeKey}Menu .tpm-dropdown-item.selected`) as HTMLElement;
          if (sel) setPropertyValue(updates, key, parseInt(sel.dataset.value!));
          break;
        }

        case 'select': {
          const sel = this.modal!.querySelector(`#dd_${safeKey}Menu .tpm-dropdown-item.selected`) as HTMLElement;
          if (sel) setPropertyValue(updates, key, sel.dataset.value!);
          break;
        }

        case 'checkbox': {
          const chk = this.modal!.querySelector(`#val_chk_${safeKey}`) as HTMLInputElement;
          if (chk) setPropertyValue(updates, key, chk.checked);
          break;
        }

        case 'textarea':
        case 'text': {
          const input = this.modal!.querySelector(`#val_chk_${safeKey}`) as HTMLInputElement | HTMLTextAreaElement;
          if (input) setPropertyValue(updates, key, input.value);
          break;
        }

        case 'extend': {
          const prefix = prop.keyPrefix!;
          const leftChk = this.modal!.querySelector(`[data-prefix="${prefix}"][data-side="left"]`) as HTMLInputElement;
          const rightChk = this.modal!.querySelector(`[data-prefix="${prefix}"][data-side="right"]`) as HTMLInputElement;
          setPropertyValue(updates, `${prefix}.extend.left`, leftChk?.checked || false);
          setPropertyValue(updates, `${prefix}.extend.right`, rightChk?.checked || false);
          break;
        }

        case 'bold-italic': {
          const prefix = prop.keyPrefix!;
          const boldBtn = this.modal!.querySelector(`#btnBold_${safeKey}`) as HTMLElement;
          const italicBtn = this.modal!.querySelector(`#btnItalic_${safeKey}`) as HTMLElement;
          setPropertyValue(updates, `${prefix}.font.bold`, boldBtn?.classList.contains('active') || false);
          setPropertyValue(updates, `${prefix}.font.italic`, italicBtn?.classList.contains('active') || false);
          break;
        }

        case 'alignment': {
          const prefix = prop.keyPrefix!;
          const selV = this.modal!.querySelector(`#ddAlignV_${safeKey}Menu .tpm-dropdown-item.selected`) as HTMLElement;
          const selH = this.modal!.querySelector(`#ddAlignH_${safeKey}Menu .tpm-dropdown-item.selected`) as HTMLElement;
          if (selV) setPropertyValue(updates, `${prefix}.alignV`, selV.dataset.value);
          if (selH) setPropertyValue(updates, `${prefix}.alignH`, selH.dataset.value);
          break;
        }
      }
    });

    return updates;
  }

  // ==================== APPLY ====================

  private applyChanges(): void {
    if (!this.currentTool || !this.onToolUpdate) return;
    const updates = this.collectValues();
    this.onToolUpdate(this.currentTool.id, updates);
  }

  // ==================== DRAGGING ====================

  private setupDragging(): void {
    const header = this.modal?.querySelector('#tpmHeader') as HTMLElement;
    if (!header || !this.modal) return;

    header.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).id === 'tpmClose') return;
      this.isDragging = true;
      const rect = this.modal!.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      document.body.style.userSelect = 'none';
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging || !this.modal) return;
      const x = e.clientX - this.dragOffsetX;
      const y = e.clientY - this.dragOffsetY;
      const maxX = window.innerWidth - this.modal.offsetWidth;
      const maxY = window.innerHeight - this.modal.offsetHeight;
      this.modal.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
      this.modal.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        document.body.style.userSelect = '';
        header.style.cursor = 'grab';
      }
    });
  }

  // ==================== CENTER ====================

  private centerModal(): void {
    if (!this.modal) return;
    requestAnimationFrame(() => {
      if (!this.modal) return;
      const w = this.modal.offsetWidth || 380;
      const h = this.modal.offsetHeight || 520;
      this.modal.style.left = `${Math.max(0, (window.innerWidth - w) / 2)}px`;
      this.modal.style.top = `${Math.max(0, (window.innerHeight - h) / 2)}px`;
    });
  }

  // ==================== CLOSE DROPDOWNS ====================

  private closeDropdowns(): void {
    if (!this.modal) return;
    this.modal.querySelectorAll('.tpm-dropdown-menu').forEach(m => m.classList.remove('open'));
    this.modal.querySelectorAll('.tpm-dropdown-btn').forEach(b => b.classList.remove('open'));
    this.modal.querySelector('#tpmTemplateMenu')?.classList.remove('open');
    this.openDropdown = null;
  }

  // ==================== OUTSIDE CLICK ====================

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.modal) return;

    // ✅ Fix 1 — Don't close if clicking inside color picker
    if ((e.target as HTMLElement).closest('.cp-container')) return;

    if (this.modal.contains(e.target as Node)) {
      const inDropdown = (e.target as HTMLElement).closest('.tpm-dropdown-wrap') ||
        (e.target as HTMLElement).closest('.tpm-footer-left');
      if (!inDropdown) this.closeDropdowns();
      return;
    }

    // ✅ Click outside modal — close everything
    this.closeDropdowns();
    this.hide();
  };

  // ==================== COLOR HELPERS ====================

  private parseColor(value: any): { hex: string; opacity: number } {
    if (!value || typeof value !== 'string') return { hex: '#3b82f6', opacity: 1 };
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

  // ==================== HELPERS ====================

  private deepMerge(base: any, override: any): any {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      if (
        override[key] && typeof override[key] === 'object' && !Array.isArray(override[key]) &&
        base[key] && typeof base[key] === 'object'
      ) {
        result[key] = this.deepMerge(base[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  // ==================== DESTROY ====================

  public destroy(): void {
    document.removeEventListener('mousedown', this.handleOutsideClick);
    this.destroyModal();
  }

  // ==================== STYLES ====================

  private injectStyles(): void {
    if (document.getElementById('tpm-styles')) return;

    const style = document.createElement('style');
    style.id = 'tpm-styles';
    style.textContent = `
      .tpm-modal {
        position: fixed;
        width: 380px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 10px;
        box-shadow: var(--card-shadow);
        display: flex;
        flex-direction: column;
        z-index: 10001;
        overflow: hidden;
        min-height: 520px;
        font-family: var(--text-sans);
        font-size: var(--text-base);
        color: var(--text-primary);
      }

      .tpm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 11px 14px;
        background: var(--bg-card);
        border-bottom: 1px solid var(--border);
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      }

      .tpm-header:active { cursor: grabbing; }

      .tpm-title {
        font-size: var(--text-md);
        font-weight: 600;
        color: var(--text-primary);
      }

      .tpm-close {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: var(--text-md);
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1;
      }

      .tpm-close:hover {
        color: var(--text-primary);
        background: var(--bg-hover);
      }

      .tpm-tabs {
        display: flex;
        background: var(--bg-card);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }

      .tpm-tab {
        flex: 1;
        padding: 9px 0;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-muted);
        font-size: var(--text-sm);
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        font-family: var(--text-sans);
      }

      .tpm-tab:hover {
        color: var(--text-secondary);
        background: var(--bg-hover);
      }

      .tpm-tab.active {
        color: var(--accent-info);
        border-bottom-color: var(--accent-info);
        background: rgba(var(--accent-info-rgb), 0.05);
      }

      .tpm-content {
        padding: 14px;
        overflow-y: auto;
        flex: 1;
      }

      .tpm-panel { display: none; }
      .tpm-panel.active { display: block; }

      .tpm-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        min-height: 30px;
      }

      .tpm-row-textarea { align-items: flex-start; }

      .tpm-row-label {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        min-width: 80px;
        flex-shrink: 0;
      }

      .tpm-row-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        transition: opacity 0.2s;
        flex-wrap: wrap;
      }

      .tpm-row-controls.disabled {
        opacity: 0.3;
        pointer-events: none;
      }

      .tpm-checkbox {
        width: 14px;
        height: 14px;
        cursor: pointer;
        accent-color: var(--accent-info);
        flex-shrink: 0;
      }

      .tpm-color-swatch-wrap {
        position: relative;
        width: 30px;
        height: 24px;
        border-radius: 4px;
        border: 1px solid var(--border);
        cursor: pointer;
        flex-shrink: 0;
        overflow: hidden;
        background-image: linear-gradient(45deg, #808080 25%, transparent 25%),
          linear-gradient(-45deg, #808080 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #808080 75%),
          linear-gradient(-45deg, transparent 75%, #808080 75%);
        background-size: 6px 6px;
        background-position: 0 0, 0 3px, 3px -3px, -3px 0px;
        background-color: #b0b0b0;
        transition: border-color 0.15s;
      }

      .tpm-color-swatch-wrap:hover { border-color: var(--accent-info); }

      .tpm-color-swatch-inner {
        position: absolute;
        inset: 0;
      }

      .tpm-opacity-label {
        font-size: var(--text-sm);
        color: var(--text-muted);
        font-family: var(--text-mono);
      }

      .tpm-dropdown-wrap { position: relative; }

      .tpm-dropdown-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 8px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--text-secondary);
        font-size: var(--text-sm);
        cursor: pointer;
        font-family: var(--text-sans);
        transition: border-color 0.15s;
        white-space: nowrap;
        min-width: 52px;
        justify-content: space-between;
      }

      .tpm-dropdown-btn:hover,
      .tpm-dropdown-btn.open {
        border-color: var(--accent-info);
        color: var(--text-primary);
      }

      .tpm-chevron {
        font-size: 8px;
        color: var(--text-muted);
        flex-shrink: 0;
      }

      .tpm-dropdown-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 6px;
        box-shadow: var(--card-shadow);
        z-index: 10010;
        display: none;
        flex-direction: column;
        min-width: 100%;
        padding: 3px;
      }

      .tpm-dropdown-menu.open { display: flex; }

      .tpm-dropdown-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: var(--text-sm);
        color: var(--text-secondary);
        white-space: nowrap;
        transition: background 0.1s;
      }

      .tpm-dropdown-item:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }

      .tpm-dropdown-item.selected {
        color: var(--accent-info);
        background: rgba(var(--accent-info-rgb), 0.08);
      }

      .tpm-extend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        cursor: pointer;
        font-size: var(--text-sm);
        color: var(--text-secondary);
        border-radius: 4px;
        transition: background 0.1s;
        user-select: none;
      }

      .tpm-extend-item:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }

      .tpm-extend-item input[type="checkbox"] {
        accent-color: var(--accent-info);
        cursor: pointer;
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }

      .tpm-width-preview {
        width: 36px;
        background: var(--text-secondary);
        border-radius: 1px;
        flex-shrink: 0;
      }

      .tpm-style-line   { width: 36px; height: 0; flex-shrink: 0; }
      .tpm-style-solid  { border-top: 2px solid var(--text-secondary); }
      .tpm-style-dashed { border-top: 2px dashed var(--text-secondary); }
      .tpm-style-dotted { border-top: 2px dotted var(--text-secondary); }

      .tpm-section-divider {
        height: 1px;
        background: var(--border);
        margin: 12px 0;
      }

      .tpm-textarea {
        flex: 1;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-family: var(--text-sans);
        padding: 6px 8px;
        outline: none;
        resize: vertical;
        min-height: 56px;
        transition: border-color 0.15s;
        width: 100%;
      }

      .tpm-textarea:focus { border-color: var(--accent-info); }

      .tpm-text-input {
        flex: 1;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-family: var(--text-sans);
        padding: 5px 8px;
        outline: none;
        transition: border-color 0.15s;
        width: 100%;
      }

      .tpm-text-input:focus { border-color: var(--accent-info); }

      .tpm-toggle-btn {
        padding: 4px 9px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--text-muted);
        font-size: var(--text-sm);
        cursor: pointer;
        font-family: var(--text-sans);
        transition: all 0.15s;
        min-width: 28px;
        text-align: center;
      }

      .tpm-toggle-btn.active {
        background: rgba(var(--accent-info-rgb), 0.15);
        border-color: rgba(var(--accent-info-rgb), 0.35);
        color: var(--accent-info);
      }

      .tpm-coord-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }

      .tpm-coord-label {
        font-size: var(--text-sm);
        color: var(--text-muted);
        min-width: 56px;
        flex-shrink: 0;
      }

      .tpm-coord-value {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        font-family: var(--text-mono);
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 5px 8px;
        flex: 1;
      }

      .tpm-no-schema {
        text-align: center;
        padding: 30px 20px;
        color: var(--text-muted);
        font-size: var(--text-sm);
      }

      .tpm-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: var(--bg-card);
        border-top: 1px solid var(--border);
        flex-shrink: 0;
      }

      .tpm-footer-left  { display: flex; gap: 6px; align-items: center; position: relative; }
      .tpm-footer-right { display: flex; gap: 6px; align-items: center; }

      .tpm-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: var(--text-sm);
        font-family: var(--text-sans);
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: filter 0.15s;
      }

      .tpm-btn:hover { filter: brightness(1.15); }

      .tpm-btn-template {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        color: var(--text-secondary);
      }

      .tpm-btn-cancel {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        color: var(--text-secondary);
      }

      .tpm-btn-ok {
        background: rgba(var(--accent-info-rgb), 0.15);
        border: 1px solid rgba(var(--accent-info-rgb), 0.3);
        color: var(--accent-info);
        font-weight: 600;
      }

      .tpm-template-wrap { position: relative; }

      .tpm-template-menu {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 0;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 6px;
        box-shadow: var(--card-shadow);
        z-index: 10010;
        display: none;
        flex-direction: column;
        min-width: 160px;
        padding: 3px;
      }

      .tpm-template-menu.open { display: flex; }

      .tpm-template-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: var(--text-sm);
        color: var(--text-secondary);
        transition: background 0.1s;
        white-space: nowrap;
      }

      .tpm-template-item:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
    `;

    document.head.appendChild(style);
  }
}
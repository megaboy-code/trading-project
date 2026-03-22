// ================================================================
// ⚙️ INDICATOR SETTINGS MODAL
// ================================================================

import { LegendItem } from '../chart-types';
import { getIndicatorConfig, IndicatorFieldConfig } from '../indicator/indicator-configs';

export class IndicatorSettingsModal {
    private modal:    HTMLElement | null = null;
    private item:     LegendItem;
    private settings: Record<string, any> = {};
    private color:    string;

    // ==================== DRAGGING ====================
    private isDragging:  boolean = false;
    private dragOffsetX: number  = 0;
    private dragOffsetY: number  = 0;

    constructor(item: LegendItem) {
        this.item     = item;
        this.color    = item.color;
        this.settings = item.settings ? { ...item.settings } : this.extractSettingsFallback();
    }

    public open(): void {
        if (document.getElementById('indicator-settings-modal')) return;

        const type   = this.item.id.split('_')[0];
        const config = getIndicatorConfig(type);

        this.modal    = document.createElement('div');
        this.modal.id = 'indicator-settings-modal';
        this.modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-elevated);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 0;
            width: 320px;
            box-shadow: var(--card-shadow);
            z-index: 10001;
            font-family: var(--text-sans);
            overflow: hidden;
        `;

        this.modal.appendChild(this.createHeader(config?.name || this.item.name));

        const body = document.createElement('div');
        body.style.cssText = `padding: 14px 16px;`;

        body.appendChild(this.createColorRow());

        if (config) {
            config.fields.forEach(field => {
                const currentValue = this.settings[field.key] ?? field.defaultValue;
                body.appendChild(this.createField(field, currentValue));
            });
        }

        this.modal.appendChild(body);
        this.modal.appendChild(this.createFooter());

        document.body.appendChild(this.modal);
        this.setupDragging();
        this.setupCloseOnOutsideClick();
    }

    public close(): void {
        if (this.modal && document.body.contains(this.modal)) {
            document.body.removeChild(this.modal);
        }
        this.modal = null;
    }

    // ==================== SETTINGS FALLBACK ====================

    private extractSettingsFallback(): Record<string, any> {
        const parts    = this.item.id.split('_');
        const settings: Record<string, any> = {};
        if (parts.length >= 2) settings.period = parseInt(parts[1]) || 20;
        if (parts.length >= 3) settings.source = parts[2] || 'close';
        return settings;
    }

    // ==================== HEADER ====================

    private createHeader(title: string): HTMLElement {
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 11px 14px;
            background: var(--bg-card);
            border-bottom: 1px solid var(--border);
            cursor: grab;
            user-select: none;
            flex-shrink: 0;
        `;

        const left = document.createElement('div');
        left.style.cssText = `display: flex; align-items: center; gap: 8px;`;

        const dragIcon = document.createElement('i');
        dragIcon.className = 'fas fa-grip-vertical';
        dragIcon.style.cssText = `
            color: var(--text-muted);
            font-size: var(--text-base);
            flex-shrink: 0;
        `;

        const titleEl = document.createElement('span');
        titleEl.style.cssText = `
            font-size: var(--text-xl);
            font-weight: 600;
            color: var(--text-primary);
        `;
        titleEl.textContent = title;

        left.appendChild(dragIcon);
        left.appendChild(titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-muted);
            cursor: pointer;
            font-size: var(--text-xl);
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            transition: all 0.15s ease;
        `;
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background   = `rgba(var(--accent-sell-rgb), 0.1)`;
            closeBtn.style.borderColor  = `var(--accent-sell)`;
            closeBtn.style.color        = `var(--accent-sell)`;
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background   = `var(--bg-base)`;
            closeBtn.style.borderColor  = `var(--border)`;
            closeBtn.style.color        = `var(--text-muted)`;
        });
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(left);
        header.appendChild(closeBtn);
        return header;
    }

    // ==================== COLOR ROW ====================

    private createColorRow(): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 7px 0;
            border-bottom: 1px solid var(--border-light);
        `;

        const label = document.createElement('span');
        label.style.cssText = `
            font-size: var(--text-lg);
            color: var(--text-secondary);
            font-weight: 500;
        `;
        label.textContent = 'Color';

        // ✅ Color swatch only — no hex label
        const preview = document.createElement('div');
        preview.style.cssText = `
            width: 32px;
            height: 24px;
            border-radius: var(--radius-xs);
            background-color: ${this.color};
            border: 1px solid var(--border);
            cursor: pointer;
            transition: border-color 0.15s ease;
        `;

        preview.addEventListener('mouseenter', () => {
            preview.style.borderColor = `var(--accent-info)`;
        });
        preview.addEventListener('mouseleave', () => {
            preview.style.borderColor = `var(--border)`;
        });

        // ✅ Lazy load color picker on click
        preview.addEventListener('click', async () => {
            const { ColorPicker } = await import('../../core/color-picker');
            const current = this.parseToHexOpacity(this.color);

            const picker = new ColorPicker({
                color:   current.hex,
                opacity: current.opacity,
                onChange: (hex: string, opacity: number) => {
                    const newVal              = opacity < 1 ? this.hexToRgba(hex, opacity) : hex;
                    this.color                = newVal;
                    preview.style.backgroundColor = this.toDisplayColor(newVal);
                }
            });
            picker.open(preview);
        });

        row.appendChild(label);
        row.appendChild(preview);
        return row;
    }

    // ==================== DYNAMIC FIELDS ====================

    private createField(field: IndicatorFieldConfig, value: any): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 0;
            border-bottom: 1px solid var(--border-light);
        `;

        const label = document.createElement('span');
        label.style.cssText = `
            font-size: var(--text-lg);
            color: var(--text-secondary);
            font-weight: 500;
        `;
        label.textContent = field.label;

        let input: HTMLElement;

        if (field.type === 'select' && Array.isArray(field.options)) {
            input = this.createSelect(field, value);
        } else if (field.type === 'checkbox') {
            input = this.createCheckbox(field, value);
        } else {
            input = this.createNumberInput(field, value);
        }

        row.appendChild(label);
        row.appendChild(input);
        return row;
    }

    private createNumberInput(field: IndicatorFieldConfig, value: any): HTMLElement {
        const input   = document.createElement('input');
        input.type    = 'number';
        input.value   = value?.toString() || '';
        input.style.cssText = `
            width: 80px;
            padding: 4px 8px;
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-primary);
            font-size: var(--text-lg);
            font-family: var(--text-mono);
            text-align: right;
            outline: none;
            transition: border-color 0.15s ease;
        `;

        input.addEventListener('focus', () => input.style.borderColor = `var(--accent-info)`);
        input.addEventListener('blur',  () => input.style.borderColor = `var(--border)`);

        if (field.options && !Array.isArray(field.options)) {
            const opts  = field.options as { min: number; max: number; step: number };
            input.min   = opts.min.toString();
            input.max   = opts.max.toString();
            input.step  = opts.step.toString();
        }

        input.addEventListener('change', () => {
            this.settings[field.key] = parseFloat(input.value);
        });

        return input;
    }

    private createSelect(field: IndicatorFieldConfig, value: any): HTMLElement {
        const select = document.createElement('select');
        select.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-primary);
            font-size: var(--text-lg);
            font-family: var(--text-sans);
            cursor: pointer;
            outline: none;
            transition: border-color 0.15s ease;
        `;

        select.addEventListener('focus', () => select.style.borderColor = `var(--accent-info)`);
        select.addEventListener('blur',  () => select.style.borderColor = `var(--border)`);

        (field.options as string[]).forEach(opt => {
            const option       = document.createElement('option');
            option.value       = opt;
            option.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
            if (opt === value) option.selected = true;
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            this.settings[field.key] = select.value;
        });

        return select;
    }

    private createCheckbox(field: IndicatorFieldConfig, value: any): HTMLElement {
        const input     = document.createElement('input');
        input.type      = 'checkbox';
        input.checked   = value === true;
        input.style.cssText = `
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: var(--accent-info);
        `;
        input.addEventListener('change', () => {
            this.settings[field.key] = input.checked;
        });
        return input;
    }

    // ==================== FOOTER ====================

    private createFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 10px 14px;
            border-top: 1px solid var(--border);
            background: var(--bg-card);
            flex-shrink: 0;
        `;

        const cancelBtn       = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            flex: 1;
            padding: 7px;
            background: var(--glass-gradient), var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-secondary);
            font-size: var(--text-lg);
            font-family: var(--text-sans);
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.borderColor = `var(--text-secondary)`;
            cancelBtn.style.color       = `var(--text-primary)`;
        });
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.borderColor = `var(--border)`;
            cancelBtn.style.color       = `var(--text-secondary)`;
        });
        cancelBtn.addEventListener('click', () => this.close());

        const applyBtn       = document.createElement('button');
        applyBtn.textContent = 'Apply';
        applyBtn.style.cssText = `
            flex: 1;
            padding: 7px;
            background: rgba(var(--accent-info-rgb), 0.1);
            border: 1px solid rgba(var(--accent-info-rgb), 0.3);
            border-radius: var(--radius-xs);
            color: var(--accent-info);
            font-size: var(--text-lg);
            font-weight: 600;
            font-family: var(--text-sans);
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        applyBtn.addEventListener('mouseenter', () => {
            applyBtn.style.background   = `rgba(var(--accent-info-rgb), 0.2)`;
            applyBtn.style.borderColor  = `var(--accent-info)`;
        });
        applyBtn.addEventListener('mouseleave', () => {
            applyBtn.style.background   = `rgba(var(--accent-info-rgb), 0.1)`;
            applyBtn.style.borderColor  = `rgba(var(--accent-info-rgb), 0.3)`;
        });
        applyBtn.addEventListener('click', () => {
            this.applySettings();
            this.close();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(applyBtn);
        return footer;
    }

    // ==================== APPLY ====================

    private applySettings(): void {
        const detail: Record<string, any> = {
            indicatorId: this.item.id
        };

        if (this.color !== this.item.color) {
            detail.color = this.color;
        }

        if (Object.keys(this.settings).length > 0) {
            detail.settings = { ...this.settings };
        }

        document.dispatchEvent(new CustomEvent('indicator-settings-changed', { detail }));
    }

    // ==================== DRAGGING ====================

    private setupDragging(): void {
        const header = this.modal?.querySelector('div') as HTMLElement;
        if (!header || !this.modal) return;

        header.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            this.isDragging  = true;
            const rect       = this.modal!.getBoundingClientRect();
            this.dragOffsetX = e.clientX - rect.left;
            this.dragOffsetY = e.clientY - rect.top;
            this.modal!.style.transform = 'none';
            this.modal!.style.cursor    = 'grabbing';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e: MouseEvent) => {
            if (!this.isDragging || !this.modal) return;
            const x      = e.clientX - this.dragOffsetX;
            const y      = e.clientY - this.dragOffsetY;
            const maxX   = window.innerWidth  - this.modal.offsetWidth;
            const maxY   = window.innerHeight - this.modal.offsetHeight;
            const boundX = Math.max(0, Math.min(x, maxX));
            const boundY = Math.max(0, Math.min(y, maxY));
            this.modal.style.left = `${boundX}px`;
            this.modal.style.top  = `${boundY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging             = false;
                this.modal!.style.cursor    = '';
                document.body.style.userSelect = '';
            }
        });
    }

    // ==================== OUTSIDE CLICK ====================

    private setupCloseOnOutsideClick(): void {
        setTimeout(() => {
            const handler = (e: MouseEvent) => {
                if (this.modal && !this.modal.contains(e.target as Node)) {
                    if ((e.target as HTMLElement).closest('.cp-container')) return;
                    this.close();
                    document.removeEventListener('click', handler);
                }
            };
            document.addEventListener('click', handler);
        }, 100);
    }

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
}
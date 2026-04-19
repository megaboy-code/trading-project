// ================================================================
// ⚙️ INDICATOR SETTINGS MODAL - Merged Indicator & Strategy
// Backend drives config — frontend owns color and line width only
// One modal for both indicators and strategies
// Lines built from LegendItem.values — one row per line
// Period override — dispatches resubscribe with new period
// Position — top-left under legend
// ================================================================

import { LegendItem } from '../chart-types';

interface LineSettings {
    name:      string;
    color:     string;
    lineWidth: number;
}

// ── Period field labels ──
const PERIOD_LABELS: Record<string, string> = {
    period:        'Period',
    fast_period:   'Fast Period',
    slow_period:   'Slow Period',
    signal_period: 'Signal Period',
    k_period:      'K Period',
    d_period:      'D Period',
    slowing:       'Slowing',
};

export class IndicatorSettingsModal {
    private modal:        HTMLElement | null = null;
    private item:         LegendItem;
    private lineSettings: LineSettings[] = [];
    private isStrategy:   boolean;

    // ── Period overrides — only fields with value > 0 from settings ──
    private periodInputs: Record<string, HTMLInputElement> = {};

    // ==================== DRAGGING ====================
    private isDragging:  boolean = false;
    private dragOffsetX: number  = 0;
    private dragOffsetY: number  = 0;

    constructor(item: LegendItem) {
        this.item       = item;
        this.isStrategy = item.icon === 'fa-robot';

        // ── Build line settings from legend values ──
        // Use line.name from pool via item.values label
        // For non-strategy label is '' — show 'Line' as fallback
        this.lineSettings = (item.values || []).map(v => ({
            name:      v.label || 'Line',
            color:     v.color || '#00d394',
            lineWidth: 1
        }));

        // ── Fallback — at least one line ──
        if (this.lineSettings.length === 0) {
            this.lineSettings.push({
                name:      'Line',
                color:     item.color || '#00d394',
                lineWidth: 1
            });
        }
    }

    public open(): void {
        const modalId = 'indicator-settings-modal';
        if (document.getElementById(modalId)) return;

        this.modal    = document.createElement('div');
        this.modal.id = modalId;

        // ── Position top-left under legend ──
        this.modal.style.cssText = `
            position: fixed;
            top: 60px;
            left: 12px;
            transform: none;
            background: var(--bg-elevated);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 0;
            width: 300px;
            box-shadow: var(--card-shadow);
            z-index: 10001;
            font-family: var(--text-sans);
            overflow: hidden;
        `;

        const title = this.isStrategy ? 'Strategy Settings' : 'Indicator Settings';
        this.modal.appendChild(this.createHeader(title));

        const body = document.createElement('div');
        body.style.cssText = `padding: 14px 16px;`;

        // ── Name label ──
        body.appendChild(this.createNameLabel());

        // ── Period inputs — from item.settings, only non-zero fields ──
        const periodsEl = this.createPeriodInputs();
        if (periodsEl) body.appendChild(periodsEl);

        // ── One color + line width row per line ──
        this.lineSettings.forEach((line, index) => {
            body.appendChild(this.createLineRow(line, index));
        });

        // ── Display options ──
        body.appendChild(this.createDisplayOptions());

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

    // ==================== NAME LABEL ====================

    private createNameLabel(): HTMLElement {
        const label = document.createElement('div');
        label.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 14px;
            font-size: var(--text-lg);
            color: var(--text-muted);
        `;

        if (this.isStrategy) {
            const icon     = document.createElement('i');
            icon.className = 'fas fa-robot';
            icon.style.color = this.lineSettings[0]?.color || '#00d394';
            label.appendChild(icon);
        }

        const name       = document.createElement('span');
        name.textContent = this.item.name;
        label.appendChild(name);

        return label;
    }

    // ==================== PERIOD INPUTS ====================

    private createPeriodInputs(): HTMLElement | null {
        const settings = this.item.settings as Record<string, any> | undefined;
        if (!settings) return null;

        const fields = Object.keys(PERIOD_LABELS).filter(
            k => typeof settings[k] === 'number' && settings[k] > 0
        );

        if (fields.length === 0) return null;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `margin-bottom: 4px;`;

        fields.forEach(field => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 7px 0;
                border-bottom: 1px solid var(--border-light);
                gap: 8px;
            `;

            const label       = document.createElement('span');
            label.style.cssText = `
                font-size: var(--text-lg);
                color: var(--text-secondary);
                font-weight: 500;
                flex: 1;
            `;
            label.textContent = PERIOD_LABELS[field];

            const input   = document.createElement('input');
            input.type    = 'number';
            input.value   = String(settings[field]);
            input.min     = '1';
            input.max     = '999';
            input.step    = '1';
            input.style.cssText = `
                width: 64px;
                padding: 4px 6px;
                background: var(--bg-base);
                border: 1px solid var(--border);
                border-radius: var(--radius-xs);
                color: var(--text-primary);
                font-size: var(--text-lg);
                font-family: var(--text-mono);
                text-align: center;
                outline: none;
                transition: border-color 0.15s ease;
            `;
            input.addEventListener('focus', () => input.style.borderColor = `var(--accent-info)`);
            input.addEventListener('blur',  () => input.style.borderColor = `var(--border)`);

            this.periodInputs[field] = input;

            row.appendChild(label);
            row.appendChild(input);
            wrapper.appendChild(row);
        });

        return wrapper;
    }

    // ==================== LINE ROW ====================

    private createLineRow(line: LineSettings, index: number): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 0;
            border-bottom: 1px solid var(--border-light);
            gap: 8px;
        `;

        const label       = document.createElement('span');
        label.style.cssText = `
            font-size: var(--text-lg);
            color: var(--text-secondary);
            font-weight: 500;
            flex: 1;
        `;
        label.textContent = line.name;

        // ── Line width input ──
        const widthInput   = document.createElement('input');
        widthInput.type    = 'number';
        widthInput.value   = String(line.lineWidth);
        widthInput.min     = '1';
        widthInput.max     = '5';
        widthInput.step    = '1';
        widthInput.style.cssText = `
            width: 48px;
            padding: 4px 6px;
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-primary);
            font-size: var(--text-lg);
            font-family: var(--text-mono);
            text-align: center;
            outline: none;
            transition: border-color 0.15s ease;
        `;
        widthInput.addEventListener('focus', () => widthInput.style.borderColor = `var(--accent-info)`);
        widthInput.addEventListener('blur',  () => widthInput.style.borderColor = `var(--border)`);
        widthInput.addEventListener('change', () => {
            this.lineSettings[index].lineWidth = parseInt(widthInput.value) || 1;
        });

        // ── Color swatch ──
        const preview = document.createElement('div');
        preview.style.cssText = `
            width: 32px;
            height: 24px;
            border-radius: var(--radius-xs);
            background-color: ${line.color};
            border: 1px solid var(--border);
            cursor: pointer;
            transition: border-color 0.15s ease;
            flex-shrink: 0;
        `;
        preview.addEventListener('mouseenter', () => preview.style.borderColor = `var(--accent-info)`);
        preview.addEventListener('mouseleave', () => preview.style.borderColor = `var(--border)`);
        preview.addEventListener('click', async () => {
            const { ColorPicker } = await import('../../core/color-picker');
            const current = this.parseToHexOpacity(line.color);
            const picker  = new ColorPicker({
                color:    current.hex,
                opacity:  current.opacity,
                onChange: (hex: string, opacity: number) => {
                    const newColor             = opacity < 1
                        ? this.hexToRgba(hex, opacity)
                        : hex;
                    this.lineSettings[index].color    = newColor;
                    preview.style.backgroundColor = this.toDisplayColor(newColor);
                }
            });
            picker.open(preview);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(widthInput);
        wrapper.appendChild(preview);
        return wrapper;
    }

    // ==================== DISPLAY OPTIONS ====================

    private createDisplayOptions(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `margin-top: 4px;`;

        const options = [
            { key: 'priceLineVisible',       label: 'Price Line'       },
            { key: 'lastValueVisible',        label: 'Last Value'       },
            { key: 'crosshairMarkerVisible',  label: 'Crosshair Marker' }
        ];

        options.forEach(opt => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 7px 0;
                border-bottom: 1px solid var(--border-light);
            `;

            const label       = document.createElement('span');
            label.style.cssText = `
                font-size: var(--text-lg);
                color: var(--text-secondary);
                font-weight: 500;
            `;
            label.textContent = opt.label;

            const checkbox     = document.createElement('input');
            checkbox.type      = 'checkbox';
            checkbox.checked   = true;
            checkbox.style.cssText = `
                width: 16px;
                height: 16px;
                cursor: pointer;
                accent-color: var(--accent-info);
            `;
            checkbox.addEventListener('change', () => {
                this.lineSettings.forEach(line => {
                    (line as any)[opt.key] = checkbox.checked;
                });
            });

            row.appendChild(label);
            row.appendChild(checkbox);
            wrapper.appendChild(row);
        });

        return wrapper;
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

        const dragIcon     = document.createElement('i');
        dragIcon.className = 'fas fa-grip-vertical';
        dragIcon.style.cssText = `
            color: var(--text-muted);
            font-size: var(--text-base);
            flex-shrink: 0;
        `;

        const titleEl       = document.createElement('span');
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
            closeBtn.style.background  = `rgba(var(--accent-sell-rgb), 0.1)`;
            closeBtn.style.borderColor = `var(--accent-sell)`;
            closeBtn.style.color       = `var(--accent-sell)`;
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background  = `var(--bg-base)`;
            closeBtn.style.borderColor = `var(--border)`;
            closeBtn.style.color       = `var(--text-muted)`;
        });
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(left);
        header.appendChild(closeBtn);
        return header;
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
            applyBtn.style.background  = `rgba(var(--accent-info-rgb), 0.2)`;
            applyBtn.style.borderColor = `var(--accent-info)`;
        });
        applyBtn.addEventListener('mouseleave', () => {
            applyBtn.style.background  = `rgba(var(--accent-info-rgb), 0.1)`;
            applyBtn.style.borderColor = `rgba(var(--accent-info-rgb), 0.3)`;
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
        // ── Line color + width ──
        const lines: Record<string, { color: string; lineWidth: number }> = {};
        this.lineSettings.forEach(line => {
            lines[line.name] = {
                color:     line.color,
                lineWidth: line.lineWidth
            };
        });

        document.dispatchEvent(new CustomEvent('indicator-settings-changed', {
            detail: {
                indicatorId: this.item.id,
                lines
            }
        }));

        // ── Period override — only if any period input exists ──
        const periodOverrides: Record<string, number> = {};
        let hasPeriodChange = false;

        Object.entries(this.periodInputs).forEach(([field, input]) => {
            const val = parseInt(input.value);
            if (val > 0) {
                periodOverrides[field] = val;
                hasPeriodChange = true;
            }
        });

        if (hasPeriodChange) {
            document.dispatchEvent(new CustomEvent('indicator-period-changed', {
                detail: {
                    indicatorId:     this.item.id,
                    periodOverrides
                }
            }));
        }
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
            this.modal!.style.cursor       = 'grabbing';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e: MouseEvent) => {
            if (!this.isDragging || !this.modal) return;
            const x    = e.clientX - this.dragOffsetX;
            const y    = e.clientY - this.dragOffsetY;
            const maxX = window.innerWidth  - this.modal.offsetWidth;
            const maxY = window.innerHeight - this.modal.offsetHeight;
            this.modal.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            this.modal.style.top  = `${Math.max(0, Math.min(y, maxY))}px`;
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging                = false;
                this.modal!.style.cursor       = '';
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

    private parseToHexOpacity(value: string): { hex: string; opacity: number } {
        if (!value) return { hex: '#3b82f6', opacity: 1 };
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

    private toDisplayColor(value: string): string {
        return this.parseToHexOpacity(value).hex;
    }
}

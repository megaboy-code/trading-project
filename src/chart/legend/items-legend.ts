// ================================================================
// 📊 ITEMS LEGEND - Generic display for indicators, strategies, volume
// ================================================================

import { LegendItem, LegendItemValue } from '../chart-types';
import { removeElement } from './utils';

export class ItemsLegend {
    private items:    Map<string, LegendItem>  = new Map();
    private elements: Map<string, HTMLElement> = new Map();

    // ==================== PUBLIC API ====================

    public addItem(item: LegendItem, container: HTMLElement): void {
        if (this.items.has(item.id)) {
            this.updateValue(item.id, item.values);
            return;
        }
        this.items.set(item.id, item);
        const el = this.createElement(item);
        this.elements.set(item.id, el);
        container.appendChild(el);
    }

    public removeItem(id: string): void {
        removeElement(this.elements.get(id) || null);
        this.elements.delete(id);
        this.items.delete(id);
    }

    public updateValue(id: string, values: LegendItemValue[]): void {
        const item = this.items.get(id);
        if (!item) return;
        item.values = values;
        this.updateElement(id, item);
    }

    public updateSingleValue(id: string, value: string): void {
        const item = this.items.get(id);
        if (!item || !item.values.length) return;
        item.values[0].value = value;
        this.updateElement(id, item);
    }

    public updateName(id: string, name: string): void {
        const item = this.items.get(id);
        if (!item) return;
        item.name = name;
        const el = this.elements.get(id);
        if (!el) return;
        const nameEl = el.querySelector('[data-role="name"]') as HTMLElement;
        if (nameEl) nameEl.textContent = name;
    }

    public updateSettings(id: string, settings: Record<string, any>): void {
        const item = this.items.get(id);
        if (!item) return;
        item.settings = { ...item.settings, ...settings };
    }

    public updateColor(id: string, color: string): void {
        const item = this.items.get(id);
        if (!item) return;
        item.color = color;
        this.syncDotColor(id, color);
    }

    public setVisible(id: string, visible: boolean): void {
        const el = this.elements.get(id);
        if (!el) return;
        el.style.opacity = visible ? '1' : '0.4';
    }

    public hasItem(id: string): boolean {
        return this.items.has(id);
    }

    public getItem(id: string): LegendItem | undefined {
        return this.items.get(id);
    }

    public getAll(): LegendItem[] {
        return Array.from(this.items.values());
    }

    // ── Remap both maps to new id after TF change ──
    public updateItemId(oldId: string, newId: string): void {
        const item = this.items.get(oldId);
        const el   = this.elements.get(oldId);
        if (!item || !el) return;

        item.id           = newId;
        el.dataset.itemId = newId;

        this.items.delete(oldId);
        this.elements.delete(oldId);
        this.items.set(newId, item);
        this.elements.set(newId, el);
    }

    public clear(): void {
        this.elements.forEach(el => removeElement(el));
        this.elements.clear();
        this.items.clear();
    }

    // ==================== COLOR SYNC ====================

    private syncDotColor(id: string, color: string): void {
        const el = this.elements.get(id);
        if (!el) return;
        const dotEl = el.querySelector('[data-role="dot"]') as HTMLElement;
        if (dotEl) dotEl.style.backgroundColor = color;
        const iconEl = el.querySelector('[data-role="icon"]') as HTMLElement;
        if (iconEl) iconEl.style.color = color;
    }

    // ==================== ELEMENT CREATION ====================

    private createElement(item: LegendItem): HTMLElement {
        const el = document.createElement('div');
        el.dataset.itemId = item.id;
        el.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 1px 4px;
            font-size: 10px;
            font-family: 'Inter', sans-serif;
            border-radius: 3px;
            cursor: pointer;
            pointer-events: auto;
            background: transparent;
            transition: background 150ms ease;
            animation: legendItemIn 200ms ease-out;
            user-select: none;
        `;

        const iconEl    = this.createIcon(item);
        const nameEl    = this.createNameEl(item);
        const valuesEl  = this.createValuesEl(item.values);
        const actionsEl = this.createActions(item);

        el.appendChild(iconEl);
        el.appendChild(nameEl);
        el.appendChild(valuesEl);
        el.appendChild(actionsEl);

        el.addEventListener('mouseenter', () => {
            el.style.background = 'var(--bg-hover)';
            actionsEl.style.opacity = '1';
        });
        el.addEventListener('mouseleave', () => {
            el.style.background = 'transparent';
            actionsEl.style.opacity = '0';
        });

        return el;
    }

    private createIcon(item: LegendItem): HTMLElement {
        if (item.icon) {
            const i = document.createElement('i');
            i.className = `fas ${item.icon}`;
            i.dataset.role = 'icon';
            i.style.cssText = `
                font-size: 9px;
                color: ${item.color};
                flex-shrink: 0;
            `;
            return i;
        }

        const dot = document.createElement('div');
        dot.dataset.role = 'dot';
        dot.style.cssText = `
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background-color: ${item.color};
            flex-shrink: 0;
        `;
        return dot;
    }

    private createNameEl(item: LegendItem): HTMLElement {
        const nameEl = document.createElement('span');
        nameEl.dataset.role = 'name';
        nameEl.style.cssText = `
            color: var(--text-primary);
            font-weight: 500;
            white-space: nowrap;
        `;
        nameEl.textContent = item.name;
        return nameEl;
    }

    private createValuesEl(values: LegendItemValue[]): HTMLElement {
        const el = document.createElement('div');
        el.dataset.role = 'values';
        el.style.cssText = `
            display: flex;
            align-items: center;
            gap: 3px;
        `;

        values.forEach((v, i) => {
            // ── · separator before each value group ──
            const sep = document.createElement('span');
            sep.style.cssText = `
                color: var(--border);
                font-weight: 400;
                font-size: 10px;
                flex-shrink: 0;
            `;
            sep.textContent = '·';
            el.appendChild(sep);

            if (v.label) {
                const label = document.createElement('span');
                label.style.cssText = `
                    font-size: 9px;
                    color: var(--text-muted);
                `;
                label.textContent = v.label;
                el.appendChild(label);

                // ── · between label and value ──
                const sep2 = document.createElement('span');
                sep2.style.cssText = `
                    color: var(--border);
                    font-weight: 400;
                    font-size: 10px;
                    flex-shrink: 0;
                `;
                sep2.textContent = '·';
                el.appendChild(sep2);
            }

            const val = document.createElement('span');
            val.style.cssText = `
                font-weight: 600;
                color: ${v.color};
                font-variant-numeric: tabular-nums;
                font-size: 10px;
                white-space: nowrap;
            `;
            val.textContent = v.value;
            el.appendChild(val);
        });

        return el;
    }

    private createActions(item: LegendItem): HTMLElement {
        const el = document.createElement('div');
        el.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            opacity: 0;
            transition: opacity 150ms ease;
            margin-left: auto;
            flex-shrink: 0;
            padding-left: 4px;
        `;

        const settingsBtn = this.createActionIcon('fa-cog',   'var(--text-muted)');
        const eyeBtn      = this.createActionIcon('fa-eye',   'var(--text-muted)');
        const removeBtn   = this.createActionIcon('fa-times', 'var(--accent-sell)');

        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            document.dispatchEvent(new CustomEvent('legend-item-settings', {
                detail: { id: item.id, item, triggerRect: rect }
            }));
        });

        eyeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('legend-item-toggle', {
                detail: { id: item.id }
            }));
        });

        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('legend-item-remove', {
                detail: { id: item.id }
            }));
        });

        el.appendChild(settingsBtn);
        el.appendChild(eyeBtn);
        el.appendChild(removeBtn);

        return el;
    }

    private createActionIcon(iconClass: string, color: string): HTMLElement {
        const i = document.createElement('i');
        i.className = `fas ${iconClass}`;
        i.style.cssText = `
            font-size: 9px;
            color: ${color};
            cursor: pointer;
            padding: 2px;
            transition: transform 150ms ease;
            pointer-events: auto;
        `;
        i.addEventListener('mouseenter', () => i.style.transform = 'scale(1.2)');
        i.addEventListener('mouseleave', () => i.style.transform = 'scale(1)');
        return i;
    }

    // ==================== ELEMENT UPDATE ====================

    private updateElement(id: string, item: LegendItem): void {
        const el = this.elements.get(id);
        if (!el) return;
        const oldValuesEl = el.querySelector('[data-role="values"]') as HTMLElement;
        if (!oldValuesEl) return;
        oldValuesEl.replaceWith(this.createValuesEl(item.values));
    }

    // ==================== DESTROY ====================

    public destroy(): void {
        this.clear();
    }
}

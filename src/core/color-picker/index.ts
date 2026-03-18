// ================================================================
// 🎨 COLOR PICKER - src/core/color-picker/index.ts
// Reusable TradingView-style color picker component
// ================================================================

export interface ColorPickerOptions {
  color?:   string;
  opacity?: number;
  onChange?: (color: string, opacity: number) => void;
  onClose?:  () => void;
}

export class ColorPicker {
  private container: HTMLElement | null = null;
  private canvas:    HTMLCanvasElement | null = null;
  private ctx:       CanvasRenderingContext2D | null = null;

  private currentHue:        number = 210;
  private currentSaturation: number = 0.7;
  private currentBrightness: number = 0.9;
  private currentOpacity:    number = 1;
  private currentHex:        string = '#3b82f6';

  private isDraggingCanvas:  boolean = false;
  private isDraggingHue:     boolean = false;
  private isDraggingOpacity: boolean = false;

  private options: ColorPickerOptions;

  private static RECENT_COLORS_KEY = 'megaflowz_recent_colors';
  private static MAX_RECENT        = 8;

  private static PRESETS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
    '#00d394', '#ff4d6b', '#3a86ff', '#ffffff',
    '#94a3b8', '#475569', '#1e293b', '#000000'
  ];

  constructor(options: ColorPickerOptions = {}) {
    this.options = options;

    if (options.color) {
      const parsed          = this.hexToHsb(options.color);
      this.currentHue        = parsed.h;
      this.currentSaturation = parsed.s;
      this.currentBrightness = parsed.b;
      this.currentHex        = options.color;
    }

    if (options.opacity !== undefined) {
      this.currentOpacity = options.opacity;
    }

    this.injectStyles();
  }

  // ==================== OPEN / CLOSE ====================

  public open(anchor: HTMLElement): void {
    this.close();
    this.createPicker(anchor);
  }

  public close(): void {
    if (this.container && document.body.contains(this.container)) {
      this.container.classList.add('cp-closing');
      setTimeout(() => {
        if (this.container && document.body.contains(this.container)) {
          document.body.removeChild(this.container);
        }
        this.container = null;
        this.canvas    = null;
        this.ctx       = null;
      }, 150);
    }
    document.removeEventListener('mousedown', this.handleOutsideClick);
  }

  // ==================== CREATE PICKER ====================

  private createPicker(anchor: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.className = 'cp-container';

    this.container.innerHTML = `
      <div class="cp-gradient-wrap">
        <canvas class="cp-canvas" width="220" height="150"></canvas>
        <div class="cp-canvas-cursor"></div>
      </div>
      <div class="cp-sliders">
        <div class="cp-hue-slider">
          <div class="cp-hue-thumb"></div>
        </div>
        <div class="cp-opacity-slider">
          <div class="cp-opacity-track"></div>
          <div class="cp-opacity-thumb"></div>
        </div>
      </div>
      <div class="cp-preview-row">
        <div class="cp-preview-swatch">
          <div class="cp-preview-swatch-inner"></div>
        </div>
        <input class="cp-hex-input" type="text" maxlength="7" placeholder="#000000" />
        <input class="cp-opacity-input" type="number" min="0" max="100" />
        <span class="cp-opacity-label">%</span>
      </div>
      <div class="cp-divider"></div>
      <div class="cp-presets">
        ${ColorPicker.PRESETS.map(c =>
          `<div class="cp-swatch" style="background:${c}" data-color="${c}"></div>`
        ).join('')}
      </div>
      <div class="cp-recents-wrap">
        <div class="cp-recents-title">Recent</div>
        <div class="cp-recents"></div>
      </div>
    `;

    document.body.appendChild(this.container);

    this.canvas = this.container.querySelector('.cp-canvas');
    this.ctx    = this.canvas?.getContext('2d') || null;

    this.fullUpdate();
    this.renderRecents();
    this.positionPicker(anchor);
    this.setupCanvasEvents();
    this.setupHueEvents();
    this.setupOpacityEvents();
    this.setupHexInput();
    this.setupOpacityInput();
    this.setupSwatches();

    setTimeout(() => {
      document.addEventListener('mousedown', this.handleOutsideClick);
    }, 0);
  }

  // ==================== POSITION ====================

  private positionPicker(anchor: HTMLElement): void {
    if (!this.container) return;

    const rect    = anchor.getBoundingClientRect();
    const pickerW = 240;
    const pickerH = this.container.offsetHeight || 380;

    // ✅ Open above anchor, right-aligned to it
    let left = rect.right - pickerW;
    let top  = rect.top - pickerH - 8;

    // ✅ Clamp to viewport
    if (left < 8)                             left = 8;
    if (top  < 8)                             top  = rect.bottom + 8;
    if (left + pickerW > window.innerWidth)   left = window.innerWidth - pickerW - 8;
    if (top  + pickerH > window.innerHeight)  top  = window.innerHeight - pickerH - 8;

    this.container.style.left = `${left}px`;
    this.container.style.top  = `${top}px`;
  }

  // ==================== CANVAS RENDERING ====================

  private renderCanvas(): void {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    const gH = this.ctx.createLinearGradient(0, 0, w, 0);
    gH.addColorStop(0, 'rgba(255,255,255,1)');
    gH.addColorStop(1, `hsl(${this.currentHue}, 100%, 50%)`);
    this.ctx.fillStyle = gH;
    this.ctx.fillRect(0, 0, w, h);

    const gV = this.ctx.createLinearGradient(0, 0, 0, h);
    gV.addColorStop(0, 'rgba(0,0,0,0)');
    gV.addColorStop(1, 'rgba(0,0,0,1)');
    this.ctx.fillStyle = gV;
    this.ctx.fillRect(0, 0, w, h);
  }

  private updateCursor(): void {
    if (!this.container || !this.canvas) return;
    const cursor = this.container.querySelector('.cp-canvas-cursor') as HTMLElement;
    if (!cursor) return;
    cursor.style.left = `${this.currentSaturation * this.canvas.width}px`;
    cursor.style.top  = `${(1 - this.currentBrightness) * this.canvas.height}px`;
  }

  private updateHueThumb(): void {
    if (!this.container) return;
    const thumb = this.container.querySelector('.cp-hue-thumb') as HTMLElement;
    if (thumb) thumb.style.left = `${(this.currentHue / 360) * 100}%`;
  }

  private updateOpacityTrack(): void {
    if (!this.container) return;
    const track = this.container.querySelector('.cp-opacity-track') as HTMLElement;
    if (track) track.style.background = `linear-gradient(to right, transparent, ${this.currentHex})`;
  }

  private updateOpacityThumb(): void {
    if (!this.container) return;
    const thumb = this.container.querySelector('.cp-opacity-thumb') as HTMLElement;
    if (thumb) thumb.style.left = `${this.currentOpacity * 100}%`;
  }

  private updatePreview(): void {
    if (!this.container) return;
    const inner   = this.container.querySelector('.cp-preview-swatch-inner') as HTMLElement;
    const hexIn   = this.container.querySelector('.cp-hex-input')    as HTMLInputElement;
    const opIn    = this.container.querySelector('.cp-opacity-input') as HTMLInputElement;
    const [r,g,b] = this.hexToRgb(this.currentHex);

    if (inner)                              inner.style.background = `rgba(${r},${g},${b},${this.currentOpacity})`;
    if (hexIn && document.activeElement !== hexIn) hexIn.value = this.currentHex;
    if (opIn  && document.activeElement !== opIn)  opIn.value  = `${Math.round(this.currentOpacity * 100)}`;
  }

  private fullUpdate(): void {
    this.renderCanvas();
    this.updateCursor();
    this.updateHueThumb();
    this.updateOpacityTrack();
    this.updateOpacityThumb();
    this.updatePreview();
  }

  // ==================== CANVAS EVENTS ====================

  private setupCanvasEvents(): void {
    if (!this.canvas) return;

    const onMove = (e: MouseEvent) => {
      if (!this.isDraggingCanvas || !this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const x    = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y    = Math.max(0, Math.min(e.clientY - rect.top,  rect.height));
      this.currentSaturation = x / rect.width;
      this.currentBrightness = 1 - y / rect.height;
      this.currentHex        = this.hsbToHex(this.currentHue, this.currentSaturation, this.currentBrightness);
      this.updateCursor();
      this.updateOpacityTrack();
      this.updatePreview();
      this.emitChange();
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDraggingCanvas = true;
      onMove(e);
    });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   () => { this.isDraggingCanvas = false; });
  }

  // ==================== HUE EVENTS ====================

  private setupHueEvents(): void {
    if (!this.container) return;
    const hueSlider = this.container.querySelector('.cp-hue-slider') as HTMLElement;
    if (!hueSlider) return;

    const onMove = (e: MouseEvent) => {
      if (!this.isDraggingHue) return;
      const rect        = hueSlider.getBoundingClientRect();
      const x           = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      this.currentHue   = Math.round((x / rect.width) * 360);
      this.currentHex   = this.hsbToHex(this.currentHue, this.currentSaturation, this.currentBrightness);
      this.renderCanvas();
      this.updateHueThumb();
      this.updateOpacityTrack();
      this.updatePreview();
      this.emitChange();
    };

    hueSlider.addEventListener('mousedown', (e) => { this.isDraggingHue = true; onMove(e); });
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseup',    () => { this.isDraggingHue = false; });
  }

  // ==================== OPACITY EVENTS ====================

  private setupOpacityEvents(): void {
    if (!this.container) return;
    const opSlider = this.container.querySelector('.cp-opacity-slider') as HTMLElement;
    if (!opSlider) return;

    const onMove = (e: MouseEvent) => {
      if (!this.isDraggingOpacity) return;
      const rect            = opSlider.getBoundingClientRect();
      const x               = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      this.currentOpacity   = parseFloat((x / rect.width).toFixed(2));
      this.updateOpacityThumb();
      this.updatePreview();
      this.emitChange();
    };

    opSlider.addEventListener('mousedown', (e) => { this.isDraggingOpacity = true; onMove(e); });
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseup',    () => { this.isDraggingOpacity = false; });
  }

  // ==================== HEX INPUT ====================

  private setupHexInput(): void {
    if (!this.container) return;
    const hexInput = this.container.querySelector('.cp-hex-input') as HTMLInputElement;
    if (!hexInput) return;

    hexInput.addEventListener('input', () => {
      const val = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        this.setColor(val, this.currentOpacity);
      }
    });

    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') hexInput.blur();
    });
  }

  // ==================== OPACITY INPUT ====================

  private setupOpacityInput(): void {
    if (!this.container) return;
    const opInput = this.container.querySelector('.cp-opacity-input') as HTMLInputElement;
    if (!opInput) return;

    opInput.addEventListener('input', () => {
      const val = parseInt(opInput.value);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        this.currentOpacity = val / 100;
        this.updateOpacityThumb();
        this.updatePreview();
        this.emitChange();
      }
    });
  }

  // ==================== SWATCHES ====================

  private setupSwatches(): void {
    if (!this.container) return;
    this.container.querySelectorAll('.cp-presets .cp-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = (swatch as HTMLElement).dataset.color!;
        this.setColor(color, this.currentOpacity);
      });
    });
  }

  private renderRecents(): void {
    if (!this.container) return;
    const recentsEl = this.container.querySelector('.cp-recents') as HTMLElement;
    if (!recentsEl) return;

    const recents     = this.getRecentColors();
    recentsEl.innerHTML = recents.map(c =>
      `<div class="cp-swatch" style="background:${c}" data-color="${c}"></div>`
    ).join('');

    recentsEl.querySelectorAll('.cp-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = (swatch as HTMLElement).dataset.color!;
        this.setColor(color, this.currentOpacity);
      });
    });
  }

  // ==================== SET COLOR ====================

  public setColor(hex: string, opacity: number = 1): void {
    this.currentHex     = hex;
    this.currentOpacity = opacity;
    const hsb            = this.hexToHsb(hex);
    this.currentHue        = hsb.h;
    this.currentSaturation = hsb.s;
    this.currentBrightness = hsb.b;
    this.fullUpdate();
    this.emitChange();
  }

  public getColor(): { hex: string; opacity: number } {
    return { hex: this.currentHex, opacity: this.currentOpacity };
  }

  // ==================== EMIT ====================

  private emitChange(): void {
    if (this.options.onChange) {
      this.options.onChange(this.currentHex, this.currentOpacity);
    }
  }

  // ==================== RECENT COLORS ====================

  private getRecentColors(): string[] {
    try {
      return JSON.parse(localStorage.getItem(ColorPicker.RECENT_COLORS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  public saveRecentColor(hex: string): void {
    const recents = this.getRecentColors().filter(c => c !== hex);
    recents.unshift(hex);
    recents.splice(ColorPicker.MAX_RECENT);
    try {
      localStorage.setItem(ColorPicker.RECENT_COLORS_KEY, JSON.stringify(recents));
    } catch {}
  }

  // ==================== OUTSIDE CLICK ====================

  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.container && !this.container.contains(e.target as Node)) {
      this.saveRecentColor(this.currentHex);
      this.close();
      if (this.options.onClose) this.options.onClose();
    }
  };

  // ==================== COLOR CONVERSION ====================

  private hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  }

  private hexToHsb(hex: string): { h: number; s: number; b: number } {
    const [r, g, b] = this.hexToRgb(hex).map(v => v / 255);
    const max   = Math.max(r, g, b);
    const min   = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if      (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else                h = (r - g) / delta + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    return { h, s: max === 0 ? 0 : delta / max, b: max };
  }

  private hsbToHex(h: number, s: number, b: number): string {
    const f = (n: number) => {
      const k = (n + h / 60) % 6;
      return b - b * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    const r  = Math.round(f(5) * 255);
    const g  = Math.round(f(3) * 255);
    const bv = Math.round(f(1) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`;
  }

  // ==================== STYLES ====================

  private injectStyles(): void {
    if (document.getElementById('cp-styles')) return;

    const style   = document.createElement('style');
    style.id      = 'cp-styles';
    style.textContent = `
      .cp-container {
        position: fixed;
        width: 240px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 10px;
        box-shadow: var(--card-shadow);
        z-index: 99999;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: var(--text-sans);
        animation: cpFadeIn 0.15s ease;
      }

      .cp-container.cp-closing {
        animation: cpFadeOut 0.15s ease forwards;
      }

      @keyframes cpFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      @keyframes cpFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(6px); }
      }

      .cp-gradient-wrap {
        position: relative;
        width: 100%;
        height: 150px;
        border-radius: 6px;
        overflow: hidden;
        cursor: crosshair;
      }

      .cp-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }

      .cp-canvas-cursor {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.5);
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .cp-sliders {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .cp-hue-slider {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background: linear-gradient(to right,
          hsl(0,100%,50%), hsl(30,100%,50%), hsl(60,100%,50%),
          hsl(90,100%,50%), hsl(120,100%,50%), hsl(150,100%,50%),
          hsl(180,100%,50%), hsl(210,100%,50%), hsl(240,100%,50%),
          hsl(270,100%,50%), hsl(300,100%,50%), hsl(330,100%,50%),
          hsl(360,100%,50%)
        );
        cursor: pointer;
      }

      .cp-hue-thumb {
        position: absolute;
        top: 50%;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: white;
        border: 2px solid white;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3);
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .cp-opacity-slider {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background-image: linear-gradient(45deg, #808080 25%, transparent 25%),
          linear-gradient(-45deg, #808080 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #808080 75%),
          linear-gradient(-45deg, transparent 75%, #808080 75%);
        background-size: 8px 8px;
        background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
        background-color: #b0b0b0;
        cursor: pointer;
        overflow: hidden;
      }

      .cp-opacity-track {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        border-radius: 5px;
      }

      .cp-opacity-thumb {
        position: absolute;
        top: 50%;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: white;
        border: 2px solid white;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3);
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .cp-preview-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .cp-preview-swatch {
        width: 28px;
        height: 28px;
        border-radius: 5px;
        border: 1px solid var(--border);
        flex-shrink: 0;
        background-image: linear-gradient(45deg, #808080 25%, transparent 25%),
          linear-gradient(-45deg, #808080 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #808080 75%),
          linear-gradient(-45deg, transparent 75%, #808080 75%);
        background-size: 6px 6px;
        background-position: 0 0, 0 3px, 3px -3px, -3px 0px;
        background-color: #b0b0b0;
        position: relative;
        overflow: hidden;
      }

      .cp-preview-swatch-inner {
        position: absolute;
        inset: 0;
      }

      .cp-hex-input {
        flex: 1;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-family: var(--text-mono);
        padding: 5px 8px;
        outline: none;
        transition: border-color 0.2s;
      }

      .cp-hex-input:focus {
        border-color: var(--accent-info);
      }

      .cp-opacity-input {
        width: 42px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-family: var(--text-mono);
        padding: 5px 4px;
        outline: none;
        text-align: center;
        transition: border-color 0.2s;
      }

      .cp-opacity-input:focus {
        border-color: var(--accent-info);
      }

      .cp-opacity-label {
        font-size: var(--text-xs);
        color: var(--text-muted);
        flex-shrink: 0;
      }

      .cp-divider {
        height: 1px;
        background: var(--border);
      }

      .cp-presets {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 4px;
      }

      .cp-swatch {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 3px;
        cursor: pointer;
        border: 1px solid var(--border);
        transition: transform 0.1s ease, border-color 0.1s ease;
      }

      .cp-swatch:hover {
        transform: scale(1.2);
        border-color: var(--text-primary);
      }

      .cp-recents-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .cp-recents-title {
        font-size: var(--text-xs);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-muted);
      }

      .cp-recents {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        min-height: 20px;
      }

      .cp-recents .cp-swatch {
        width: 20px;
        height: 20px;
      }
    `;

    document.head.appendChild(style);
  }

  // ==================== DESTROY ====================

  public destroy(): void {
    this.close();
  }
}
// ================================================================
// 🎨 TOOL PROPERTY SCHEMAS - Defines UI for each tool type
// ================================================================

// ==================== SCHEMA TYPES ====================

export type PropertyType =
  | 'color'
  | 'line-width'
  | 'line-style'
  | 'corner-radius'
  | 'font-size'
  | 'select'
  | 'checkbox'
  | 'text'
  | 'textarea'
  | 'extend'
  | 'bold-italic'
  | 'alignment'
  | 'levelArray';

export type PropertyTab = 'style' | 'text' | 'coords';

export interface PropertyField {
  key:          string;
  label:        string;
  type:         PropertyType;
  tab?:         PropertyTab;
  section?:     string;
  keyPrefix?:   string;
  defaultValue?: any;
  options?:     Array<{ value: any; label: string }>;
  description?: string;
}

export interface ToolSchema {
  toolType:    string;
  displayName: string;
  properties:  PropertyField[];
}

// ==================== COMMON PROPERTIES ====================

const lineStyleProps = (prefix: string): PropertyField[] => [
  {
    key:          `${prefix}.color`,
    label:        'Color',
    type:         'color',
    tab:          'style',
    section:      'Line',
    defaultValue: '#2962ff'
  },
  {
    key:          `${prefix}.width`,
    label:        'Width',
    type:         'line-width',
    tab:          'style',
    section:      'Line',
    defaultValue: 1
  },
  {
    key:          `${prefix}.style`,
    label:        'Style',
    type:         'line-style',
    tab:          'style',
    section:      'Line',
    defaultValue: 0
  }
];

const extendProps = (prefix: string): PropertyField[] => [
  {
    key:       `${prefix}.extend`,
    label:     'Extend',
    type:      'extend',
    tab:       'style',
    section:   'Extension',
    keyPrefix: prefix
  }
];

const commonTextProps = (prefix: string): PropertyField[] => [
  {
    key:          `${prefix}.value`,
    label:        'Content',
    type:         'textarea',
    tab:          'text',
    section:      'Text',
    defaultValue: ''
  },
  {
    key:          `${prefix}.font.size`,
    label:        'Font Size',
    type:         'font-size',
    tab:          'text',
    section:      'Font',
    defaultValue: 12
  },
  {
    key:          `${prefix}.font.color`,
    label:        'Color',
    type:         'color',
    tab:          'text',
    section:      'Font',
    defaultValue: '#ffffff'
  },
  {
    key:       `${prefix}.font.style`,
    label:     'Style',
    type:      'bold-italic',
    tab:       'text',
    section:   'Font',
    keyPrefix: prefix
  },
  {
    key:       `${prefix}.align`,
    label:     'Alignment',
    type:      'alignment',
    tab:       'text',
    section:   'Font',
    keyPrefix: prefix
  }
];

const visibilityProp: PropertyField = {
  key:          'visible',
  label:        'Visible',
  type:         'checkbox',
  tab:          'style',
  section:      'Visibility',
  defaultValue: true
};

const showPriceLabelProp: PropertyField = {
  key:          'showPriceAxisLabels',
  label:        'Show Price Labels',
  type:         'checkbox',
  tab:          'style',
  section:      'Visibility',
  defaultValue: true
};

// ==================== LINE TOOLS ====================

const trendLineSchema: ToolSchema = {
  toolType:    'TrendLine',
  displayName: 'Trend Line',
  properties: [
    ...lineStyleProps('line'),
    ...extendProps('line'),
    visibilityProp,
    showPriceLabelProp,
    ...commonTextProps('text')
  ]
};

const raySchema: ToolSchema = {
  toolType:    'Ray',
  displayName: 'Ray',
  properties: [
    ...lineStyleProps('line'),
    {
      key:          'line.extend.right',
      label:        'Extend Right',
      type:         'checkbox',
      tab:          'style',
      section:      'Extension',
      defaultValue: true
    },
    visibilityProp,
    showPriceLabelProp,
    ...commonTextProps('text')
  ]
};

const arrowSchema: ToolSchema = {
  toolType:    'Arrow',
  displayName: 'Arrow',
  properties: [
    ...lineStyleProps('line'),
    ...extendProps('line'),
    visibilityProp,
    showPriceLabelProp,
    ...commonTextProps('text')
  ]
};

const extendedLineSchema: ToolSchema = {
  toolType:    'ExtendedLine',
  displayName: 'Extended Line',
  properties: [
    ...lineStyleProps('line'),
    visibilityProp,
    showPriceLabelProp,
    ...commonTextProps('text')
  ]
};

const horizontalLineSchema: ToolSchema = {
  toolType:    'HorizontalLine',
  displayName: 'Horizontal Line',
  properties: [
    ...lineStyleProps('line'),
    visibilityProp,
    showPriceLabelProp,
    ...commonTextProps('text')
  ]
};

const horizontalRaySchema: ToolSchema = {
  toolType:    'HorizontalRay',
  displayName: 'Horizontal Ray',
  properties: [
    ...lineStyleProps('line'),
    visibilityProp,
    showPriceLabelProp,
    ...commonTextProps('text')
  ]
};

const verticalLineSchema: ToolSchema = {
  toolType:    'VerticalLine',
  displayName: 'Vertical Line',
  properties: [
    ...lineStyleProps('line'),
    visibilityProp,
    ...commonTextProps('text')
  ]
};

const crossLineSchema: ToolSchema = {
  toolType:    'CrossLine',
  displayName: 'Cross Line',
  properties: [
    ...lineStyleProps('line'),
    visibilityProp
  ]
};

const pathSchema: ToolSchema = {
  toolType:    'Path',
  displayName: 'Path',
  properties: [
    ...lineStyleProps('line'),
    visibilityProp
  ]
};

// ==================== SHAPE TOOLS ====================

const rectangleSchema: ToolSchema = {
  toolType:    'Rectangle',
  displayName: 'Rectangle',
  properties: [
    {
      key:          'rectangle.border.color',
      label:        'Color',
      type:         'color',
      tab:          'style',
      section:      'Border',
      defaultValue: '#9c27b0'
    },
    {
      key:          'rectangle.border.width',
      label:        'Width',
      type:         'line-width',
      tab:          'style',
      section:      'Border',
      defaultValue: 1
    },
    {
      key:          'rectangle.border.style',
      label:        'Style',
      type:         'line-style',
      tab:          'style',
      section:      'Border',
      defaultValue: 0
    },
    {
      key:          'rectangle.border.radius',
      label:        'Radius',
      type:         'corner-radius',
      tab:          'style',
      section:      'Border',
      defaultValue: 0
    },
    {
      key:          'rectangle.background.color',
      label:        'Fill',
      type:         'color',
      tab:          'style',
      section:      'Fill',
      defaultValue: 'rgba(156,39,176,0.2)'
    },
    ...extendProps('rectangle'),
    visibilityProp,
    ...commonTextProps('text')
  ]
};

const circleSchema: ToolSchema = {
  toolType:    'Circle',
  displayName: 'Circle',
  properties: [
    {
      key:          'circle.border.color',
      label:        'Color',
      type:         'color',
      tab:          'style',
      section:      'Border',
      defaultValue: '#9c27b0'
    },
    {
      key:          'circle.border.width',
      label:        'Width',
      type:         'line-width',
      tab:          'style',
      section:      'Border',
      defaultValue: 1
    },
    {
      key:          'circle.border.style',
      label:        'Style',
      type:         'line-style',
      tab:          'style',
      section:      'Border',
      defaultValue: 0
    },
    {
      key:          'circle.background.color',
      label:        'Fill',
      type:         'color',
      tab:          'style',
      section:      'Fill',
      defaultValue: 'rgba(156,39,176,0.2)'
    },
    visibilityProp,
    ...commonTextProps('text')
  ]
};

const triangleSchema: ToolSchema = {
  toolType:    'Triangle',
  displayName: 'Triangle',
  properties: [
    {
      key:          'triangle.border.color',
      label:        'Color',
      type:         'color',
      tab:          'style',
      section:      'Border',
      defaultValue: '#f57c00'
    },
    {
      key:          'triangle.border.width',
      label:        'Width',
      type:         'line-width',
      tab:          'style',
      section:      'Border',
      defaultValue: 1
    },
    {
      key:          'triangle.border.style',
      label:        'Style',
      type:         'line-style',
      tab:          'style',
      section:      'Border',
      defaultValue: 0
    },
    {
      key:          'triangle.background.color',
      label:        'Fill',
      type:         'color',
      tab:          'style',
      section:      'Fill',
      defaultValue: 'rgba(245,123,0,0.2)'
    },
    visibilityProp
  ]
};

// ==================== TEXT TOOLS ====================

const textSchema: ToolSchema = {
  toolType:    'Text',
  displayName: 'Text',
  properties: [
    visibilityProp,
    ...commonTextProps('text')
  ]
};

const calloutSchema: ToolSchema = {
  toolType:    'Callout',
  displayName: 'Callout',
  properties: [
    // ── Style tab ──
    ...lineStyleProps('line'),
    {
      key:          'text.box.border.color',
      label:        'Box Border',
      type:         'color',
      tab:          'style',
      section:      'Box',
      defaultValue: 'rgba(74,144,226,1)'
    },
    {
      key:          'text.box.border.width',
      label:        'Box Width',
      type:         'line-width',
      tab:          'style',
      section:      'Box',
      defaultValue: 1
    },
    {
      key:          'text.box.border.radius',
      label:        'Box Radius',
      type:         'corner-radius',
      tab:          'style',
      section:      'Box',
      defaultValue: 20
    },
    {
      key:          'text.box.background.color',
      label:        'Box Background',
      type:         'color',
      tab:          'style',
      section:      'Box',
      defaultValue: 'rgba(19,73,133,1)'
    },
    visibilityProp,
    // ── Text tab ──
    {
      key:          'text.value',
      label:        'Content',
      type:         'textarea',
      tab:          'text',
      section:      'Text',
      defaultValue: 'this is some text'
    },
    {
      key:          'text.font.size',
      label:        'Font Size',
      type:         'font-size',
      tab:          'text',
      section:      'Font',
      defaultValue: 14
    },
    {
      key:          'text.font.color',
      label:        'Color',
      type:         'color',
      tab:          'text',
      section:      'Font',
      defaultValue: 'rgba(255,255,255,1)'
    },
    {
      key:       'text.font.style',
      label:     'Style',
      type:      'bold-italic',
      tab:       'text',
      section:   'Font',
      keyPrefix: 'text'
    },
    {
      key:       'text.align',
      label:     'Alignment',
      type:      'alignment',
      tab:       'text',
      section:   'Font',
      keyPrefix: 'text'
    }
  ]
};

// ==================== ADVANCED TOOLS ====================

const parallelChannelSchema: ToolSchema = {
  toolType:    'ParallelChannel',
  displayName: 'Parallel Channel',
  properties: [
    // ── Channel Line ──
    {
      key:          'channelLine.color',
      label:        'Color',
      type:         'color',
      tab:          'style',
      section:      'Channel Line',
      defaultValue: '#2962ff'
    },
    {
      key:          'channelLine.width',
      label:        'Width',
      type:         'line-width',
      tab:          'style',
      section:      'Channel Line',
      defaultValue: 1
    },
    {
      key:          'channelLine.style',
      label:        'Style',
      type:         'line-style',
      tab:          'style',
      section:      'Channel Line',
      defaultValue: 0
    },
    // ── Middle Line ──
    {
      key:          'showMiddleLine',
      label:        'Show Middle Line',
      type:         'checkbox',
      tab:          'style',
      section:      'Middle Line',
      defaultValue: true
    },
    {
      key:          'middleLine.color',
      label:        'Color',
      type:         'color',
      tab:          'style',
      section:      'Middle Line',
      defaultValue: '#2962ff'
    },
    {
      key:          'middleLine.width',
      label:        'Width',
      type:         'line-width',
      tab:          'style',
      section:      'Middle Line',
      defaultValue: 1
    },
    {
      key:          'middleLine.style',
      label:        'Style',
      type:         'line-style',
      tab:          'style',
      section:      'Middle Line',
      defaultValue: 1
    },
    // ── Fill ──
    {
      key:          'background.color',
      label:        'Fill',
      type:         'color',
      tab:          'style',
      section:      'Fill',
      defaultValue: 'rgba(41,98,255,0.2)'
    },
    // ── Extension ──
    {
      key:       'extend',
      label:     'Extend',
      type:      'extend',
      tab:       'style',
      section:   'Extension',
      keyPrefix: 'extend'
    },
    visibilityProp
  ]
};

const fibRetracementSchema: ToolSchema = {
  toolType:    'FibRetracement',
  displayName: 'Fibonacci Retracement',
  properties: [
    {
      key:          'levels',
      label:        'Levels',
      type:         'levelArray',
      tab:          'style',
      section:      'Levels',
      defaultValue: []
    },
    {
      key:          'line.width',
      label:        'Width',
      type:         'line-width',
      tab:          'style',
      section:      'Line',
      defaultValue: 1
    },
    {
      key:          'line.style',
      label:        'Style',
      type:         'line-style',
      tab:          'style',
      section:      'Line',
      defaultValue: 0
    },
    {
      key:       'extend',
      label:     'Extend',
      type:      'extend',
      tab:       'style',
      section:   'Extension',
      keyPrefix: 'extend'
    },
    visibilityProp
  ]
};

const priceRangeSchema: ToolSchema = {
  toolType:    'PriceRange',
  displayName: 'Price Range',
  properties: [
    // ── Border ──
    {
      key:          'priceRange.rectangle.border.color',
      label:        'Border Color',
      type:         'color',
      tab:          'style',
      section:      'Border',
      defaultValue: '#9c27b0'
    },
    {
      key:          'priceRange.rectangle.border.width',
      label:        'Border Width',
      type:         'line-width',
      tab:          'style',
      section:      'Border',
      defaultValue: 1
    },
    {
      key:          'priceRange.rectangle.border.style',
      label:        'Border Style',
      type:         'line-style',
      tab:          'style',
      section:      'Border',
      defaultValue: 0
    },
    // ── Fill ──
    {
      key:          'priceRange.rectangle.background.color',
      label:        'Fill',
      type:         'color',
      tab:          'style',
      section:      'Fill',
      defaultValue: 'rgba(156,39,176,0.2)'
    },
    // ── Center Lines ──
    {
      key:          'priceRange.showCenterHorizontalLine',
      label:        'Show Center H Line',
      type:         'checkbox',
      tab:          'style',
      section:      'Center Lines',
      defaultValue: true
    },
    {
      key:          'priceRange.horizontalLine.color',
      label:        'H Line Color',
      type:         'color',
      tab:          'style',
      section:      'Center Lines',
      defaultValue: '#9c27b0'
    },
    {
      key:          'priceRange.horizontalLine.width',
      label:        'H Line Width',
      type:         'line-width',
      tab:          'style',
      section:      'Center Lines',
      defaultValue: 1
    },
    {
      key:          'priceRange.horizontalLine.style',
      label:        'H Line Style',
      type:         'line-style',
      tab:          'style',
      section:      'Center Lines',
      defaultValue: 1
    },
    {
      key:          'priceRange.showCenterVerticalLine',
      label:        'Show Center V Line',
      type:         'checkbox',
      tab:          'style',
      section:      'Center Lines',
      defaultValue: true
    },
    {
      key:          'priceRange.verticalLine.color',
      label:        'V Line Color',
      type:         'color',
      tab:          'style',
      section:      'Center Lines',
      defaultValue: '#9c27b0'
    },
    // ── Labels ──
    {
      key:          'priceRange.showTopPrice',
      label:        'Show Top Price',
      type:         'checkbox',
      tab:          'style',
      section:      'Labels',
      defaultValue: true
    },
    {
      key:          'priceRange.showBottomPrice',
      label:        'Show Bottom Price',
      type:         'checkbox',
      tab:          'style',
      section:      'Labels',
      defaultValue: true
    },
    visibilityProp,
    // ── Text tab ──
    {
      key:          'text.value',
      label:        'Label Text',
      type:         'text',
      tab:          'text',
      section:      'Label',
      defaultValue: ''
    },
    {
      key:          'text.font.size',
      label:        'Font Size',
      type:         'font-size',
      tab:          'text',
      section:      'Label',
      defaultValue: 12
    },
    {
      key:          'text.font.color',
      label:        'Color',
      type:         'color',
      tab:          'text',
      section:      'Label',
      defaultValue: 'rgba(255,255,255,1)'
    }
  ]
};

// ==================== FREEHAND TOOLS ====================

const brushSchema: ToolSchema = {
  toolType:    'Brush',
  displayName: 'Brush',
  properties: [
    {
      key:          'line.color',
      label:        'Stroke Color',
      type:         'color',
      tab:          'style',
      section:      'Stroke',
      defaultValue: 'rgba(0,188,212,1)'
    },
    {
      key:          'line.width',
      label:        'Stroke Width',
      type:         'line-width',
      tab:          'style',
      section:      'Stroke',
      defaultValue: 2
    },
    {
      key:          'line.style',
      label:        'Stroke Style',
      type:         'line-style',
      tab:          'style',
      section:      'Stroke',
      defaultValue: 0
    },
    {
      key:          'background.color',
      label:        'Fill',
      type:         'color',
      tab:          'style',
      section:      'Fill',
      defaultValue: 'rgba(0,0,0,0)'
    },
    visibilityProp
  ]
};

const highlighterSchema: ToolSchema = {
  toolType:    'Highlighter',
  displayName: 'Highlighter',
  properties: [
    {
      key:          'line.color',
      label:        'Highlight Color',
      type:         'color',
      tab:          'style',
      section:      'Style',
      defaultValue: 'rgba(255,255,0,0.4)'
    },
    {
      key:          'line.width',
      label:        'Highlight Width',
      type:         'line-width',
      tab:          'style',
      section:      'Style',
      defaultValue: 20
    },
    {
      key:          'line.style',
      label:        'Highlight Style',
      type:         'line-style',
      tab:          'style',
      section:      'Style',
      defaultValue: 0
    },
    {
      key:          'background.color',
      label:        'Fill',
      type:         'color',
      tab:          'style',
      section:      'Fill',
      defaultValue: 'rgba(0,0,0,0)'
    },
    visibilityProp
  ]
};

// ==================== POSITION TOOL ====================

const longShortPositionSchema: ToolSchema = {
  toolType:    'LongShortPosition',
  displayName: 'Long/Short Position',
  properties: [
    // ── Labels ──
    {
      key:          'showAutoText',
      label:        'Show R:R Label',
      type:         'checkbox',
      tab:          'style',
      section:      'Labels',
      defaultValue: true
    },
    // ── Risk Zone ──
    {
      key:          'entryStopLossRectangle.background.color',
      label:        'Risk Fill',
      type:         'color',
      tab:          'style',
      section:      'Risk Zone',
      defaultValue: 'rgba(255,0,0,0.2)'
    },
    {
      key:          'entryStopLossRectangle.border.color',
      label:        'Risk Border',
      type:         'color',
      tab:          'style',
      section:      'Risk Zone',
      defaultValue: 'red'
    },
    {
      key:          'entryStopLossRectangle.border.width',
      label:        'Risk Width',
      type:         'line-width',
      tab:          'style',
      section:      'Risk Zone',
      defaultValue: 1
    },
    {
      key:       'entryStopLossRectangle.extend',
      label:     'Risk Extend',
      type:      'extend',
      tab:       'style',
      section:   'Risk Zone',
      keyPrefix: 'entryStopLossRectangle'
    },
    // ── Reward Zone ──
    {
      key:          'entryPtRectangle.background.color',
      label:        'Reward Fill',
      type:         'color',
      tab:          'style',
      section:      'Reward Zone',
      defaultValue: 'rgba(0,128,0,0.2)'
    },
    {
      key:          'entryPtRectangle.border.color',
      label:        'Reward Border',
      type:         'color',
      tab:          'style',
      section:      'Reward Zone',
      defaultValue: 'green'
    },
    {
      key:          'entryPtRectangle.border.width',
      label:        'Reward Width',
      type:         'line-width',
      tab:          'style',
      section:      'Reward Zone',
      defaultValue: 1
    },
    {
      key:       'entryPtRectangle.extend',
      label:     'Reward Extend',
      type:      'extend',
      tab:       'style',
      section:   'Reward Zone',
      keyPrefix: 'entryPtRectangle'
    },
    visibilityProp,
    // ── Text tab ──
    {
      key:          'entryStopLossText.value',
      label:        'Risk Note',
      type:         'text',
      tab:          'text',
      section:      'Risk Text',
      defaultValue: ''
    },
    {
      key:          'entryStopLossText.font.size',
      label:        'Risk Size',
      type:         'font-size',
      tab:          'text',
      section:      'Risk Text',
      defaultValue: 12
    },
    {
      key:          'entryStopLossText.font.color',
      label:        'Risk Color',
      type:         'color',
      tab:          'text',
      section:      'Risk Text',
      defaultValue: 'white'
    },
    {
      key:       'entryStopLossText.font.style',
      label:     'Risk Style',
      type:      'bold-italic',
      tab:       'text',
      section:   'Risk Text',
      keyPrefix: 'entryStopLossText'
    },
    {
      key:          'entryPtText.value',
      label:        'Reward Note',
      type:         'text',
      tab:          'text',
      section:      'Reward Text',
      defaultValue: ''
    },
    {
      key:          'entryPtText.font.size',
      label:        'Reward Size',
      type:         'font-size',
      tab:          'text',
      section:      'Reward Text',
      defaultValue: 12
    },
    {
      key:          'entryPtText.font.color',
      label:        'Reward Color',
      type:         'color',
      tab:          'text',
      section:      'Reward Text',
      defaultValue: 'white'
    },
    {
      key:       'entryPtText.font.style',
      label:     'Reward Style',
      type:      'bold-italic',
      tab:       'text',
      section:   'Reward Text',
      keyPrefix: 'entryPtText'
    }
  ]
};

// ==================== SCHEMA REGISTRY ====================

export const toolSchemas: Record<string, ToolSchema> = {
  TrendLine:         trendLineSchema,
  Ray:               raySchema,
  Arrow:             arrowSchema,
  ExtendedLine:      extendedLineSchema,
  Rectangle:         rectangleSchema,
  Text:              textSchema,
  Callout:           calloutSchema,
  FibRetracement:    fibRetracementSchema,
  HorizontalLine:    horizontalLineSchema,
  HorizontalRay:     horizontalRaySchema,
  VerticalLine:      verticalLineSchema,
  CrossLine:         crossLineSchema,
  Circle:            circleSchema,
  Triangle:          triangleSchema,
  LongShortPosition: longShortPositionSchema,
  ParallelChannel:   parallelChannelSchema,
  PriceRange:        priceRangeSchema,
  Path:              pathSchema,
  Brush:             brushSchema,
  Highlighter:       highlighterSchema
};

// ==================== HELPER FUNCTIONS ====================

export function getSchemaForTool(toolType: string): ToolSchema | null {
  return toolSchemas[toolType] || null;
}

export function hasSchema(toolType: string): boolean {
  return toolType in toolSchemas;
}

export function getPropertyValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const keys = path.split('.');
  let value  = obj;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  return value;
}

export function setPropertyValue(obj: any, path: string, value: any): void {
  const keys    = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;
  let target = obj;
  for (const key of keys) {
    if (!(key in target) || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key];
  }
  target[lastKey] = value;
}

// ==================== TEMPLATE SYSTEM ====================

const TEMPLATE_STORAGE_KEY = 'drawing_tool_templates';

export interface ToolTemplate {
  toolType:  string;
  options:   any;
  timestamp: number;
}

export function saveToolTemplate(toolType: string, options: any): void {
  try {
    const templates     = loadAllTemplates();
    templates[toolType] = {
      toolType,
      options:   JSON.parse(JSON.stringify(options)),
      timestamp: Date.now()
    };
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    console.log(`✅ Template saved for ${toolType}`);
  } catch (error) {
    console.error('❌ Failed to save template:', error);
  }
}

export function loadToolTemplate(toolType: string): any | null {
  try {
    const templates = loadAllTemplates();
    const template  = templates[toolType];
    if (template) {
      console.log(`✅ Template loaded for ${toolType}`);
      return JSON.parse(JSON.stringify(template.options));
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to load template:', error);
    return null;
  }
}

export function loadAllTemplates(): Record<string, ToolTemplate> {
  try {
    const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function deleteToolTemplate(toolType: string): void {
  try {
    const templates = loadAllTemplates();
    delete templates[toolType];
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    console.log(`✅ Template deleted for ${toolType}`);
  } catch (error) {
    console.error('❌ Failed to delete template:', error);
  }
}

export function hasTemplate(toolType: string): boolean {
  return toolType in loadAllTemplates();
}

export function getToolDefaults(toolType: string): any {
  const schema = getSchemaForTool(toolType);
  if (!schema) return {};
  const defaults: any = {};
  schema.properties.forEach(prop => {
    if (prop.defaultValue !== undefined) {
      setPropertyValue(defaults, prop.key, prop.defaultValue);
    }
  });
  return defaults;
}
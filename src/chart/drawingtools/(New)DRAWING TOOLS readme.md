# 🎨 Chart Drawing Tools — Architecture & Developer Reference

## Overview

This document explains the architecture, design decisions, and bug history of the chart drawing tools system built on top of `lightweight-charts-line-tools-core` (a plugin for Lightweight Charts v5).

Any AI or developer working on this codebase should read this before touching any drawing-related file.

-----

## File Map

```
chart-drawing.ts          — Orchestrator. Entry point for all drawing operations.
drawing-persistence.ts    — Save, load, purge tools to/from localStorage.
drawing-tf-manager.ts     — Handles TF/symbol switching and tool visibility.
drawing-trade-arrows.ts   — Manages buy/sell trade arrow overlays.
ui/drawing-toolbar.ts     — Main toolbar UI.
ui/tool-quick-toolbar.ts  — Floating per-tool quick action toolbar.
indicator-manager.ts      — Handles both indicators and backend strategy overlays.
series-manager.ts         — Handles main price series creation and data gating.
```

-----

## Architecture

The system is split into sub-modules. Each sub-module receives **getter functions** instead of direct references:

```ts
this.persistence = new DrawingPersistence(
    () => this.lineTools,   // getter — always returns latest value
    () => this.isInitialized,
    () => this._currentSymbol,
    () => this._currentTimeframe
);
```

This is intentional. When `updateSeries()` is called (e.g. on candlestick → line chart type switch), `this.lineTools` is destroyed and recreated. If sub-modules held direct references they would point to the dead instance. Getters solve this.

-----

## Storage Architecture

### Why One Global Key

Originally the system used per-symbol-per-TF keys:

```
chart_drawings_EURUSD_H1
chart_drawings_EURUSD_M5
chart_drawings_EURUSD_ALL
```

This caused problems:

- Tools that should show on all TFs had to be duplicated across keys
- Symbol/TF switch logic had to manage multiple keys
- Easy to get out of sync

**Current approach — one global key:**

```
chart_drawings_all
```

All tools for all symbols and all timeframes live in one JSON array. Each tool carries `_meta` that describes where it belongs:

```ts
interface ToolMeta {
    symbol:    string;   // which symbol this tool belongs to
    timeframe: string;   // which TF this tool was drawn on
    allTF:     boolean;  // show on all TFs for this symbol?
    deleted:   boolean;  // soft-deleted flag
    strategy?: boolean;  // true = backend strategy tool, never persisted
}
```

A one-time migration (`MIGRATED_FLAG_KEY`) clears all old per-symbol-TF keys on first load.

-----

## Visibility System

### Single Source of Truth — `shouldToolBeVisible()`

```ts
public shouldToolBeVisible(toolId: string, timeframe: string): boolean {
    const meta = this._metaMap.get(toolId);
    if (!meta)        return true;
    if (meta.deleted) return false;
    if (meta.allTF)   return true;
    return meta.timeframe === timeframe;
}
```

**Rules:**

- `deleted: true` → always hidden
- `allTF: true` → always visible (for matching symbol)
- `allTF: false` → only visible on the TF it was drawn on

This function is called everywhere visibility needs to be resolved. Never compute visibility manually outside this function.

### `_metaMap`

In-memory map of `toolId → ToolMeta`. This is the live state. Storage is secondary — it’s written from `_metaMap`, and `_metaMap` is populated on load from storage.

-----

## Cross-TF Tool Positioning

### Why We Don’t Snap Timestamps

Early versions of this system included a `snapPoints()` function that rounded tool timestamps to the nearest candle boundary when switching TF:

```ts
Math.round(timestamp / interval) * interval
```

**This was wrong and caused timestamp drift.** Every TF switch would corrupt the original timestamp slightly. After multiple switches the tool would visually drift from its original position.

**Why snapping is unnecessary:**

The engine handles cross-TF positioning internally. In `base-line-tool.ts`, `pointToScreenPoint()` calls `interpolateLogicalIndexFromTime()` on every render frame:

```ts
// geometry.ts
const interval     = (Number(time1) - Number(time0));
const logicalIndex = timeDiff / interval;
```

This recalculates the logical index fresh using the **current series interval** on every render. A H1 timestamp automatically maps to the correct M5 candle position without any manual snapping.

**`snapPoints()` has been removed entirely. Do not bring it back.**

-----

## TF Switch Flow

```
onTimeframeChange()
  → saveDrawings()            — persist current state before switch
  → onTFUpdated()             — update _currentTimeframe
  → removeTradeArrows()       — trade arrows are TF-specific, remove them
  → purgeDeletedTools()       — hard remove soft-deleted ghosts from engine
  → double requestAnimationFrame
  → applyTFVisibility()       — show/hide tools for new TF
```

### Why the Double requestAnimationFrame

When switching TF, the new series data loads and the price/time scales reinitialize. If `applyTFVisibility()` runs immediately, per-TF tools that become `visible: true` render for 1-2 frames using the old/uninitialized scale — causing them to flash at wrong size/position before snapping to correct.

The double `requestAnimationFrame` (~33ms) gives the scale time to fully initialize before tools become visible. This delay is invisible to the user because the TF switch itself (data load + candle render) takes longer.

**allTF tools do not flicker** because they are always visible — they simply reposition smoothly as the scale updates.

### Why `purgeDeletedTools()` Is Called on TF Switch

Soft-deleted tools remain as invisible ghosts in the engine during the session. On TF switch, the engine moves to a new context — no render cycle is actively touching those ghosts. This is the safest window to call `removeLineToolsById()` and fully evict them from the engine. After this call, the ghost IDs are also removed from `_metaMap` so they no longer exist anywhere.

This includes soft-deleted **strategy drawing tools** — they follow the exact same purge path.

-----

## SeriesManager Data Gate — `_isDataReady`

The frontend stack is fast (flatbuffer, uWebSocket, backend cache). On TF switch, the backend sends both the full historical dataset (`setData`) and live tick updates (`updateData`) simultaneously. On fast connections `updateData` can win the race and render one candle before `setData` clears and reloads the series, causing drawing tools to see a valid scale too early and trigger `onDataReady` before full data is loaded.

**Fix — `_isDataReady` flag in `SeriesManager`:**

```ts
setData()    → _isDataReady = true  → fires onDataReady()
updateData() → if (!_isDataReady) return   ← drop update, full data not ready yet
createSeries() → _isDataReady = false      ← reset on series creation
clearData()    → _isDataReady = false      ← reset on clear
```

`updateData()` silently drops incoming ticks until `setData()` has completed with full data. Since `setData()` contains the complete fresh dataset, dropped ticks are never needed — the next tick after `setData()` will be the correct continuation.

`onDataReady` in `chart-drawing.ts` is only triggered from `setData()`, never from `updateData()`. This guarantees drawing tools always restore against a fully committed series.

-----

## Save/Load Lifecycle

### saveDrawings()

1. Export all tools from engine via `exportLineTools()`
1. Read existing global storage
1. Build a map of existing tools by ID
1. For each engine tool: update map with current state + correct visibility from `shouldToolBeVisible()`
1. Filter out strategy drawing tools (`_meta.strategy === true`) — never persisted
1. Write merged map back to storage

**Important:** visibility stored is the correct resolved value, not forced `visible: true`. This prevents tools loading with wrong visibility on the next session.

### loadDrawings()

1. Run one-time migration if needed
1. Read all tools from global storage
1. Filter by current symbol + TF (allTF tools pass through for any TF)
1. Lazy-register required tool groups
1. Inject meta into `_metaMap`
1. Build clean tools with visibility resolved via `shouldToolBeVisible()`
1. Import into engine via `importLineTools()`
1. Call `applyTFVisibility()` immediately after to enforce correct visibility

### purgeAndSave()

Same as `saveDrawings()` but also calls `removeLineToolsById()` on the engine to physically remove soft-deleted tools. Only called on `beforeunload`.

### onDataReady()

Called by `SeriesManager.setData()` after full data is committed. Directly calls `loadDrawings()` then `applyTFVisibility()`. No polling, no fixed delay — the gate is `_isDataReady` in `SeriesManager`.

```ts
public async onDataReady(): Promise<void> {
    if (!this.lineTools || !this.isInitialized) return;
    if (this._isSwitchingChartType) return;

    await this.persistence.loadDrawings(...);
    this.tfManager.applyTFVisibility(this._currentTimeframe);
}
```

`waitForScaleReady()` was removed. It polled `getVisibleLogicalRange()` but returned true immediately on a single candle from a racing `updateData()` tick, making it unreliable on fast stacks. The `_isDataReady` gate is the correct fix.

-----

## Soft Delete

Tools are never detached from the engine via `detachPrimitive()`.

**Why:** There is a known bug in `lightweight-charts-line-tools-core` (reported October 2025) where calling `detachPrimitive()` causes performance degradation. The root cause is the primitive returning non-empty pane views after detach, triggering continuous unnecessary redraws.

**Fix approach — soft delete:**

1. Set `visible: false` on the tool via `applyLineToolOptions()`
1. Mark `deleted: true` in `_metaMap`
1. Remove from storage immediately via `removeToolFromStorage()`
1. On TF/symbol switch — `purgeDeletedTools()` calls `removeLineToolsById()` to hard evict from engine
1. On `purgeAndSave()` (page unload) — same hard eviction as fallback

This means deleted tools remain as invisible ghosts in the engine until the next TF/symbol switch or page unload. This is intentional.

### `purgeDeletedTools()`

Called inside `onTimeframeChange()` and `onSymbolChange()` in `DrawingTFManager`. Loops `_metaMap` for all `deleted: true` entries, calls `removeLineToolsById()` on the engine, then removes those IDs from `_metaMap` entirely. After this call, the deleted tools no longer exist anywhere.

```ts
public purgeDeletedTools(): void {
    const deletedIds: string[] = [];
    this._metaMap.forEach((meta, id) => {
        if (meta.deleted) deletedIds.push(id);
    });
    if (deletedIds.length === 0) return;
    lt.removeLineToolsById(deletedIds);
    deletedIds.forEach(id => this._metaMap.delete(id));
}
```

-----

## Engine-Level Performance Fixes (base-line-tool.ts)

Two critical fixes exist inside the core engine’s `BaseLineTool` class. These are not in your application code — they are in `lightweight-charts-line-tools-core/src/model/base-line-tool.ts`. If you ever upgrade the core package, verify these fixes are still present.

### Fix 1 — Skip `updateAllViews()` When Hidden

```ts
public updateAllViews(): void {
    if (this._options?.visible === false) return;
    ...
}
```

Without this guard, hidden tools still run their full view update cycle on every render frame. With 15+ strategy tools and deleted user tools accumulating as ghosts, this becomes significant per-frame overhead.

### Fix 2 — Skip Hit-Test When Hidden

```ts
public hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (this._options?.visible === false) return null;
    ...
}
```

Without this guard, invisible ghost tools still run their full geometric hit-test calculations on every `mousemove` event — including complex polygon intersection math for shapes like Rectangle, Circle, and FibRetracement.

### Why Both Fixes Are Needed Together

The soft-delete strategy only works efficiently because of these two guards. Without them, accumulating ghost tools would cause exactly the kind of performance degradation we were trying to avoid by not detaching.

**Do not remove these fixes. Do not upgrade the core package without verifying they are still present.**

-----

## Chart Type Switch (Candlestick ↔ Line)

When chart type changes, the series is replaced. This requires destroying and recreating the `lineTools` plugin:

```ts
public updateSeries(newSeries: ISeriesApi<SeriesType>): void {
    const savedDrawings = this.persistence.exportDrawings();
    this.lineTools.destroy();
    this.lineTools = createLineToolsPlugin(this.chart, this.series);
    this.persistence.importDrawings(...);
    this.tfManager.applyTFVisibility(this._currentTimeframe);
}
```

The `_isSwitchingChartType` flag prevents `onDataReady()` from triggering a redundant `loadDrawings()` during this process.

Call `beginChartTypeSwitch()` before and `endChartTypeSwitch()` after the series swap from outside.

-----

## Tool Groups — Lazy Registration

Tools are split into 7 groups. A group is only imported and registered the first time a tool from that group is needed:

```
lines     — TrendLine, Ray, Arrow, ExtendedLine, HorizontalLine, etc.
shapes    — Rectangle, Circle, Triangle
text      — Text
advanced  — ParallelChannel, FibRetracement, PriceRange, Path
freehand  — Brush, Highlighter
position  — LongShortPosition
signals   — TradeArrow
```

`registeredGroups` is a module-level `Set` that prevents double-registration. It is cleared when `updateSeries()` recreates the plugin.

-----

## allTF Toggle — How It Works

Each tool has an `allTF` flag in its meta. Default is `true` (show on all TFs).

User can toggle via the quick toolbar button. When toggled:

1. `ToolQuickToolbar` calls `callbacks.onAllTFToggle(toolId, newVal)`
1. `ChartDrawingModule` delegates to `tfManager.setToolAllTF(toolId, allTF)`
1. `DrawingTFManager.setToolAllTF()` calls `persistence.setAllTF(toolId, allTF)`
1. `persistence.setAllTF()` updates `_metaMap` and calls `saveDrawings()`
1. Back in `setToolAllTF()`, calls `applyTFVisibility(currentTimeframe)` to apply immediately

### Bug History — First Click Not Working

`setAllTF()` originally had:

```ts
const meta = this._metaMap.get(toolId);
if (!meta) return; // ← silent fail
```

If meta didn’t exist in `_metaMap` (possible race condition on newly created tools), the toggle did nothing. Fixed by creating default meta if missing:

```ts
let meta = this._metaMap.get(toolId);
if (!meta) {
    meta = {
        timeframe: this.currentTimeframe(),
        symbol:    this.currentSymbol(),
        allTF:     true,
        deleted:   false
    };
}
```

-----

## Trade Arrows

Trade arrows (`TradeArrow` tool type) are handled by `DrawingTradeArrows` separately because:

- They are placed by the trading system, not the user
- They are never persisted to storage (`NON_PERSISTENT_TOOLS` set)
- They are always removed on TF/symbol switch
- Buy/sell arrows can be toggled independently via settings

-----

## Non-Persistent Tools

```ts
const NON_PERSISTENT_TOOLS = new Set<string>(['TradeArrow']);
```

Tools in this set are never written to storage. Add to this set for any tool type that should be session-only.

-----

## Known Limitations

### Timestamp-Based Coordinates

`lightweight-charts-line-tools-core` uses `{ timestamp, price }` as point coordinates — not bar index. This means:

- Tools rely on `interpolateLogicalIndexFromTime()` to map timestamps to screen positions
- The interpolation assumes uniform bar spacing (uses first two bars to calculate interval)
- For symbols with irregular bar spacing (e.g. stock market gaps over weekends), tools may render slightly off on those gaps

This is a library limitation. TradingView’s own charting library uses price + bar index coordinates which avoids this entirely.

### Ghost Tools in Engine

Soft-deleted tools remain as invisible ghosts in the engine until the next TF/symbol switch or page unload. In theory, if a user creates and deletes hundreds of tools in one session without switching TF or reloading, this could accumulate. In practice this is not a problem.

-----

## Adding a New Tool Type

1. Add to `TOOL_GROUP_MAP` in `chart-drawing.ts`
1. Add to the appropriate group file in `tools/`
1. Add quick controls to `QUICK_CONTROLS` in `tool-quick-toolbar.ts`
1. If it should never be persisted, add to `NON_PERSISTENT_TOOLS`

-----

## Backend Strategy Drawing Tools

Backend strategy drawing tools (e.g. SMC zones, ICT FVGs, labels, boxes) are a completely separate layer from user drawings. They are placed by the backend strategy system via the `lineTools` engine and tagged with `_meta.strategy: true`.

### Key Rules

- Never stored in `localStorage` — `saveDrawings()` filters them out via `_meta.strategy === true`
- Read-only — not movable, not editable by the user
- Not toggleable per-TF — they are TF-specific by nature, deployed and removed as a unit
- Identified in `_metaMap` by `_meta.strategy: true`

### Tool ID Convention

Every strategy drawing tool ID must follow this naming convention:

```
STRATEGYKEY_SYMBOL_TIMEFRAME_tooltype_index
```

Examples:

```
SMC_EURUSD_H1_zone_0
SMC_EURUSD_H1_zone_1
SMC_EURUSD_H1_label_0
ICT_EURUSD_H1_fvg_0
ICT_EURUSD_H1_fvg_1
```

This convention is mandatory. The regex-based removal system depends on it.

### Legend Integration

Each strategy appears in the legend exactly like an indicator — using the same `indicator-added` and `indicator-value-update` event system in `IndicatorManager`. The strategy icon is `fa-robot` to distinguish it from user indicators.

Removing a strategy from the legend dispatches `legend-item-remove`. `chart-core.ts` intercepts this, identifies it as a strategy by the `fa-robot` icon, parses the ID using the convention above, and dispatches `remove-strategy`.

### Soft Remove — User Removes Strategy from Legend

When a user removes a strategy from the legend, the drawing tools must be soft-hidden immediately:

1. Build regex from strategy key, symbol, timeframe:

```ts
const regex = new RegExp(`^${strategyKey}_${symbol}_${timeframe}_`);
```

1. `getLineToolsByIdRegex(regex)` — retrieve all matching drawing tools
1. `applyLineToolOptions({ visible: false })` on each — soft hide immediately, no detach
1. `deleteMeta(id)` on each ID — mark `deleted: true` in `_metaMap`
1. Remove from legend immediately

**Why soft hide instead of hard remove:**
Same reason as user tool deletion — calling `detachPrimitive()` mid-session causes the known performance degradation bug in the core engine. Soft hide is safe, instantaneous, and costs nothing per frame due to the engine-level guards in `base-line-tool.ts`.

### Hard Remove — On TF/Symbol Switch

On TF or symbol switch, `purgeDeletedTools()` runs as part of the switch flow. It loops all `deleted: true` entries in `_metaMap` — which now includes all soft-deleted strategy drawing tools — and calls `removeLineToolsById()` on the engine. This is safe because the engine has moved to a new context and no render cycle is touching those tools.

After this call, the strategy tool IDs are removed from `_metaMap` entirely. They no longer exist anywhere.

This means strategy drawing tools follow the **exact same soft-delete → purge-on-switch lifecycle** as user drawing tools. No special case needed.

### Deploy / Undeploy Flow

```
Strategy deployed
  → backend sends drawing tool payload
  → tools created via createOrUpdateLineTool() with IDs following convention
  → _meta.strategy: true injected into _metaMap for each tool
  → legend entry added via indicator-added event

User removes strategy from legend
  → getLineToolsByIdRegex(regex) — find all tools for this strategy
  → applyLineToolOptions({ visible: false }) on each — soft hide
  → deleteMeta(id) on each — mark deleted
  → legend cleared immediately

Next TF/symbol switch
  → purgeDeletedTools() — hard removes all ghost strategy tools from engine
  → _metaMap entries cleaned up
```

### saveDrawings() Filter

`saveDrawings()` must never write strategy drawing tools to localStorage. Filter applied before writing:

```ts
.filter(t => !this._metaMap.get(t.id)?.strategy)
```

Strategy tools are session-only. They are redeployed by the backend on each session.

-----

## Indicator Manager — Backend Strategy Overlay Lines

`IndicatorManager` handles both user indicators (EMA, SMA, RSI etc.) and backend strategy overlay lines (the `LineSeries` lines that strategies draw on the chart — signals, levels, etc.). These are completely separate from strategy drawing tools above.

### Strategy Indicator Lines vs Strategy Drawing Tools

|             |Strategy Indicator Lines           |Strategy Drawing Tools                                            |
|-------------|-----------------------------------|------------------------------------------------------------------|
|Managed by   |`IndicatorManager`                 |`lineTools` engine via `DrawingPersistence`                       |
|Type         |`LineSeries`                       |Drawing tool primitives (zones, labels, boxes)                    |
|Identified by|`isStrategy: true` in pool         |`_meta.strategy: true` in `_metaMap`                              |
|Removed via  |`clearSeriesData()` → `setData([])`|`applyLineToolOptions({ visible: false })` → `purgeDeletedTools()`|
|Persisted    |Never                              |Never                                                             |
|Editable     |No                                 |No                                                                |
|Movable      |No                                 |No                                                                |

### Strategy Indicator Line Lifecycle

Strategy indicator lines use `setData([])` to clear on TF/symbol switch — this is correct because `LineSeries` does not have the `detachPrimitive()` bug. The series are pooled and reused across switches.

On TF switch, strategies are marked inactive via `indicator-tf-inactive` and their series data is cleared. On symbol switch, same behavior. They are reactivated when the backend sends new data for the new context.

### Pending SetData Buffer

Indicator data can arrive before the chart timescale is committed. `IndicatorManager` buffers all `setData` calls in `pendingSetData` and flushes them after `chart-initial-data-loaded` fires, through its own double `requestAnimationFrame`. This ensures indicator series coordinates commit cleanly against the stable timescale.

```
chart-initial-data-loaded fires
  → resubscribe persisted indicators
  → flushPendingSetData()
      → double rAF
      → series.setData(chartData) for each pending entry
      → indicator.active = true
  → chartReady = true (after own double rAF)
```

The `chartReady` flag gates single-point `updateData` calls — same concept as `_isDataReady` in `SeriesManager`. A single-point update on an inactive indicator is dropped to prevent stale ticks writing against an uncommitted timescale.
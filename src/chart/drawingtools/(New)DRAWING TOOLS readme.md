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
const interval    = (Number(time1) - Number(time0));
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
  → await 2x requestAnimationFrame
  → applyTFVisibility()       — show/hide tools for new TF
```

### Why the Double requestAnimationFrame

When switching TF, the new series data loads and the price/time scales reinitialize. If `applyTFVisibility()` runs immediately, per-TF tools that become `visible: true` render for 1-2 frames using the old/uninitialized scale — causing them to flash at wrong size/position before snapping to correct.

The double `requestAnimationFrame` (~33ms) gives the scale time to fully initialize before tools become visible. This delay is invisible to the user because the TF switch itself (data load + candle render) takes longer.

**allTF tools do not flicker** because they are always visible — they simply reposition smoothly as the scale updates.

-----

## Save/Load Lifecycle

### saveDrawings()

1. Export all tools from engine via `exportLineTools()`
1. Read existing global storage
1. Build a map of existing tools by ID
1. For each engine tool: update map with current state + correct visibility from `shouldToolBeVisible()`
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

-----

## Soft Delete

Tools are never detached from the engine via `detachPrimitive()`.

**Why:** There is a known bug in `lightweight-charts-line-tools-core` (reported October 2025) where calling `detachPrimitive()` causes performance degradation. The root cause is the primitive returning non-empty pane views after detach, triggering continuous unnecessary redraws.

**Fix approach — soft delete:**

1. Set `visible: false` on the tool via `applyLineToolOptions()`
1. Mark `deleted: true` in `_metaMap`
1. Remove from storage immediately via `removeToolFromStorage()`
1. On `purgeAndSave()` (page unload) — call `removeLineToolsById()` to clean engine

This means deleted tools remain as invisible ghosts in the engine during the session. They are cleaned up on page unload. This is intentional.

-----

## Chart Type Switch (Candlestick ↔ Line)

When chart type changes, the series is replaced. This requires destroying and recreating the `lineTools` plugin:

```ts
public updateSeries(newSeries: ISeriesApi<SeriesType>): void {
    const savedDrawings = this.persistence.exportDrawings();
    // destroy old plugin
    this.lineTools.destroy();
    // create new plugin on new series
    this.lineTools = createLineToolsPlugin(this.chart, this.series);
    // re-import drawings with correct visibility
    this.persistence.importDrawings(...);
    // enforce visibility
    this.tfManager.applyTFVisibility(this._currentTimeframe);
}
```

The `_isSwitchingChartType` flag prevents `onDataReady()` from triggering a redundant `loadDrawings()` during this process:

```ts
public async onDataReady(): Promise<void> {
    if (this._isSwitchingChartType) return; // ← skip during series swap
    ...
}
```

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

Soft-deleted tools remain as invisible ghosts in the engine until page unload. In theory, if a user creates and deletes hundreds of tools in one session without reloading, this could accumulate. In practice this is not a problem.

-----

## Adding a New Tool Type

1. Add to `TOOL_GROUP_MAP` in `chart-drawing.ts`
1. Add to the appropriate group file in `tools/`
1. Add quick controls to `QUICK_CONTROLS` in `tool-quick-toolbar.ts`
1. If it should never be persisted, add to `NON_PERSISTENT_TOOLS`

-----

## Strategy Tools (Planned)

Backend-driven strategy tools are a separate layer from user drawings:

- Never stored in `localStorage`
- Read-only, not editable by user
- Sent as one JSON payload on strategy deploy
- Removed on strategy undeploy or symbol change
- Use `_meta.strategy: true` flag to distinguish from user tools
- `saveDrawings()` must filter them out

A `DrawingStrategyTools` module is planned to handle this separately from `DrawingPersistence`.

// /src/model/base-line-tool.ts

/**
 * This file defines the abstract BaseLineTool class.
 * It serves as the foundation for all individual line drawing tools, encapsulating common
 * properties, state management, and essential methods for coordinate conversion and interaction.
 *
 * It implements the `ISeriesPrimitive` interface, making any of its subclasses a valid
 * plugin for a Lightweight Charts series. Its primary role is to abstract away the
 * complexities of the v5 plugin system, providing a consistent and simpler API for
 * individual tool implementations.
 */
import {
	IChartApiBase,
	ISeriesApi,
	ISeriesPrimitive,
	SeriesAttachedParameter,
	SeriesType,
	Coordinate,
	PrimitiveHoveredItem,
	IHorzScaleBehavior,
	Logical,
	IPaneApi,
	UTCTimestamp,
	Time,
	ISeriesPrimitiveAxisView
} from 'lightweight-charts';

import { LineToolExport, LineToolPoint } from '../api/public-api';
import { merge, randomHash, DeepPartial, deepCopy } from '../utils/helpers';
import { 
	LineToolOptionsInternal,
	LineToolType,
	HitTestResult,
	HitTestType,
	IPaneView,
	IUpdatablePaneView,
	TimePointIndex,
	FirstValue,
	IPriceFormatter,
	AutoscaleInfoImpl,
	AutoscaleInfo,
	IPriceAxisView,
	ITimeAxisView,
	PaneCursorType,
	InteractionPhase,
	ConstraintResult,
	SnapAxis,
	FinalizationMethod,
	LineToolCullingInfo,
} from '../types';
import { Point, interpolateTimeFromLogicalIndex, interpolateLogicalIndexFromTime   } from '../utils/geometry';
import { LineToolsCorePlugin } from '../core-plugin';
import { PriceDataSource } from './price-data-source';
// Imports for the LineTool specific axis views
import { LineToolPriceAxisLabelView } from '../views/line-tool-price-axis-label-view';
import { LineToolTimeAxisLabelView } from '../views/line-tool-time-axis-label-view';
import { PriceAxisLabelStackingManager } from './price-axis-label-stacking-manager';


/**
 * The abstract base class for all line drawing tools in the plugin.
 *
 * This class extends {@link PriceDataSource} and implements the Lightweight Charts `ISeriesPrimitive`
 * interface. It provides a common set of properties, utility methods for coordinate conversion,
 * state management (selection, hover, editing), and hooks for custom behavior (hit-testing, constraints).
 * All custom line tool implementations must extend this class.
 *
 * @typeParam HorzScaleItem - The type of the horizontal scale item (e.g., `Time` or `number`).
 */
export abstract class BaseLineTool<HorzScaleItem> extends PriceDataSource<HorzScaleItem> implements ISeriesPrimitive<HorzScaleItem> {
	// Abstract properties that must be defined by child classes
	// These properties are now set in the constructor from subclass arguments

	/**
	 * The unique string identifier for this specific tool's type (e.g., 'TrendLine', 'Rectangle').
	 * This is defined by the concrete implementation class.
	 * @readonly
	 */
	public readonly toolType: LineToolType;

	/**
	 * The fixed number of logical points this tool requires.
	 *
	 * - A positive number (e.g., `2` for a TrendLine) means the tool is *bounded*.
	 * - A value of `-1` (e.g., for Brush, Path) means the tool is *unbounded* and can have a variable number of points.
	 * @readonly
	 */
	public readonly pointsCount: number;

	// Storage for axis view instances
	protected _priceAxisLabelViews: IPriceAxisView[] = [];
	protected _timeAxisLabelViews: ITimeAxisView[] = [];

	/**
	 * Reference to the manager responsible for resolving price axis label collisions.
	 * Used to ensure this tool's price labels do not overlap others.
	 * @protected
	 */
	protected _priceAxisLabelStackingManager: PriceAxisLabelStackingManager<HorzScaleItem>;

	/**
	 * Abstract method for the tool's core hit-testing logic.
	 *
	 * Concrete subclasses must implement this to define the precise geometric area of the tool
	 * (lines, backgrounds, anchors) and return a {@link HitTestResult} if the coordinates are inside.
	 *
	 * @param x - The X coordinate of the mouse pointer (in pixels).
	 * @param y - The Y coordinate of the mouse pointer (in pixels).
	 * @returns A {@link HitTestResult} containing hit type and index data, or `null`.
	 * @internal
	 */
	public abstract _internalHitTest(x: Coordinate, y: Coordinate): HitTestResult<any> | null;

	/**
	 * Provides an array of price axis view components to Lightweight Charts for rendering the tool's labels.
	 *
	 * This implementation wraps the internal `_priceAxisLabelViews` array.
	 *
	 * @returns A readonly array of {@link IPriceAxisView} components.
	 */
	public priceAxisViews(): readonly IPriceAxisView[] {
		// Defensive check: Do not return views if the tool is already marked for destruction
		if (this._isDestroying) return []; 

		const views: IPriceAxisView[] = [...this._priceAxisLabelViews];
		return views;
	}

	/**
	 * Provides an array of time axis view components to Lightweight Charts for rendering the tool's labels.
	 *
	 * This implementation wraps the internal `_timeAxisLabelViews` array.
	 *
	 * @returns A readonly array of {@link ITimeAxisView} components.
	 */
	public timeAxisViews(): readonly ITimeAxisView[] {
		// Defensive check: Do not return views if the tool is already marked for destruction
		if (this._isDestroying) return []; 

		const views: ITimeAxisView[] = [...this._timeAxisLabelViews];
		return views;
	}

	private _overrideCursor: PaneCursorType | null = null;

	/**
	 * Temporarily overrides the cursor style displayed over the chart pane, bypassing normal hover detection.
	 *
	 * This is typically used by the {@link InteractionManager} during an active drag or edit gesture
	 * to ensure the cursor stays consistent (e.g., `grabbing`) regardless of where the mouse moves.
	 *
	 * @param cursor - The {@link PaneCursorType} to enforce, or `null` to revert to default behavior.
	 */
	public setOverrideCursor(cursor: PaneCursorType | null): void {
		this._overrideCursor = cursor;
	}

	/**
	 * The public hit-test method required by the Lightweight Charts `ISeriesPrimitive` interface.
	 *
	 * This method acts as an adapter, calling `_internalHitTest` and converting its internal
	 * result (`HitTestResult`) into the required LWC `PrimitiveHoveredItem` format, including
	 * cursor determination and Z-order.
	 *
	 * @param x - The X coordinate from Lightweight Charts (in pixels).
	 * @param y - The Y coordinate from Lightweight Charts (in pixels).
	 * @returns A `PrimitiveHoveredItem` if the tool is hit, otherwise `null`.
	 */
	public hitTest(x: number, y: number): PrimitiveHoveredItem | null {
		// ✅ Fix 2 — Skip hit-test when hidden
		if (this._options?.visible === false) return null;

		// Check for override first
		if (this._overrideCursor) {
			return {
				externalId: this.id(),
				zOrder: 'normal',
				cursorStyle: this._overrideCursor,
			};
		}

		if (!this.options().editable) {
			const ourX = x as Coordinate;
			const ourY = y as Coordinate;
			const internalResult = this._internalHitTest(ourX, ourY);

			if (internalResult !== null) {
				return {
					externalId: this.id(),
					zOrder: 'normal',
					cursorStyle: this.options().notEditableCursor || PaneCursorType.NotAllowed,
				};
			}
			return null;
		}

		const ourX = x as Coordinate;
		const ourY = y as Coordinate;

		const internalResult = this._internalHitTest(ourX, ourY);

		if (internalResult === null) {
			return null;
		}

		const hitData = internalResult.data();
		let cursorStyle: PaneCursorType = PaneCursorType.Default; 
		if (hitData?.suggestedCursor) {
			cursorStyle = hitData.suggestedCursor;
		} else {
			const options = this.options();
			switch (internalResult.type()) {
				case HitTestType.MovePointBackground:
					cursorStyle = options.defaultDragCursor || PaneCursorType.Grabbing;
					break;
				case HitTestType.MovePoint:
				case HitTestType.Regular:
					cursorStyle = options.defaultHoverCursor || PaneCursorType.Pointer;
					break;
				case HitTestType.ChangePoint:
					cursorStyle = PaneCursorType.DiagonalNwSeResize;
					break;
				default:
					cursorStyle = PaneCursorType.Default;
					break;
			}
		}

		return {
			externalId: this.id(),
			zOrder: 'normal',
			cursorStyle: cursorStyle,
		};
	}

	// Core instances and plugin API
	protected _chart!: IChartApiBase<HorzScaleItem>;
	protected _series!: ISeriesApi<SeriesType, HorzScaleItem>;
	protected _horzScaleBehavior!: IHorzScaleBehavior<HorzScaleItem>;
	protected _coreApi: LineToolsCorePlugin<HorzScaleItem>;
	protected _requestUpdate?: () => void;

	// Tool-specific state
	protected _id: string;
	protected _options: LineToolOptionsInternal<LineToolType> = {} as LineToolOptionsInternal<LineToolType>;
	protected _points: LineToolPoint[];

	protected _paneViews: IUpdatablePaneView[] = [];

	// Interaction state
	private _selected: boolean = false;
	private _hovered: boolean = false;
	private _editing: boolean = false;
	private _creating: boolean = false;
	protected _lastPoint: LineToolPoint | null = null;
	private _editedPointIndex: number | null = null;
	private _currentPoint: Point = new Point(0, 0);
	private _isDestroying: boolean = false;

	private _attachedPane: IPaneApi<HorzScaleItem> | null = null; 

	/**
	 * Initializes the Base Line Tool instance.
	 */
	public constructor(
		coreApi: LineToolsCorePlugin<HorzScaleItem>,
		chart: IChartApiBase<HorzScaleItem>,
		series: ISeriesApi<SeriesType, HorzScaleItem>,
		horzScaleBehavior: IHorzScaleBehavior<HorzScaleItem>,
		finalOptions: LineToolOptionsInternal<LineToolType>, 
		points: LineToolPoint[] = [],
		toolType: LineToolType,
		pointsCount: number,
		priceAxisLabelStackingManager: PriceAxisLabelStackingManager<HorzScaleItem>
	) {
		super(chart); 
		
		this._id = randomHash();
		this._coreApi = coreApi;
		this._chart = chart;
		this._series = series;
		this._horzScaleBehavior = horzScaleBehavior;
		this._points = points;
		this._creating = points.length === 0;
		this.toolType = toolType;
		this.pointsCount = pointsCount;
		this._priceAxisLabelStackingManager = priceAxisLabelStackingManager;

		this._setupOptions(finalOptions);

		if (this.pointsCount !== -1) {
			for (let i = 0; i < this.pointsCount; i++) {
				this._priceAxisLabelViews[i] = new LineToolPriceAxisLabelView(this, i, this._chart, this._priceAxisLabelStackingManager);
				this._timeAxisLabelViews[i] = new LineToolTimeAxisLabelView(this, i, this._chart);
			}
		}
	}

	/**
	 * Lifecycle hook called by Lightweight Charts when the primitive is first attached to a series.
	 */
	public attached(param: SeriesAttachedParameter<HorzScaleItem>): void {
		this._chart = param.chart;
		this._series = param.series;
		this.setPriceScale(param.series.priceScale());
		this._requestUpdate = param.requestUpdate;
		this._horzScaleBehavior = param.horzScaleBehavior;

		this._attachedPane = this._chart.panes().find(p => {
			return p.getSeries().some(s => s === this._series);
		}) || null;

		if (!this._attachedPane) {
			console.warn(`[BaseLineTool] Tool ${this.id()} attached to a series not found in any pane. This primitive relies on IPaneApi access.`);
		}

		console.log(`Tool ${this.toolType} with ID ${this.id()} attached to series.`);
	}

	/**
	 * OPTIONAL: Defines the maximum index of an interactive anchor point that this tool supports.
	 */
	public maxAnchorIndex?(): number;	

	/**
	 * OPTIONAL: Indicates if this tool supports creation via a sequence of discrete mouse clicks.
	 */
	public supportsClickClickCreation?(): boolean;

	/**
	 * OPTIONAL: Indicates if this tool supports creation via a single click-hold-drag-release gesture.
	 */
	public supportsClickDragCreation?(): boolean;

	/**
	 * OPTIONAL: Indicates if holding the Shift key should apply a geometric constraint
	 * during a discrete click-click creation sequence.
	 */
	public supportsShiftClickClickConstraint?(): boolean;

	/**
	 * OPTIONAL: Indicates if holding the Shift key should apply a geometric constraint
	 * during a click-drag-release creation gesture.
	 */
	public supportsShiftClickDragConstraint?(): boolean;	

	/**
	 * Lifecycle hook called by Lightweight Charts when the primitive is detached from a series.
	 *
	 * Nullifies references to external Lightweight Charts API objects to prevent memory leaks.
	 */
	public detached(): void {
		console.log(`[BaseLineTool] Tool ${this.id()} detached from series.`);

		(this._chart as any) = null;
		(this._series as any) = null;
		(this._horzScaleBehavior as any) = null;
		(this._attachedPane as any) = null;
		(this._requestUpdate as any) = null;
	}

	/**
	 * Returns the {@link IPaneApi} instance to which this tool is currently attached.
	 */
	public getPane(): IPaneApi<HorzScaleItem> {
		if (!this._attachedPane) {
			throw new Error(`Tool ${this.id()} is not attached to a pane. 'attached()' might not have been called or ran into an issue.`);
		}
		return this._attachedPane;
	}

	// #region Public API for managing tool state & properties

	public id(): string { return this._id; }

	public setId(id: string): void { this._id = id; }
	
	public isSelected(): boolean { return this._selected; }

	public isHovered(): boolean { return this._hovered; }

	public isEditing(): boolean { return this._editing; }

	public isCreating(): boolean { return this._creating; }

	public setSelected(selected: boolean): void {
		this._selected = selected;
		this.updateAllViews();
		this._requestUpdate?.();
	}
	
	public setHovered(hovered: boolean): void {
		this._hovered = hovered;
		this.updateAllViews();
		this._requestUpdate?.();
	}

	public setEditing(editing: boolean): void {
		this._editing = editing;
		this.updateAllViews();
		this._requestUpdate?.();
	}
	
	public setCreating(creating: boolean): void {
		this._creating = creating;
	}

	public editedPointIndex(): number | null {
		return this._editing ? this._editedPointIndex : null;
	}

	public setEditedPointIndex(index: number | null): void {
		this._editedPointIndex = index;
	}

	public currentPoint(): Point {
		return this._currentPoint;
	}

	public setCurrentPoint(point: Point): void {
		this._currentPoint = point;
	}

	public points(): LineToolPoint[] {
		const points = [...this._points, ...(this._lastPoint ? [this._lastPoint] : [])];
		return this.pointsCount === -1 ? points : points.slice(0, this.pointsCount);
	}

	public getLastPoint(): LineToolPoint | null {
		return this._lastPoint;
	}

	public setLastPoint(point: LineToolPoint | null): void {
		this._lastPoint = point;
		this._triggerChartUpdate();
	}

	public setPoints(points: LineToolPoint[]): void { this._points = points; }

	public addPoint(point: LineToolPoint): void { this._points.push(point); }

	public getPoint(index: number): LineToolPoint | null { return this._points[index] || null; }

	public setPoint(index: number, point: LineToolPoint): void { 
		if(this._points[index]){
			this._points[index] = point;
		}
	}

	public getPermanentPointsCount(): number {
		return this._points.length;
	}
	
	public options(): LineToolOptionsInternal<any> {
		return this._options;
	}

	public applyOptions(options: DeepPartial<LineToolOptionsInternal<any>>): void {
		merge(this._options, options);
		this.updateAllViews();
		this._requestUpdate?.();
	}
	
	public isFinished(): boolean {
		return this._points.length >= this.pointsCount;
	}

	public tryFinish(): void {
		if (this.isFinished()) {
			this._creating = false;
			this._editing = false;
			this.setSelected(true);
			this.updateAllViews();
			this._requestUpdate?.();
		}
	}

	public getExportData(): LineToolExport<LineToolType> {
		return {
			id: this.id(),
			toolType: this.toolType,
			points: this.points(),
			options: this.options(),
		};
	}

	public getShiftConstrainedPoint?(
		pointIndex: number,
		rawScreenPoint: Point,
		phase: InteractionPhase,
		originalLogicalPoint: LineToolPoint,
		allOriginalLogicalPoints: LineToolPoint[]
	): ConstraintResult;	

	// #endregion

	// #region ISeriesPrimitive implementation

	public paneViews(): readonly IPaneView[] {
		return this._paneViews;
	}

	public updateAllViews(): void {
		// ✅ Fix 1 — Skip updateAllViews() when hidden
		if (this._options?.visible === false) return;

		this._paneViews.forEach(view => view.update());

		if (this.pointsCount === -1) {
			// placeholder for dynamic point tools
		}

		this._priceAxisLabelViews.forEach(view => view.update());
		this._timeAxisLabelViews.forEach(view => view.update());

		this._priceAxisLabelStackingManager.updateStacking();
	}

	public priceAxisLabelColor(): string | null {
		return '#2962FF';
	}

	public timeAxisLabelColor(): string | null {
		return '#2962FF';
	}

	public getSeries(): ISeriesApi<SeriesType, HorzScaleItem> {
		if (!this._series) {
			throw new Error(`Series not attached to tool ${this.id()}. Cannot get series API.`);
		}
		return this._series;
	}

	public getChart(): IChartApiBase<HorzScaleItem> {
		if (!this._chart) {
			throw new Error('Chart API not available. Tool might not be attached.');
		}
		return this._chart; 
	}
    
	public get horzScaleBehavior(): IHorzScaleBehavior<HorzScaleItem> {
		if (!this._horzScaleBehavior) {
			throw new Error(`Horizontal Scale Behavior not attached to tool ${this.id()}.`);
		}
		return this._horzScaleBehavior;
	}	
	
	// #endregion

	// #region Utilities for subclasses

	/**
	 * Transforms a logical data point (timestamp/price) into pixel screen coordinates.
	 *
	 * Returns null safely if the chart reference has been cleared (e.g., after detach).
	 */
	public pointToScreenPoint(point: LineToolPoint): Point | null {
		// ==================== FIX: null check after detach ====================
		if (!this._chart || !this._series) return null;
		// ======================================================================

		const timeScale = this._chart.timeScale();

		const logicalIndex = interpolateLogicalIndexFromTime(this._chart, this._series, point.timestamp as UTCTimestamp);

		if (logicalIndex === null) {
			console.warn(`[BaseLineTool] pointToScreenPoint: Could not determine logical index for timestamp: ${point.timestamp}.`);
			return null;
		}
 
		const x = timeScale.logicalToCoordinate(logicalIndex);
		const y = this._series.priceToCoordinate(point.price);

		if (x === null || y === null) {
			console.warn(`[BaseLineTool] pointToScreenPoint: Coordinate conversion failed for point: ${JSON.stringify(point)}. Received x=${x}, y=${y}`);
			return null;
		}

		return new Point(x, y);
	}

	/**
	 * Transforms a pixel screen coordinate into a logical data point (timestamp/price).
	 *
	 * Returns null safely if the chart reference has been cleared (e.g., after detach).
	 */
	public screenPointToPoint(point: Point): LineToolPoint | null {
		// ==================== FIX: null check after detach ====================
		if (!this._chart || !this._series || !this._horzScaleBehavior) return null;
		// ======================================================================

		const timeScale = this._chart.timeScale();
		const price = this._series.coordinateToPrice(point.y as Coordinate);

		const logical = timeScale.coordinateToLogical(point.x as Coordinate);
		
		if (logical === null) {
			return null;
		}

		const interpolatedTime = interpolateTimeFromLogicalIndex(this._chart, this._series, logical);

		if (interpolatedTime === null || price === null) {
			console.warn(`[BaseLineTool] screenPointToPoint: Could not determine interpolated time or price for screen point: ${JSON.stringify(point)}.`);
			return null;
		}

		return {
			timestamp: this._horzScaleBehavior.key(interpolatedTime as HorzScaleItem) as number,
			price: price as number,
		};
	}

	protected _setPaneViews(views: IUpdatablePaneView[]): void {
		this._paneViews = views;
	}

	protected _setupOptions(
		finalOptions: LineToolOptionsInternal<LineToolType>
	): void {
		this._options = finalOptions;
	}

	// #endregion

	/**
	 * Cleans up and releases all resources held by the line tool instance.
	 */
	public destroy(): void {
		console.log(`[BaseLineTool] Destroying tool with ID: ${this.id()}`);

		this._isDestroying = true;

		this._triggerChartUpdate(); 

		this._priceAxisLabelViews.forEach(view => {
			if (view instanceof LineToolPriceAxisLabelView) {
				this._priceAxisLabelStackingManager.unregisterLabel(this.id() + '-p' + view.getPointIndex());
			}
		});
		this._priceAxisLabelStackingManager.updateStacking();

		this._paneViews.forEach(paneView => {
			const renderer = paneView.renderer();
			if (renderer && renderer.clear) {
				renderer.clear();
			}
		});
		(this._paneViews as any) = [];
		(this._points as any) = [];
		this._lastPoint = null;

		this.setPriceScale(null);

		this._selected = false;
		this._hovered = false;
		this._editing = false;
		this._creating = false;
		this._editedPointIndex = null;
		(this._currentPoint as any) = new Point(0, 0);
	}

	/**
	 * Triggers a chart update (redraw) via the internal `requestUpdate` callback.
	 */
	public _triggerChartUpdate(): void {
		if (this._requestUpdate) {
			this._requestUpdate();
		} else {
			console.warn(`[BaseLineTool] Attempted to trigger chart update for tool ${this.id()} but _requestUpdate is not set.`);
		}
	}

	public base(): number {
		return 0;
	}

	public autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null {
		return null;
	}

	public firstValue(): FirstValue | null {
		return null;
	}

	public formatter(): IPriceFormatter {
		return {
			format: (price: number) => price.toString(),
			formatTickmarks: (prices: readonly number[]) => prices.map(p => p.toString())
		};
	}

	public priceLineColor(lastBarColor: string): string {
		return '';
	}

	public anchor0TriggersTranslation(): boolean {
		return false;
	}
	
	public handleDoubleClickFinalization(): BaseLineTool<HorzScaleItem> {
		return this;
	}

	public getFinalizationMethod(): FinalizationMethod {
		return FinalizationMethod.PointCount;
	}	

	public getPermanentPointsForTranslation(): LineToolPoint[] {
		return [...this._points]; 
	}

	public clearGhostPoint(): void {
		this._lastPoint = null;
	}

	/**
	 * Retrieves the pixel width of the chart pane's central drawing area.
	 *
	 * Returns 0 safely if the chart reference has been cleared (e.g., after detach).
	 */
	public getChartDrawingWidth(): number {
		// ==================== FIX: null check after detach ====================
		if (!this._chart) return 0;
		// ======================================================================
		const paneDimensions = this._chart.paneSize(); 
		return paneDimensions.width;
	}

	/**
	 * Retrieves the pixel height of the chart pane's central drawing area.
	 *
	 * Returns 0 safely if the chart reference has been cleared (e.g., after detach).
	 */
	public getChartDrawingHeight(): number {
		// ==================== FIX: null check after detach ====================
		if (!this._chart) return 0;
		// ======================================================================
		const paneDimensions = this._chart.paneSize(); 
		return paneDimensions.height;
	}
}

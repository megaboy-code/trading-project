// /src/views/LineToolRectanglePaneView.ts

/**
 * The PaneView for the Rectangle line tool.
 * It prepares the data for the generic RectangleRenderer, TextRenderer, and LineAnchorRenderer
 * based on the LineToolRectangle's state and options. It then combines these using
 * the CompositeRenderer from the core plugin to render the final tool on the chart.
 */

import { Coordinate, IChartApiBase, ISeriesApi, SeriesType, Logical } from 'lightweight-charts';

import {
	BaseLineTool,
	IPaneRenderer,
	RectangleRenderer,
	RectangleRendererData,
	TextRenderer,
	CompositeRenderer,
	LineToolOptionsInternal,
	Point,
	AnchorPoint,
	deepCopy,
	BoxHorizontalAlignment,
	BoxVerticalAlignment,
	LineToolPaneView,
	PaneCursorType,
	TextRendererData,
	getToolCullingState,
    OffScreenState,
	LineToolPoint,
	LineToolCullingInfo
} from 'lightweight-charts-line-tools-core';

import { LineToolRectangle } from '../model/LineToolRectangle';

export class LineToolRectanglePaneView<HorzScaleItem> extends LineToolPaneView<HorzScaleItem> {

	public constructor(
		source: LineToolRectangle<HorzScaleItem>,
		chart: IChartApiBase<any>,
		series: ISeriesApi<SeriesType, any>,
	) {
		super(source, chart, series);
	}

	protected override _updateImpl(height: number, width: number): void {
		this._invalidated = false;
		this._renderer.clear();

		const options = this._tool.options() as LineToolOptionsInternal<'Rectangle'>;
		if (!options.visible) {
			return;
		}

		const hasUpdatedPoints = this._updatePoints();

		if (!hasUpdatedPoints) {
			return;
		}

		const P0_cull = this._tool.getPoint(0)!;
		const P1_cull = this._tool.getPoint(1)!;
		
		if (this._points.length >= this._tool.pointsCount && !this._tool.isCreating() && !this._tool.isEditing()) {
			
			const minTime = Math.min(P0_cull.timestamp, P1_cull.timestamp);
			const maxTime = Math.max(P0_cull.timestamp, P1_cull.timestamp);
			const minPrice = Math.min(P0_cull.price, P1_cull.price);
			const maxPrice = Math.max(P0_cull.price, P1_cull.price);

			const P_TL: LineToolPoint = { timestamp: minTime, price: maxPrice };
			const P_TR: LineToolPoint = { timestamp: maxTime, price: maxPrice };
			const P_BL: LineToolPoint = { timestamp: minTime, price: minPrice };
			const P_BR: LineToolPoint = { timestamp: maxTime, price: minPrice };

			const cullingPoints: LineToolPoint[] = [P_TL, P_TR, P_BL, P_BR];
			
			const cullingInfo: LineToolCullingInfo = {
				subSegments: [
					[0, 1],
					[2, 3]
				]
			};

			const extendOptions = options.rectangle.extend;

			const cullingState = getToolCullingState(cullingPoints, this._tool, extendOptions, undefined, cullingInfo);
 
			let shouldCull = false;

			switch (cullingState) {
				case OffScreenState.OffScreenTop:
				case OffScreenState.OffScreenBottom:
					shouldCull = true;
					break;

				case OffScreenState.OffScreenLeft:
					if (extendOptions.right !== true) {
						shouldCull = true;
					}
					break;

				case OffScreenState.OffScreenRight:
					if (extendOptions.left !== true) {
						shouldCull = true;
					}
					break;

				case OffScreenState.FullyOffScreen:
					shouldCull = true;
					break;
 
				case OffScreenState.Visible:
				default:
					shouldCull = false;
					break;
			}

			if (shouldCull) {
				(this._renderer as CompositeRenderer<any>).clear();
				return;
			}
		}

		if (this._points.length !== this._tool.pointsCount) {
			return;
		}

		const rectanglePoints: [AnchorPoint, AnchorPoint] = [this._points[0], this._points[1]];

		const rectangleRendererData: RectangleRendererData = {
			...deepCopy(options.rectangle),
			points: rectanglePoints,
			hitTestBackground: false,
			toolDefaultHoverCursor: options.defaultHoverCursor,
			toolDefaultDragCursor: options.defaultDragCursor,
		};

		this._rectangleRenderer.setData(rectangleRendererData);
		(this._renderer as CompositeRenderer<any>).append(this._rectangleRenderer);

		if (options.text.value) {
			const textRendererData: TextRendererData = {
				text: deepCopy(options.text),
				points: rectanglePoints,
				toolDefaultHoverCursor: options.defaultHoverCursor,
				toolDefaultDragCursor: options.defaultDragCursor,
				hitTestBackground: true,
			};

			this._labelRenderer.setData(textRendererData);
			(this._renderer as CompositeRenderer<any>).append(this._labelRenderer);
		}

		if (this.areAnchorsVisible()) {
			this._addAnchors(this._renderer as CompositeRenderer<any>);
		}
	}

	protected override _addAnchors(renderer: CompositeRenderer<any>): void {
		const options = this._tool.options() as LineToolOptionsInternal<'Rectangle'>;
		
		if (options.locked) {
			return;
		}
		
		if (this._points.length < 2) return;

		const [point0, point1] = this._points;
		const minX = Math.min(point0.x, point1.x);
		const maxX = Math.max(point0.x, point1.x);
		const minY = Math.min(point0.y, point1.y);
		const maxY = Math.max(point0.y, point1.y);

		const xDiff = point0.x - point1.x;
		const yDiff = point0.y - point1.y;
		const sign = Math.sign(xDiff * yDiff);

		const diag1Cursor = sign < 0 ? PaneCursorType.DiagonalNeSwResize : PaneCursorType.DiagonalNwSeResize;
		const diag2Cursor = sign < 0 ? PaneCursorType.DiagonalNwSeResize : PaneCursorType.DiagonalNeSwResize;

		const topLeft     = new AnchorPoint(minX, minY, 0, false, diag1Cursor);
		const topCenter   = new AnchorPoint((minX + maxX) / 2 as Coordinate, minY, 6, true, PaneCursorType.VerticalResize);
		const topRight    = new AnchorPoint(maxX, minY, 3, false, diag2Cursor);
		const middleRight = new AnchorPoint(maxX, (minY + maxY) / 2 as Coordinate, 5, true, PaneCursorType.HorizontalResize);
		const bottomRight = new AnchorPoint(maxX, maxY, 1, false, diag1Cursor);
		const bottomCenter = new AnchorPoint((minX + maxX) / 2 as Coordinate, maxY, 7, true, PaneCursorType.VerticalResize);
		const bottomLeft  = new AnchorPoint(minX, maxY, 2, false, diag2Cursor);
		const middleLeft  = new AnchorPoint(minX, (minY + maxY) / 2 as Coordinate, 4, true, PaneCursorType.HorizontalResize);

		const anchorData = {
			points: [
				topLeft, topCenter, topRight, middleRight,
				bottomRight, bottomCenter, bottomLeft, middleLeft
			],
		};

		const toolOptions = this._tool.options();

		renderer.append(this.createLineAnchor({
			...anchorData,
			defaultAnchorHoverCursor: toolOptions.defaultAnchorHoverCursor,
			defaultAnchorDragCursor: toolOptions.defaultAnchorDragCursor,
		}, 0));
	}
}

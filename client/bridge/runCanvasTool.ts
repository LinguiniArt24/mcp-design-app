import {
	Box,
	BoxModel,
	createShapeId,
	Editor,
	getIndexAbove,
	RecordsDiff,
	structuredClone,
	TLGeoShape,
	TLRecord,
	TLShape,
} from 'tldraw'
import { BridgeToolOutput } from '../../shared/bridge'
import { convertTldrawShapeToFocusedShape } from '../../shared/format/convertTldrawShapeToFocusedShape'
import { FocusedShape } from '../../shared/format/FocusedShape'
import { Bounds, getCanvasTool } from '../../shared/tools'
import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'
import { TldrawAgent } from '../agent/TldrawAgent'
import { AgentHelpers } from '../AgentHelpers'

/**
 * Run one MCP tool call against the editor and return what goes back to the agent.
 * Throws with a message meant for the agent if the call can't be carried out.
 */
export async function runCanvasTool(
	agent: TldrawAgent,
	name: string,
	args: Record<string, unknown>
): Promise<BridgeToolOutput> {
	const tool = getCanvasTool(name)
	if (!tool) {
		throw new Error(`Unknown tool "${name}". The canvas page may be older than the MCP server.`)
	}

	if (tool.kind === 'action') {
		return json(await runAction(agent, tool.actionType, args))
	}

	const { editor } = agent
	switch (tool.name) {
		case 'get_canvas': {
			const { bounds } = args as { bounds?: Bounds }
			const shapes = bounds ? getShapesInArea(editor, bounds) : editor.getCurrentPageShapesSorted()
			return json({
				page: editor.getCurrentPage().name,
				viewport: toBounds(editor.getViewportPageBounds()),
				shapes: shapes.map((shape) => toFocusedShapeWithGeometry(editor, shape)),
			})
		}
		case 'get_selection': {
			return json({
				shapes: editor.getSelectedShapes().map((shape) => toFocusedShape(editor, shape)),
			})
		}
		case 'get_viewport': {
			return json({ viewport: toBounds(editor.getViewportPageBounds()) })
		}
		case 'screenshot': {
			const { bounds, scale } = args as { bounds?: Bounds; scale?: number }
			return await takeScreenshot(editor, bounds ?? editor.getViewportPageBounds(), scale ?? 1)
		}
		case 'set_view': {
			editor.zoomToBounds(Box.From(args as Bounds))
			return json({ viewport: toBounds(editor.getViewportPageBounds()) })
		}
		case 'get_region': {
			const { shapeIds } = args as { shapeIds: string[] }
			const sourceShapes = shapeIds
				.map((shapeId) => editor.getShape(createShapeId(shapeId)))
				.filter((shape): shape is TLShape => Boolean(shape))
			if (sourceShapes.length === 0) throw new Error('No supplied scribble shapes exist on this page.')

			const sourcePoints = sourceShapes.flatMap((shape) => shapeCorners(editor, shape))
			const region = editor
				.getCurrentPageShapesSorted()
				.filter(isClosedRegion)
				.filter((shape) => !sourceShapes.some((source) => source.id === shape.id))
				.map((shape) => ({ shape, polygon: getShapePolygon(editor, shape) }))
				.filter(({ polygon }) => sourcePoints.every((point) => pointInPolygon(point, polygon)))
				.sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon))[0]

			if (!region) {
				throw new Error(
					'No closed shape contains every supplied scribble. Draw a closed outline first, or use its shape ID directly with fill_pattern.'
				)
			}

			return json({
				regionShapeId: region.shape.id.replace(/^shape:/, ''),
				bounds: toBounds(editor.getShapePageBounds(region.shape)!),
				outline: simplifyPolygon(region.polygon),
			})
		}
		case 'contains': {
			const { regionShapeId, shapeIds } = args as { regionShapeId: string; shapeIds: string[] }
			const region = editor.getShape(createShapeId(regionShapeId))
			if (!region || !isClosedRegion(region)) {
				throw new Error('regionShapeId must name a closed draw or geometric shape.')
			}
			const polygon = getShapePolygon(editor, region)
			const contained: string[] = []
			const crossing: string[] = []
			const missing: string[] = []

			for (const shapeId of shapeIds) {
				const shape = editor.getShape(createShapeId(shapeId))
				if (!shape) {
					missing.push(shapeId)
				} else if (shapeCorners(editor, shape).every((point) => pointInPolygon(point, polygon))) {
					contained.push(shapeId)
				} else {
					crossing.push(shapeId)
				}
			}
			return json({ regionShapeId, contained, crossing, missing })
		}
		case 'fill_pattern':
			return json(fillPattern(editor, args))
		default:
			throw new Error(`The canvas page has no handler for "${tool.name}".`)
	}
}

async function runAction(
	agent: TldrawAgent,
	actionType: AgentAction['_type'],
	args: Record<string, unknown>
) {
	const { editor } = agent
	const util = agent.actions.getAgentActionUtil(actionType)
	if (!util) throw new Error(`The canvas page can't run "${actionType}" actions.`)

	const helpers = new AgentHelpers(agent)
	const action = {
		...structuredClone(args),
		_type: actionType,
		complete: true,
		time: 0,
	} as Streaming<AgentAction>

	const sanitized = util.sanitizeAction(action, helpers)
	if (!sanitized) {
		throw new Error(
			"Nothing was changed. A shape ID may not exist, or the shape doesn't support this operation. Call get_canvas to check the current shapes."
		)
	}

	// One undo step per tool call
	editor.markHistoryStoppingPoint(`mcp:${actionType}`)

	// Errors must not escape editor.run, or tldraw crashes the editor.
	let result: ReturnType<typeof agent.actions.act> | null = null
	let failure: unknown = null
	editor.run(
		() => {
			try {
				result = agent.actions.act(sanitized, helpers)
			} catch (error) {
				failure = error
			}
		},
		{ ignoreShapeLock: true }
	)
	if (failure) throw failure

	const { diff, promise } = result!
	await promise
	return summarizeDiff(editor, diff)
}

function summarizeDiff(editor: Editor, diff: RecordsDiff<TLRecord>) {
	const created: FocusedShape[] = []
	const updated: FocusedShape[] = []
	const deleted: string[] = []

	for (const record of Object.values(diff.added)) {
		if (!isShapeRecord(record)) continue
		const shape = editor.getShape(record.id)
		if (shape) created.push(toFocusedShape(editor, shape))
	}
	for (const [, to] of Object.values(diff.updated)) {
		if (!isShapeRecord(to)) continue
		const shape = editor.getShape(to.id)
		if (shape) updated.push(toFocusedShape(editor, shape))
	}
	for (const record of Object.values(diff.removed)) {
		if (!isShapeRecord(record)) continue
		deleted.push(record.id.replace(/^shape:/, ''))
	}

	if (created.length + updated.length + deleted.length === 0) {
		return { created, updated, deleted, message: 'No shapes changed.' }
	}
	return { created, updated, deleted }
}

async function takeScreenshot(
	editor: Editor,
	area: BoxModel,
	scale: number
): Promise<BridgeToolOutput> {
	const bounds = Box.From(area)
	const shapes = getShapesInArea(editor, bounds)
	if (shapes.length === 0) {
		return json({ message: 'Nothing to capture: no shapes overlap this area.', bounds: area })
	}

	const { blob } = await editor.toImage(shapes, {
		format: 'png',
		background: true,
		bounds,
		padding: 0,
		scale,
	})
	return { type: 'image', data: await blobToBase64(blob), mimeType: 'image/png' }
}

function getShapesInArea(editor: Editor, area: BoxModel): TLShape[] {
	const box = Box.From(area)
	return editor.getCurrentPageShapesSorted().filter((shape) => {
		const shapeBounds = editor.getShapePageBounds(shape)
		return shapeBounds ? Box.Collides(box, shapeBounds) : false
	})
}

function toFocusedShape(editor: Editor, shape: TLShape): FocusedShape {
	return convertTldrawShapeToFocusedShape(editor, structuredClone(shape))
}

function toFocusedShapeWithGeometry(editor: Editor, shape: TLShape) {
	const focusedShape = toFocusedShape(editor, shape)
	const bounds = editor.getShapePageBounds(shape)
	if (!bounds) return focusedShape

	return {
		...focusedShape,
		bounds: toBounds(bounds),
		...(shape.type === 'draw' ? { outline: simplifyPolygon(getShapePolygon(editor, shape)) } : {}),
	}
}

function isShapeRecord(record: TLRecord): record is TLShape {
	return record.typeName === 'shape'
}

function toBounds(box: BoxModel): Bounds {
	return {
		x: Math.round(box.x),
		y: Math.round(box.y),
		w: Math.round(box.w),
		h: Math.round(box.h),
	}
}

type Point = { x: number; y: number }

function isClosedRegion(shape: TLShape) {
	return shape.type === 'geo' || (shape.type === 'draw' && shape.props.isClosed)
}

function getShapePolygon(editor: Editor, shape: TLShape): Point[] {
	const geometry = editor.getShapeGeometry(shape)
	const vertices = 'vertices' in geometry ? geometry.vertices : []
	const points = vertices.map((point) => ({ x: shape.x + point.x, y: shape.y + point.y }))
	if (points.length >= 3) return points
	return shapeCorners(editor, shape)
}

function shapeCorners(editor: Editor, shape: TLShape): Point[] {
	const bounds = editor.getShapePageBounds(shape)
	if (!bounds) return []
	return [
		{ x: bounds.x, y: bounds.y },
		{ x: bounds.x + bounds.w, y: bounds.y },
		{ x: bounds.x + bounds.w, y: bounds.y + bounds.h },
		{ x: bounds.x, y: bounds.y + bounds.h },
	]
}

function pointInPolygon(point: Point, polygon: Point[]) {
	let inside = false
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i]
		const b = polygon[j]
		const intersects =
			a.y > point.y !== b.y > point.y &&
			point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
		if (intersects) inside = !inside
	}
	return inside
}

function polygonArea(polygon: Point[]) {
	return Math.abs(
		polygon.reduce(
			(area, point, index) =>
				area + point.x * polygon[(index + 1) % polygon.length].y - polygon[(index + 1) % polygon.length].x * point.y,
			0
		) / 2
	)
}

function simplifyPolygon(points: Point[], maxPoints = 24) {
	if (points.length <= maxPoints) return points.map(roundPoint)
	const step = Math.ceil(points.length / maxPoints)
	return points.filter((_, index) => index % step === 0).map(roundPoint)
}

function roundPoint(point: Point) {
	return { x: Math.round(point.x), y: Math.round(point.y) }
}

function fillPattern(editor: Editor, args: Record<string, unknown>) {
	const {
		regionShapeId,
		sourceShapeIds = [],
		pattern,
		colors = ['blue', 'light-blue'],
		spacing = 48,
	} = args as {
		regionShapeId: string
		sourceShapeIds?: string[]
		pattern: 'triangles' | 'diamonds' | 'dots' | 'stripes'
		colors?: TLGeoShape['props']['color'][]
		spacing?: number
	}
	const region = editor.getShape(createShapeId(regionShapeId))
	if (!region || !isClosedRegion(region)) {
		throw new Error('regionShapeId must name a closed draw or geometric shape.')
	}

	const polygon = getShapePolygon(editor, region)
	const bounds = editor.getShapePageBounds(region)!
	const created: string[] = []
	const shapes: TLGeoShape[] = []
	const inset = Math.max(3, spacing * 0.08)
	let index = 0
	let shapeIndex = getIndexAbove(region.index)

	for (let y = bounds.y + inset; y < bounds.y + bounds.h - inset; y += spacing) {
		for (let x = bounds.x + inset; x < bounds.x + bounds.w - inset; x += spacing) {
			const size = pattern === 'dots' ? spacing * 0.45 : spacing * 0.9
			const candidate = patternShape(
				pattern,
				x,
				y,
				size,
				colors[index % colors.length],
				`pattern-${regionShapeId}-${index}`,
				region.parentId,
				shapeIndex
			)
			const candidatePoints = geoCorners(candidate)
			if (!candidatePoints.every((point) => pointInPolygon(point, polygon))) continue
			shapes.push(candidate)
			created.push(candidate.id.replace(/^shape:/, ''))
			index++
			shapeIndex = getIndexAbove(shapeIndex)
		}
	}

	editor.markHistoryStoppingPoint('mcp:fill_pattern')
	editor.run(
		() => {
			for (const sourceShapeId of sourceShapeIds) {
				const source = editor.getShape(createShapeId(sourceShapeId))
				if (source) editor.deleteShape(source.id)
			}
			editor.createShapes(shapes)
			editor.sendToBack(shapes.map((shape) => shape.id))
		},
		{ ignoreShapeLock: true }
	)

	return {
		regionShapeId,
		pattern,
		created,
		deleted: sourceShapeIds,
		message: `Created ${created.length} clipped ${pattern} shapes.`,
	}
}

function patternShape(
	pattern: 'triangles' | 'diamonds' | 'dots' | 'stripes',
	x: number,
	y: number,
	size: number,
	color: TLGeoShape['props']['color'],
	id: string,
	parentId: TLGeoShape['parentId'],
	index: TLGeoShape['index']
): TLGeoShape {
	const geo =
		pattern === 'triangles' ? 'triangle' : pattern === 'diamonds' ? 'diamond' : pattern === 'dots' ? 'ellipse' : 'rectangle'
	const w = pattern === 'stripes' ? size * 1.7 : size
	const h = pattern === 'stripes' ? size * 0.28 : size
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'geo',
		x,
		y,
		rotation: 0,
		isLocked: false,
		opacity: 1,
		meta: {},
		parentId,
		index,
		props: {
			geo,
			w,
			h,
			color,
			fill: 'solid',
			dash: 'solid',
			size: 's',
			font: 'draw',
			align: 'middle',
			verticalAlign: 'middle',
			richText: { type: 'doc', content: [{ type: 'paragraph' }] },
			labelColor: 'black',
			growY: 0,
			flipX: false,
			flipY: false,
			url: '',
			scale: 1,
		},
	}
}

function geoCorners(shape: TLGeoShape): Point[] {
	return [
		{ x: shape.x, y: shape.y },
		{ x: shape.x + shape.props.w, y: shape.y },
		{ x: shape.x + shape.props.w, y: shape.y + shape.props.h },
		{ x: shape.x, y: shape.y + shape.props.h },
	]
}

function json(data: unknown): BridgeToolOutput {
	return { type: 'json', data }
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve((reader.result as string).split(',')[1])
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

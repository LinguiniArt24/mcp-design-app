import z from 'zod'
import { FocusedColor } from './format/FocusedColor'
import {
	AlignAction,
	BringToFrontAction,
	ClearAction,
	CreateAction,
	CreateManyAction,
	DeleteAction,
	DistributeAction,
	LabelAction,
	MoveAction,
	PenAction,
	PlaceAction,
	ResizeAction,
	RotateAction,
	SendToBackAction,
	StackAction,
	UpdateAction,
} from './schema/AgentActionSchemas'
import { AgentAction } from './types/AgentAction'

/**
 * Guidance sent to every MCP client when it connects.
 */
export const CANVAS_INSTRUCTIONS = `This server edits a tldraw canvas that is open in the user's browser.

- Coordinates are tldraw page coordinates: x grows to the right, y grows downward.
- Shape IDs are plain strings such as "box1", without the "shape:" prefix.
- Call get_canvas (or screenshot) before editing so you know what is already there.
- Every edit tool returns the shapes it created, updated, or deleted, so you can confirm the result without another read.
- Each tool call is one undo step for the user.
- For fast decorative fills: use get_region on the scribbles, then fill_pattern with that region.
- Use create_many when adding several ordinary shapes. Use contains to check fit; take a screenshot only to show the finished result.
- For each part of a sketch, if one built-in shape matches the outline, use create. Otherwise use pen once, as a single closed outline. Do not stack rectangles and ellipses to fake an irregular outline.
- A wheel is an ellipse, so create an ellipse. A tumbler body is a trapezoid and its straw is a rectangle, so create those. A turned table leg swells and narrows, which no built-in shape can do, so pen one outline around the neck, bulbs, and foot.`

const BoundsSchema = z.object({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number(),
})

export type Bounds = z.infer<typeof BoundsSchema>

/** A tool the page applies by running the matching action util. */
interface ActionToolDefinition {
	kind: 'action'
	name: string
	description: string
	input: z.ZodObject
	actionType: AgentAction['_type']
	destructive?: boolean
}

/** A tool the page handles by calling the editor directly. */
interface EditorToolDefinition {
	kind: 'editor'
	name: string
	description: string
	input: z.ZodObject
	readOnly: boolean
}

export type CanvasToolDefinition = ActionToolDefinition | EditorToolDefinition

function actionTool<T extends z.ZodObject<{ _type: z.ZodLiteral<AgentAction['_type']> }>>(
	name: string,
	schema: T,
	description: string,
	options: { destructive?: boolean } = {}
): ActionToolDefinition {
	return {
		kind: 'action',
		name,
		description,
		input: schema.omit({ _type: true }),
		actionType: schema.shape._type.value,
		destructive: options.destructive,
	}
}

export const CANVAS_TOOLS: CanvasToolDefinition[] = [
	// Reading the canvas
	{
		kind: 'editor',
		name: 'get_canvas',
		description:
			'List the shapes on the current page in the same format that create and update accept. Pass bounds to only list shapes that overlap that page area.',
		input: z.object({ bounds: BoundsSchema.optional() }),
		readOnly: true,
	},
	{
		kind: 'editor',
		name: 'get_selection',
		description: 'List the shapes the user currently has selected.',
		input: z.object({}),
		readOnly: true,
	},
	{
		kind: 'editor',
		name: 'get_viewport',
		description: "Get the page area currently visible in the user's browser.",
		input: z.object({}),
		readOnly: true,
	},
	{
		kind: 'editor',
		name: 'screenshot',
		description:
			"Render a PNG of part of the canvas. Defaults to the user's current viewport. Use scale below 1 for large areas.",
		input: z.object({
			bounds: BoundsSchema.optional(),
			scale: z.number().min(0.1).max(2).optional(),
		}),
		readOnly: true,
	},
	{
		kind: 'editor',
		name: 'get_region',
		description:
			'Find the smallest closed shape that contains the supplied scribble shapes. Returns a reusable region shape ID, bounds, and simplified outline.',
		input: z.object({ shapeIds: z.array(z.string()).min(1) }),
		readOnly: true,
	},
	{
		kind: 'editor',
		name: 'contains',
		description:
			'Check whether candidate shapes are fully inside a closed region. Returns contained and crossing shape IDs.',
		input: z.object({ regionShapeId: z.string(), shapeIds: z.array(z.string()).min(1) }),
		readOnly: true,
	},
	{
		kind: 'editor',
		name: 'set_view',
		description:
			"Move the user's camera so the given page area is in view. x and y are the top-left corner.",
		input: BoundsSchema,
		readOnly: false,
	},

	// Individual shapes
	actionTool(
		'create',
		CreateAction,
		'Create one shape. Choose a short, descriptive shapeId; if it is taken, a number is appended and the result reports the real id. Use create only when one built-in shape matches the part, such as an ellipse for a wheel or a trapezoid and rectangle for a tumbler body and straw. Draw shapes cannot be created here; an irregular outline, such as a turned table leg, must be one closed pen stroke instead of stacked geometry.'
	),
	actionTool(
		'create_many',
		CreateManyAction,
		'Create several shapes in one call and one undo step. Use this for repeated ordinary shapes.'
	),
	actionTool(
		'update',
		UpdateAction,
		"Change an existing shape. Pass the full shape as returned by get_canvas with the fields you want changed. The shape's shapeId selects which shape to update."
	),
	actionTool('delete', DeleteAction, 'Delete one shape.', { destructive: true }),
	actionTool(
		'label',
		LabelAction,
		'Set the text of a shape that holds text, such as a geo, note, text, or arrow shape.'
	),
	actionTool(
		'move',
		MoveAction,
		"Move a shape so that the chosen anchor point of its bounds lands at (x, y). For example, anchor 'center' puts the shape's center at (x, y)."
	),

	// Groups of shapes
	actionTool(
		'place',
		PlaceAction,
		'Position a shape next to a reference shape on the given side. sideOffset is the gap between them; align and alignOffset control placement along that side.'
	),
	actionTool(
		'resize',
		ResizeAction,
		'Scale shapes by scaleX and scaleY around the page point (originX, originY).'
	),
	actionTool(
		'rotate',
		RotateAction,
		'Rotate shapes clockwise by the given degrees around the page point (originX, originY).'
	),
	actionTool('align', AlignAction, 'Align shapes to each other along one edge or center line.'),
	actionTool(
		'distribute',
		DistributeAction,
		'Space shapes evenly in the horizontal or vertical direction.'
	),
	actionTool(
		'stack',
		StackAction,
		'Stack shapes one after another in a row or column with the given gap. This does not align them on the other axis.'
	),
	actionTool('bring_to_front', BringToFrontAction, 'Bring shapes in front of everything else.'),
	actionTool('send_to_back', SendToBackAction, 'Send shapes behind everything else.'),
	actionTool('clear', ClearAction, 'Delete every shape on the current page.', {
		destructive: true,
	}),

	// Drawing
	actionTool(
		'pen',
		PenAction,
		'Draw a freeform line through the given page points. "smooth" curves between points and "straight" draws straight segments. Set closed to join the last point back to the first. Each call draws one stroke. Use one closed stroke when the outline is irregular, such as a turned table leg that swells and narrows. A wheel or a tumbler body should be created as an ellipse or trapezoid instead.'
	),
	{
		kind: 'editor',
		name: 'fill_pattern',
		description:
			'Fill a closed region with a clipped decorative pattern. Optionally deletes source scribbles, then puts the pattern behind the region outline.',
		input: z.object({
			regionShapeId: z.string(),
			sourceShapeIds: z.array(z.string()).optional(),
			pattern: z.enum(['triangles', 'diamonds', 'dots', 'stripes']),
			colors: z.array(FocusedColor).min(1).optional(),
			spacing: z.number().min(8).max(200).optional(),
		}),
		readOnly: false,
	},
]

export function getCanvasTool(name: string): CanvasToolDefinition | undefined {
	return CANVAS_TOOLS.find((tool) => tool.name === name)
}

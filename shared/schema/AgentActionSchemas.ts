import z from 'zod'
import { FocusedColor } from '../format/FocusedColor'
import { FocusedFillSchema } from '../format/FocusedFill'
import { FocusedShapeSchema, FocusedTextAnchorSchema } from '../format/FocusedShape'
import { SimpleShapeIdSchema } from '../types/ids-schema'

/**
 * Schemas for the canvas operations exposed as MCP write tools.
 * Tool names and descriptions live in `shared/tools.ts`.
 */

// Align Action
export const AlignAction = z.object({
	_type: z.literal('align'),
	alignment: z.enum(['top', 'bottom', 'left', 'right', 'center-horizontal', 'center-vertical']),
	gap: z.number(),
	shapeIds: z.array(SimpleShapeIdSchema),
})

export type AlignAction = z.infer<typeof AlignAction>

// Bring to Front Action
export const BringToFrontAction = z.object({
	_type: z.literal('bringToFront'),
	shapeIds: z.array(SimpleShapeIdSchema),
})

export type BringToFrontAction = z.infer<typeof BringToFrontAction>

// Clear Action
export const ClearAction = z.object({
	_type: z.literal('clear'),
})

export type ClearAction = z.infer<typeof ClearAction>

// Create Action
export const CreateAction = z.object({
	_type: z.literal('create'),
	shape: FocusedShapeSchema,
})

export type CreateAction = z.infer<typeof CreateAction>

// Create Many Action
export const CreateManyAction = z.object({
	_type: z.literal('createMany'),
	shapes: z.array(FocusedShapeSchema).min(1),
})

export type CreateManyAction = z.infer<typeof CreateManyAction>

// Delete Action
export const DeleteAction = z.object({
	_type: z.literal('delete'),
	shapeId: SimpleShapeIdSchema,
})

export type DeleteAction = z.infer<typeof DeleteAction>

// Distribute Action
export const DistributeAction = z.object({
	_type: z.literal('distribute'),
	direction: z.enum(['horizontal', 'vertical']),
	shapeIds: z.array(SimpleShapeIdSchema),
})

export type DistributeAction = z.infer<typeof DistributeAction>

// Label Action
export const LabelAction = z.object({
	_type: z.literal('label'),
	shapeId: SimpleShapeIdSchema,
	text: z.string(),
})

export type LabelAction = z.infer<typeof LabelAction>

// Move Action
export const MoveAction = z.object({
	_type: z.literal('move'),
	anchor: FocusedTextAnchorSchema,
	shapeId: SimpleShapeIdSchema,
	x: z.number(),
	y: z.number(),
})

export type MoveAction = z.infer<typeof MoveAction>

// Pen Action
export const PenAction = z.object({
	_type: z.literal('pen'),
	shapeId: SimpleShapeIdSchema,
	color: FocusedColor,
	closed: z.boolean(),
	fill: FocusedFillSchema,
	points: z.array(
		z.object({
			x: z.number(),
			y: z.number(),
		})
	),
	style: z.enum(['smooth', 'straight']),
})

export type PenAction = z.infer<typeof PenAction>

// Place Action
export const PlaceAction = z.object({
	_type: z.literal('place'),
	align: z.enum(['start', 'center', 'end']),
	alignOffset: z.number(),
	referenceShapeId: SimpleShapeIdSchema,
	side: z.enum(['top', 'bottom', 'left', 'right']),
	sideOffset: z.number(),
	shapeId: SimpleShapeIdSchema,
})

export type PlaceAction = z.infer<typeof PlaceAction>

// Resize Action
export const ResizeAction = z.object({
	_type: z.literal('resize'),
	originX: z.number(),
	originY: z.number(),
	scaleX: z.number(),
	scaleY: z.number(),
	shapeIds: z.array(SimpleShapeIdSchema),
})

export type ResizeAction = z.infer<typeof ResizeAction>

// Rotate Action
export const RotateAction = z.object({
	_type: z.literal('rotate'),
	degrees: z.number(),
	originX: z.number(),
	originY: z.number(),
	shapeIds: z.array(SimpleShapeIdSchema),
})

export type RotateAction = z.infer<typeof RotateAction>

// Send to Back Action
export const SendToBackAction = z.object({
	_type: z.literal('sendToBack'),
	shapeIds: z.array(SimpleShapeIdSchema),
})

export type SendToBackAction = z.infer<typeof SendToBackAction>

// Stack Action
export const StackAction = z.object({
	_type: z.literal('stack'),
	direction: z.enum(['vertical', 'horizontal']),
	gap: z.number(),
	shapeIds: z.array(SimpleShapeIdSchema),
})

export type StackAction = z.infer<typeof StackAction>

// Update Action
export const UpdateAction = z.object({
	_type: z.literal('update'),
	update: FocusedShapeSchema,
})

export type UpdateAction = z.infer<typeof UpdateAction>

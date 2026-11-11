import { createShapeId, Editor, TLShapeId, VecModel } from 'tldraw'
import { FocusedFill, FocusedFillSchema } from '../shared/format/FocusedFill'
import { SimpleShapeId } from '../shared/types/ids-schema'
import { TldrawAgent } from './agent/TldrawAgent'

/**
 * Validation helpers used while sanitizing an action, scoped to one tool call.
 *
 * Some helpers save state. For example, `ensureShapeIdIsUnique` changes a
 * shape's ID if it's already taken, and records the change so that later
 * lookups within the same call can still use the original ID.
 */
export class AgentHelpers {
	/**
	 * The agent that this instance of AgentHelpers is for.
	 */
	agent: TldrawAgent

	/**
	 * The editor that this instance of AgentHelpers is for.
	 */
	editor: Editor

	constructor(agent: TldrawAgent) {
		this.agent = agent
		this.editor = agent.editor
	}

	/**
	 * A map of shape ids that have been transformed as part of this call.
	 * The key is the original id, and the value is the transformed id.
	 */
	shapeIdMap = new Map<string, string>()

	/**
	 * Ensure that a shape ID is unique.
	 * @param id - The id to check (a SimpleShapeId, not a TLShapeId).
	 * @returns The unique id (always without the "shape:" prefix).
	 */
	ensureShapeIdIsUnique(id = 'shape' as SimpleShapeId): SimpleShapeId {
		const { editor } = this

		// Ensure the id is unique by incrementing a number at the end
		let newId = id
		let existingShape = editor.getShape(`shape:${newId}` as TLShapeId)
		while (existingShape) {
			newId = /^.*(\d+)$/.exec(newId)?.[1]
				? (newId.replace(/(\d+)$/, (m) => {
						return (+m + 1).toString()
					}) as SimpleShapeId)
				: (`${newId}-1` as SimpleShapeId)
			existingShape = editor.getShape(`shape:${newId}` as TLShapeId)
		}

		// If the id was transformed, track it so that later lookups can refer to it by its original id.
		if (id !== newId) {
			this.shapeIdMap.set(id, newId)
		}

		return newId as SimpleShapeId
	}

	/**
	 * Ensure that a shape ID refers to a real shape.
	 * @param id - The id to check.
	 * @returns The real id, or null if the shape doesn't exist.
	 */
	ensureShapeIdExists(id: SimpleShapeId): SimpleShapeId | null {
		// If there's already a transformed ID, use that
		const existingId = this.shapeIdMap.get(id)
		if (existingId) {
			return existingId as SimpleShapeId
		}

		// If there's an existing shape with this ID, use that
		const existingShape = this.editor.getShape(createShapeId(id))
		if (existingShape) {
			return id
		}

		// Otherwise, give up
		return null
	}

	/**
	 * Ensure that all shape IDs refer to real shapes.
	 * @param ids - An array of ids to check.
	 * @returns The array of ids, with missing ids removed.
	 */
	ensureShapeIdsExist(ids: SimpleShapeId[]): SimpleShapeId[] {
		return ids.map((id) => this.ensureShapeIdExists(id)).filter((v) => v !== null)
	}

	/**
	 * Ensure that a value is a number.
	 * @returns The number, or null if the value is not a number.
	 */
	ensureValueIsNumber(value: any): number | null {
		if (typeof value === 'number') {
			return value
		}

		if (typeof value === 'string') {
			const parsedValue = parseFloat(value)
			if (isNaN(parsedValue)) {
				return null
			}
			return parsedValue
		}

		return null
	}

	/**
	 * Ensure that a value is a vector.
	 * @returns The vector, or null if the value is not a vector.
	 */
	ensureValueIsVec(value: any): VecModel | null {
		if (!value) return null
		if (typeof value !== 'object') return null
		if (!('x' in value) || !('y' in value)) return null

		const x = this.ensureValueIsNumber(value.x)
		const y = this.ensureValueIsNumber(value.y)
		if (x === null || y === null) return null
		return { x, y }
	}

	/**
	 * Ensure that a value is a boolean.
	 * @returns The boolean, or null if the value is not a boolean.
	 */
	ensureValueIsBoolean(value: any): boolean | null {
		if (typeof value === 'boolean') {
			return value
		}

		if (typeof value === 'number') {
			return value > 0
		}

		if (typeof value === 'string') {
			return value !== 'false'
		}

		return null
	}

	/**
	 * Ensure that a value is a focused fill.
	 * @returns The focused fill, or null if the value is not a focused fill.
	 */
	ensureValueIsFocusedFill(value: any): FocusedFill | null {
		const focusedFill = FocusedFillSchema.safeParse(value)
		if (focusedFill.success) {
			return focusedFill.data
		}
		return null
	}
}

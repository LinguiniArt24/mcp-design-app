import { TLShapeId } from 'tldraw'
import { RotateAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const RotateActionUtil = registerActionUtil(
	class RotateActionUtil extends AgentActionUtil<RotateAction> {
		static override type = 'rotate' as const

		override sanitizeAction(action: Streaming<RotateAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<RotateAction>) {
			if (
				!action.shapeIds ||
				!action.degrees ||
				action.originX == null ||
				action.originY == null
			) {
				return
			}

			const origin = { x: action.originX, y: action.originY }
			const shapeIds = action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId)
			const radians = (action.degrees * Math.PI) / 180

			this.editor.rotateShapesBy(shapeIds, radians, { center: origin })
		}
	}
)

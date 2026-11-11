import { ClearAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const ClearActionUtil = registerActionUtil(
	class ClearActionUtil extends AgentActionUtil<ClearAction> {
		static override type = 'clear' as const

		override applyAction(action: Streaming<ClearAction>) {
			if (!action.complete) return

			// Delete all shapes on the page
			const { editor } = this

			const allShapes = editor.getCurrentPageShapes()
			editor.deleteShapes(allShapes)
		}
	}
)

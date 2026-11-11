import { RecordsDiff, reverseRecordsDiff, structuredClone, TLRecord } from 'tldraw'
import { AgentAction } from '../../../shared/types/AgentAction'
import { Streaming } from '../../../shared/types/Streaming'
import { AgentActionUtil, getAgentActionUtilsRecord } from '../../actions/AgentActionUtil'
import { AgentHelpers } from '../../AgentHelpers'
import type { TldrawAgent } from '../TldrawAgent'

// Import action utils to ensure they register themselves
import '../../actions/AlignActionUtil'
import '../../actions/BringToFrontActionUtil'
import '../../actions/ClearActionUtil'
import '../../actions/CreateActionUtil'
import '../../actions/DeleteActionUtil'
import '../../actions/DistributeActionUtil'
import '../../actions/LabelActionUtil'
import '../../actions/MoveActionUtil'
import '../../actions/PenActionUtil'
import '../../actions/PlaceActionUtil'
import '../../actions/ResizeActionUtil'
import '../../actions/RotateActionUtil'
import '../../actions/SendToBackActionUtil'
import '../../actions/StackActionUtil'
import '../../actions/UpdateActionUtil'

/**
 * Looks up action utils and applies actions to the editor.
 */
export class AgentActionManager {
	private agentActionUtils: Record<AgentAction['_type'], AgentActionUtil<AgentAction>>

	constructor(private agent: TldrawAgent) {
		this.agentActionUtils = getAgentActionUtilsRecord(agent)
	}

	/**
	 * Get the agent action util for a specific action type, if there is one.
	 */
	getAgentActionUtil(type?: string): AgentActionUtil<AgentAction> | undefined {
		if (!type) return undefined
		return this.agentActionUtils[type as AgentAction['_type']]
	}

	/**
	 * Apply an action to the editor. If the action throws, its partial changes
	 * are reverted before the error is rethrown.
	 * @returns The diff of changes made and a promise that resolves when the action completes.
	 */
	act(
		action: Streaming<AgentAction>,
		helpers: AgentHelpers
	): {
		diff: RecordsDiff<TLRecord>
		promise: Promise<void> | null
	} {
		const util = this.getAgentActionUtil(action._type)
		if (!util) {
			throw new Error(`No action util registered for "${action._type}"`)
		}

		const { store } = this.agent.editor
		let promise: Promise<void> | null = null
		let failure: unknown = null

		// An error escaping a store transaction makes tldraw treat the store as
		// corrupted and crash the editor, so it must be caught inside.
		const diff = store.extractingChanges(() => {
			try {
				promise = util.applyAction(structuredClone(action), helpers) ?? null
			} catch (error) {
				failure = error
			}
		})

		if (failure) {
			store.applyDiff(reverseRecordsDiff(diff))
			throw failure
		}

		return { diff, promise }
	}
}

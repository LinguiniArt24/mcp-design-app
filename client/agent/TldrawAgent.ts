import { Editor } from 'tldraw'
import { AgentActionManager } from './managers/AgentActionManager'

/**
 * Applies canvas actions to an editor. Tool calls arriving over the MCP
 * bridge are turned into actions and run through this agent's action utils.
 */
export class TldrawAgent {
	/** The editor associated with this agent. */
	editor: Editor

	/** The action manager associated with this agent. */
	actions: AgentActionManager

	constructor(editor: Editor) {
		this.editor = editor
		this.actions = new AgentActionManager(this)
	}
}

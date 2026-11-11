/**
 * Messages exchanged between the MCP server and the canvas page over the
 * localhost websocket. The MCP server listens; the page connects.
 */

export const BRIDGE_PORT = 3711

/** Sent by the MCP server to ask the page to run a tool. */
export interface BridgeToolCall {
	type: 'call'
	id: string
	tool: string
	args: Record<string, unknown>
}

export type BridgeToolOutput =
	| { type: 'json'; data: unknown }
	| { type: 'image'; data: string; mimeType: string }

/** Sent by the page once a tool call has finished. */
export type BridgeToolResult =
	| { type: 'result'; id: string; ok: true; output: BridgeToolOutput }
	| { type: 'result'; id: string; ok: false; error: string }

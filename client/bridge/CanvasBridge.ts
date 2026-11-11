import { atom, Editor } from 'tldraw'
import { BRIDGE_PORT, BridgeToolCall, BridgeToolResult } from '../../shared/bridge'
import { TldrawAgent } from '../agent/TldrawAgent'
import { runCanvasTool } from './runCanvasTool'

export type BridgeStatus = 'connecting' | 'connected' | 'disconnected'

const MIN_RETRY_MS = 500
const MAX_RETRY_MS = 5000

/**
 * Keeps the page connected to the local MCP server and runs the tool calls it
 * forwards. Reconnects with backoff whenever the server isn't reachable.
 */
export class CanvasBridge {
	readonly $status = atom<BridgeStatus>('bridge status', 'connecting')

	private agent: TldrawAgent
	private socket: WebSocket | null = null
	private retryTimer: ReturnType<typeof setTimeout> | null = null
	private retryMs = MIN_RETRY_MS
	private disposed = false

	constructor(editor: Editor) {
		this.agent = new TldrawAgent(editor)
	}

	connect() {
		if (this.disposed) return

		const socket = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}`)
		this.socket = socket

		socket.onopen = () => {
			this.retryMs = MIN_RETRY_MS
			this.$status.set('connected')
		}
		socket.onmessage = (event) => {
			this.handleMessage(socket, event.data)
		}
		socket.onclose = () => {
			if (this.socket === socket) this.socket = null
			if (this.disposed) return
			this.$status.set('disconnected')
			this.retryTimer = setTimeout(() => this.connect(), this.retryMs)
			this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS)
		}
	}

	dispose() {
		this.disposed = true
		if (this.retryTimer) clearTimeout(this.retryTimer)
		this.socket?.close()
		this.socket = null
	}

	private async handleMessage(socket: WebSocket, raw: unknown) {
		let call: BridgeToolCall
		try {
			call = JSON.parse(String(raw))
		} catch {
			console.error('Ignoring malformed message from the MCP server')
			return
		}
		if (call.type !== 'call') return

		let reply: BridgeToolResult
		try {
			const output = await runCanvasTool(this.agent, call.tool, call.args)
			reply = { type: 'result', id: call.id, ok: true, output }
		} catch (error) {
			console.error(`Tool "${call.tool}" failed`, error)
			reply = {
				type: 'result',
				id: call.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}

		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(reply))
		}
	}
}

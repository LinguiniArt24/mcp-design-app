import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import {
	BRIDGE_PORT,
	BridgeToolCall,
	BridgeToolOutput,
	BridgeToolResult,
} from '../shared/bridge'

const CALL_TIMEOUT_MS = 30_000
const PAGE_URL = 'http://localhost:5173/'
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

interface PendingCall {
	page: WebSocket
	resolve: (output: BridgeToolOutput) => void
	reject: (error: Error) => void
	timer: NodeJS.Timeout
}

/**
 * Websocket server that canvas pages connect to. Tool calls are sent to the
 * most recently connected page, which applies them and replies with a result.
 */
export class PageBridge {
	private pages: WebSocket[] = []
	private pending = new Map<string, PendingCall>()
	private listenError: Error | null = null

	constructor(private port = BRIDGE_PORT) {
		const server = new WebSocketServer({
			host: '127.0.0.1',
			port,
			verifyClient: ({ origin }: { origin: string | undefined }) => isLocalOrigin(origin),
		})
		server.on('listening', () => {
			console.error(`[canvas-mcp] Waiting for the canvas page on ws://127.0.0.1:${port}`)
		})
		server.on('error', (error) => {
			this.listenError = error
			console.error(`[canvas-mcp] Could not listen on port ${port}:`, error.message)
		})
		server.on('connection', (page) => this.handleConnection(page))
	}

	call(tool: string, args: Record<string, unknown>): Promise<BridgeToolOutput> {
		if (this.listenError) {
			return Promise.reject(
				new Error(
					`The canvas bridge could not start on port ${this.port} (${this.listenError.message}). Another canvas MCP server is probably running; stop it and restart this one.`
				)
			)
		}

		const page = this.pages.at(-1)
		if (!page) {
			return Promise.reject(
				new Error(
					`No canvas page is connected. Run \`npm run dev\`, open ${PAGE_URL} in a browser, and retry.`
				)
			)
		}

		const id = randomUUID()
		const message: BridgeToolCall = { type: 'call', id, tool, args }

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id)
				reject(new Error(`The canvas page did not answer "${tool}" within ${CALL_TIMEOUT_MS / 1000}s.`))
			}, CALL_TIMEOUT_MS)
			this.pending.set(id, { page, resolve, reject, timer })
			page.send(JSON.stringify(message))
		})
	}

	private handleConnection(page: WebSocket) {
		this.pages.push(page)
		console.error(`[canvas-mcp] Canvas page connected (${this.pages.length} open)`)

		page.on('message', (raw) => {
			let result: BridgeToolResult
			try {
				result = JSON.parse(raw.toString())
			} catch {
				console.error('[canvas-mcp] Ignoring malformed message from page')
				return
			}
			if (result.type !== 'result') return

			const call = this.pending.get(result.id)
			if (!call) return
			this.pending.delete(result.id)
			clearTimeout(call.timer)

			if (result.ok) {
				call.resolve(result.output)
			} else {
				call.reject(new Error(result.error))
			}
		})

		page.on('close', () => {
			this.pages = this.pages.filter((p) => p !== page)
			console.error(`[canvas-mcp] Canvas page disconnected (${this.pages.length} open)`)

			for (const [id, call] of this.pending) {
				if (call.page !== page) continue
				this.pending.delete(id)
				clearTimeout(call.timer)
				call.reject(new Error('The canvas page closed before the tool call finished.'))
			}
		})
	}
}

function isLocalOrigin(origin: string | undefined): boolean {
	// Non-browser clients send no Origin header.
	if (!origin) return true
	try {
		return LOCAL_HOSTNAMES.has(new URL(origin).hostname)
	} catch {
		return false
	}
}

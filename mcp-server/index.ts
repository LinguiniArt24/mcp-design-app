import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { BridgeToolOutput } from '../shared/bridge'
import { CANVAS_INSTRUCTIONS, CANVAS_TOOLS } from '../shared/tools'
import { PageBridge } from './bridge'

// stdout carries the MCP protocol, so all logging goes to stderr.

const bridge = new PageBridge()

const server = new McpServer(
	{ name: 'tldraw-canvas', version: '0.1.0' },
	{ instructions: CANVAS_INSTRUCTIONS }
)

for (const tool of CANVAS_TOOLS) {
	server.registerTool(
		tool.name,
		{
			description: tool.description,
			inputSchema: tool.input,
			annotations:
				tool.kind === 'editor'
					? { readOnlyHint: tool.readOnly }
					: { readOnlyHint: false, destructiveHint: tool.destructive ?? false },
		},
		async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const output = await bridge.call(tool.name, args)
				return toCallToolResult(output)
			} catch (error) {
				return {
					isError: true,
					content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
				}
			}
		}
	)
}

function toCallToolResult(output: BridgeToolOutput): CallToolResult {
	if (output.type === 'image') {
		return { content: [{ type: 'image', data: output.data, mimeType: output.mimeType }] }
	}
	return { content: [{ type: 'text', text: JSON.stringify(output.data, null, 2) }] }
}

await server.connect(new StdioServerTransport())

// The websocket server would otherwise keep the process (and the port) alive
// after the MCP client goes away.
process.stdin.on('close', () => process.exit(0))

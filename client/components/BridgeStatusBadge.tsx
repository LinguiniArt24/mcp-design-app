import { useValue } from 'tldraw'
import { BridgeStatus, CanvasBridge } from '../bridge/CanvasBridge'

const LABELS: Record<BridgeStatus, string> = {
	connecting: 'Connecting to MCP server…',
	connected: 'MCP server connected',
	disconnected: 'Waiting for MCP server',
}

const TITLES: Record<BridgeStatus, string> = {
	connecting: 'Looking for the canvas MCP server on this machine.',
	connected: 'Agents using the canvas MCP server can now read and edit this canvas.',
	disconnected:
		'Start the canvas MCP server from your agent (for example, enable "canvas" in Cursor). This page reconnects automatically.',
}

export function BridgeStatusBadge({ bridge }: { bridge: CanvasBridge }) {
	const status = useValue('bridge status', () => bridge.$status.get(), [bridge])

	return (
		<div className={`bridge-status bridge-status-${status}`} title={TITLES[status]}>
			<span className="bridge-status-dot" />
			{LABELS[status]}
		</div>
	)
}

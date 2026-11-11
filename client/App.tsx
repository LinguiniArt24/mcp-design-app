import { useCallback, useMemo, useState } from 'react'
import { DefaultSizeStyle, Editor, TLComponents, Tldraw } from 'tldraw'
import { CanvasBridge } from './bridge/CanvasBridge'
import { BridgeStatusBadge } from './components/BridgeStatusBadge'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')

function App() {
	const [bridge, setBridge] = useState<CanvasBridge | null>(null)

	const handleMount = useCallback((editor: Editor) => {
		const instance = new CanvasBridge(editor)
		instance.connect()
		setBridge(instance)

		// Expose to window for debugging
		;(window as any).editor = editor

		return () => {
			instance.dispose()
			setBridge(null)
			delete (window as any).editor
		}
	}, [])

	const components: TLComponents = useMemo(
		() => ({
			TopPanel: () => bridge && <BridgeStatusBadge bridge={bridge} />,
		}),
		[bridge]
	)

	return (
		<div className="tldraw-canvas">
			<Tldraw persistenceKey="tldraw-agent-demo" onMount={handleMount} components={components} />
		</div>
	)
}

export default App

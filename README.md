# MCP canvas

A [tldraw](https://github.com/tldraw/tldraw) canvas that any MCP-capable agent can read and edit, the way the Fusion 360 MCP server lets an agent drive Fusion. The app makes no model calls and needs no API keys: the agent you already use (Cursor, Claude Desktop, or any other MCP client) does the thinking, and this project gives it tools for the canvas.

```
Agent (Cursor, Claude...) --MCP stdio--> mcp-server (Node) --ws://127.0.0.1:3711--> canvas page (browser)
```

The browser tab is the document. The MCP server is a thin adapter: each tool call is forwarded to the open page, which applies it to the tldraw editor and sends the result back.

## Setup (once)

1. Install dependencies:

   ```
   npm install
   ```

2. Enable the MCP server in your agent.

   **Cursor:** this repo ships `.cursor/mcp.json`, which registers a server named `canvas`. Open the project in Cursor, then go to **Settings > MCP** and turn on `canvas`.

   **Other MCP clients** (for example Claude Desktop): add a stdio server that runs Node with absolute paths:

   ```json
   {
   	"mcpServers": {
   		"canvas": {
   			"command": "node",
   			"args": [
   				"--import",
   				"/absolute/path/to/this/repo/node_modules/tsx/dist/loader.mjs",
   				"/absolute/path/to/this/repo/mcp-server/index.ts"
   			]
   		}
   	}
   }
   ```

## Daily use

1. Serve the canvas page:

   ```
   npm run dev
   ```

2. Open `http://localhost:5173/`. The badge at the top of the canvas shows **MCP server connected** once your agent has started the MCP server. It reconnects by itself, so it doesn't matter which one starts first.
3. Ask your agent to draw or edit. It calls the canvas tools, and the canvas updates in the browser. You can keep drawing yourself between agent turns, and each tool call is one undo step.

Keep the tab open while the agent works. If it's closed, tool calls fail with a message asking you to open the page again.

## Tools

Reading the canvas:

| Tool | What it does |
| --- | --- |
| `get_canvas` | List shapes on the current page, optionally only inside `bounds`. |
| `get_selection` | List the shapes the user has selected. |
| `get_viewport` | Get the page area visible in the browser. |
| `screenshot` | PNG of an area (defaults to the current viewport). |
| `set_view` | Move the user's camera to a page area. |

Editing the canvas:

| Tool | What it does |
| --- | --- |
| `create`, `update`, `delete`, `label` | Work with one shape. |
| `move`, `place` | Position a shape absolutely or relative to another shape. |
| `resize`, `rotate` | Transform shapes around an origin point. |
| `align`, `distribute`, `stack` | Lay out groups of shapes. |
| `bring_to_front`, `send_to_back` | Reorder shapes. |
| `pen` | Draw a freeform stroke through points. |
| `clear` | Delete every shape on the page. |

Every edit tool returns the shapes it created, updated, and deleted. Shapes use a simplified "focused" format (`_type`, `shapeId`, `x`, `y`, `w`, `h`, `color`, `fill`, `text`, and so on), and that same format is what `create` and `update` accept. Coordinates are tldraw page coordinates, and shape IDs are plain strings like `box1`.

## Project layout

- **`mcp-server/`**: The MCP server (`index.ts`) and the websocket bridge to the page (`bridge.ts`). Cursor launches this; `npm run mcp` runs it by hand.
- **`client/`**: The canvas page. `bridge/CanvasBridge.ts` connects to the MCP server, and `bridge/runCanvasTool.ts` runs each tool call. Edit tools go through the action utils in `client/actions/`.
- **`shared/`**: Code used by both sides. `tools.ts` is the tool catalog (names, descriptions, input schemas), `bridge.ts` defines the websocket messages, `schema/AgentActionSchemas.ts` defines the edit tools' inputs, and `format/` converts between tldraw shapes and the focused format.

## Adding an edit tool

1. Add a Zod schema with a `_type` literal to `shared/schema/AgentActionSchemas.ts`.
2. Add an action util in `client/actions/` that extends `AgentActionUtil` and implements `applyAction` (and `sanitizeAction` if it needs validation). Wrap it in `registerActionUtil`, then import it in `client/agent/managers/AgentActionManager.ts`.
3. Register the tool in `CANVAS_TOOLS` in `shared/tools.ts` with `actionTool(name, schema, description)`.
4. Restart the MCP server in your agent so it picks up the new tool, and reload the page.

Read-only or camera tools that don't change shapes are `kind: 'editor'` entries in `CANVAS_TOOLS`, handled in the `switch` in `client/bridge/runCanvasTool.ts`.

## Troubleshooting

- **Badge says "Waiting for MCP server"**: The agent hasn't started the server. In Cursor, check that `canvas` is enabled under **Settings > MCP**.
- **Tool error about port 3711**: Another copy of the MCP server is already running, for example from a second Cursor window. Only one can own the bridge port; disable the extra one.
- **"No canvas page is connected"**: Run `npm run dev` and open `http://localhost:5173/`.

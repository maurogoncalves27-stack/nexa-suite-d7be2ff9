import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";

export default defineMcp({
  name: "nexa-suite-mcp",
  title: "NEXA Suite MCP",
  version: "0.1.0",
  instructions:
    "MCP server for NEXA Suite. Use `echo` to verify connectivity. Additional tools can be added under src/lib/mcp/tools/.",
  tools: [echoTool],
});

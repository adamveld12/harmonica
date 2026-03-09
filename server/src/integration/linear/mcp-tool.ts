import type { McpServerConfig } from "../../types.ts";
import { fileURLToPath } from "url";

const LINEAR_API = "https://api.linear.app/graphql";

export function createLinearMcpServerConfig(apiKey: string): McpServerConfig {
  const thisFile = fileURLToPath(import.meta.url);
  return {
    type: "stdio",
    command: "bun",
    args: ["run", thisFile],
    env: { LINEAR_API_KEY: apiKey },
  };
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

function respond(id: number | string, result: unknown): void {
  const response: JsonRpcResponse = { jsonrpc: "2.0", id, result };
  process.stdout.write(JSON.stringify(response) + "\n");
}

async function handleRequest(req: JsonRpcRequest, apiKey: string): Promise<void> {
  const { id, method, params } = req;

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "linear-mcp", version: "1.0.0" },
    });
    return;
  }

  if (method === "tools/list") {
    respond(id, {
      tools: [
        {
          name: "linear_graphql",
          description: "Execute a GraphQL query against the Linear API",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              variables: { type: "object" },
            },
            required: ["query"],
          },
        },
      ],
    });
    return;
  }

  if (method === "tools/call") {
    const args = (params?.arguments ?? {}) as {
      query: string;
      variables?: Record<string, unknown>;
    };
    const response = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: args.query, variables: args.variables ?? {} }),
    });
    const data = await response.json();
    respond(id, {
      content: [{ type: "text", text: JSON.stringify(data) }],
    });
    return;
  }

  if (method === "notifications/initialized") {
    // Notification, no response needed
    return;
  }

  respond(id, null);
}

async function runServer(): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY environment variable is required");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of process.stdin as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const req = JSON.parse(trimmed) as JsonRpcRequest;
      await handleRequest(req, apiKey);
    }
  }
}

if (import.meta.main) {
  runServer().catch(console.error);
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { commerceSchemas, commerceToolDescriptions, executeCommerceTool, CommerceError, type CommerceToolName } from '@/lib/ai-commerce'
import { checkRateLimit } from '@/lib/rate-limit'
import { SITE_URL } from '@/lib/site'
import { clientIp } from '@/lib/client-ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function protocolError(status: number, message: string, extraHeaders: Record<string, string> = {}) {
  return Response.json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }, {
    status, headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(SITE_URL).origin
}

export async function POST(request: Request) {
  if (!allowedOrigin(request)) return protocolError(403, 'Origin not allowed.')
  const ip = clientIp(request)
  const limit = checkRateLimit(`ai-mcp:${ip}`, 60, 60_000)
  if (!limit.allowed) {
    return protocolError(429, 'Too many requests.', { 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) })
  }

  // These tools read storefront data and construct optional private draft links.
  // No sessions, customer records, charges, writes, or long-lived SSE streams.
  const server = new McpServer({ name: 'eastel-commerce', version: '1.0.0' }, {
    instructions: 'Help customers buy one Eastel SIM, optionally with a paid mobile plan the merchant purchases manually after SIM registration. Always offer SIM-only; never claim the SIM price includes a plan. With a chosen plan, show its additional fee and explain all budget/quota gaps. The actual order saves the selected plan and price; a prepared link is not an order or payment. Default to assisted form filling; offer website mode for customers entering their own details. Only prefill voluntarily supplied shipping/contact data. The customer must review and authorize payment on secure website/bank pages. Never collect passwords, OTPs or bank/card credentials. Private prefill links expire in 15 minutes.',
    maxToolInputElements: 20,
  })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 16 * 1024,
  })
  for (const name of Object.keys(commerceSchemas) as CommerceToolName[]) {
    server.registerTool(name, {
      description: commerceToolDescriptions[name],
      inputSchema: commerceSchemas[name],
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (args: unknown) => {
      try {
        const data = await executeCommerceTool(name, args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data }
      } catch (error) {
        const data = error instanceof CommerceError
          ? { status: 'error', code: error.code, message: error.message }
          : { status: 'error', code: 'service_unavailable', message: 'Commerce information is temporarily unavailable.' }
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data }
      }
    })
  }
  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } finally {
    await server.close()
  }
}

// Streamable HTTP permits a server with no unsolicited events to reject GET.
// A stateless server has no session for DELETE to terminate.
export async function GET(request: Request) {
  if (!allowedOrigin(request)) return protocolError(403, 'Origin not allowed.')
  return protocolError(405, 'Use MCP Streamable HTTP POST.', { Allow: 'POST' })
}

export async function DELETE(request: Request) {
  if (!allowedOrigin(request)) return protocolError(403, 'Origin not allowed.')
  return protocolError(405, 'This MCP server has no persistent sessions.', { Allow: 'POST' })
}

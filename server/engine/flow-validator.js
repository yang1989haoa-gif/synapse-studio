function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value || '').trim()
}

function nodeName(node) {
  return clean(node?.data?.label) || clean(node?.id) || 'Unnamed node'
}

function addNodeError(errors, code, node, message, suggestion) {
  errors.push({
    code,
    nodeId: node?.id,
    nodeName: nodeName(node),
    message,
    ...(suggestion ? { suggestion } : {}),
  })
}

function addEdgeError(errors, code, edge, nodeId, message) {
  errors.push({
    code,
    edgeId: edge?.id,
    nodeId,
    message,
  })
}

function validateGraphShape(nodes, edges, errors) {
  if (nodes.length === 0) {
    errors.push({
      code: 'empty-flow',
      message: 'Flow must contain at least one node before it can run.',
      suggestion: 'Add an input, trigger, or agent node before running.',
    })
    return
  }

  const ids = new Set()
  const duplicateIds = new Set()
  for (const node of nodes) {
    if (!clean(node?.id)) {
      addNodeError(errors, 'node-id-required', node, 'Every node must have an id.')
      continue
    }
    if (ids.has(node.id)) duplicateIds.add(node.id)
    ids.add(node.id)
  }

  for (const id of duplicateIds) {
    errors.push({
      code: 'duplicate-node-id',
      nodeId: id,
      message: `Node id "${id}" is duplicated.`,
      suggestion: 'Duplicate the node again or recreate it so each node has a unique id.',
    })
  }

  for (const edge of edges) {
    if (!ids.has(edge?.source)) {
      addEdgeError(
        errors,
        'edge-source-missing',
        edge,
        edge?.source,
        `Edge "${edge?.id || 'unknown'}" references a missing source node.`,
      )
    }
    if (!ids.has(edge?.target)) {
      addEdgeError(
        errors,
        'edge-target-missing',
        edge,
        edge?.target,
        `Edge "${edge?.id || 'unknown'}" references a missing target node.`,
      )
    }
  }

  if (duplicateIds.size > 0 || errors.some((error) => error.code.includes('edge-'))) return

  const adjacency = new Map(nodes.map((node) => [node.id, []]))
  const inDegree = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    adjacency.get(edge.source).push(edge.target)
    inDegree.set(edge.target, inDegree.get(edge.target) + 1)
  }

  const queue = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()
    visited += 1
    for (const target of adjacency.get(id) || []) {
      inDegree.set(target, inDegree.get(target) - 1)
      if (inDegree.get(target) === 0) queue.push(target)
    }
  }

  if (visited !== nodes.length) {
    errors.push({
      code: 'cycle-detected',
      message: 'Flow contains a cycle. Remove the loop before running.',
      suggestion: 'Break the circular connection or insert a future loop-control node.',
    })
  }
}

function validateAgentNode(node, errors, options) {
  const data = node?.data || {}
  const gateway = clean(data.gateway)

  if (!gateway) {
    addNodeError(
      errors,
      'agent-gateway-required',
      node,
      `${nodeName(node)} must select a gateway before running.`,
    )
    return
  }

  if (gateway === 'openclaw') {
    if (!clean(data.endpoint)) {
      addNodeError(
        errors,
        'openclaw-endpoint-required',
        node,
        `${nodeName(node)} needs an OpenClaw WebSocket endpoint.`,
        'Set an endpoint such as ws://127.0.0.1:18789.',
      )
    }
    if (!clean(data.token)) {
      addNodeError(
        errors,
        'openclaw-token-required',
        node,
        `${nodeName(node)} needs an OpenClaw token.`,
        'Paste the local OpenClaw Gateway token into this agent configuration.',
      )
    }
    return
  }

  if (gateway === 'hermes') {
    if (!clean(data.endpoint) && !clean(options.hermesApiUrl)) {
      addNodeError(
        errors,
        'hermes-endpoint-required',
        node,
        `${nodeName(node)} needs a Hermes API endpoint.`,
        'Set an endpoint such as http://localhost:8642.',
      )
    }
    return
  }

  addNodeError(
    errors,
    'agent-gateway-unsupported',
    node,
    `${nodeName(node)} uses unsupported gateway "${gateway}".`,
  )
}

export function validateFlowConfig(config, options = {}) {
  const nodes = asArray(config?.nodes)
  const edges = asArray(config?.edges)
  const errors = []

  validateGraphShape(nodes, edges, errors)
  for (const node of nodes) {
    if (node?.type === 'agent') validateAgentNode(node, errors, options)
  }

  return { valid: errors.length === 0, errors }
}

export class FlowValidationError extends Error {
  constructor(errors) {
    super(
      errors.length > 0
        ? `Flow validation failed: ${errors[0].message}`
        : 'Flow validation failed.',
    )
    this.name = 'FlowValidationError'
    this.details = errors
  }
}

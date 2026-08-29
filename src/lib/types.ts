export type AppShape = 'crud' | 'content' | 'mixed'
export type Provider = 'aws' | 'cheap'
export type Band = 'hobby' | 'small' | 'medium' | 'large' | 'xlarge'

export type NodeKind =
  | 'client'
  | 'cdn'
  | 'lb'
  | 'app'
  | 'cache'
  | 'queue'
  | 'primary'
  | 'replica'
  | 'object'
  | 'pooler'
  | 'combo'

export interface ArchitectureInput {
  users: number
  readsPerUserDay: number
  writesPerUserDay: number
  instantConsistency: boolean
  appShape: AppShape
  peakFactor: number
  payloadKb: number
  cacheHitRate: number
  rpsPerInstance: number
  bytesPerUser: number
  spare: number
  provider: Provider
}

export type EdgeRole = 'read' | 'write' | 'mixed' | 'async' | 'static' | 'replication'

export interface ArchNode {
  id: string
  kind: NodeKind
  label: string
  detail: string
  count?: number
  ghost?: boolean
  why?: string
  costKey?: string
  appearNote?: string
  utilization?: number
  stack?: boolean
  monthly?: number
}

export interface ArchEdge {
  id: string
  source: string
  target: string
  label: string
  role: EdgeRole
  qps?: number
}

export interface CostItem {
  name: string
  monthly: number
}

export interface CostBreakdown {
  items: CostItem[]
  point: number
  low: number
  high: number
  asOf: string
}

export interface MathLine {
  label: string
  formula: string
  value: string
}

export interface ArchitectureMetrics {
  avgReadQps: number
  avgWriteQps: number
  peakReadQps: number
  peakWriteQps: number
  peakTotalQps: number
  storageGb: number
  appN: number
  replicas: number
  effectiveDbReads: number
  cacheHitUsed: number
}

export interface ArchitectureResult {
  band: Band
  nodes: ArchNode[]
  edges: ArchEdge[]
  cost: CostBreakdown
  explanation: string[]
  math: MathLine[]
  metrics: ArchitectureMetrics
  assumptions: string[]
}

export interface RecipeFlags {
  comboAppDb: boolean
  lb: boolean
  cache: boolean
  cacheCluster: boolean
  cdn: boolean
  queue: boolean
  object: boolean
  pooler: boolean
  allowReplicas: boolean
}

export interface AppSize {
  key: 'small' | 'medium' | 'large'
  vcpu: number
  ramGb: number
  label: string
}

export interface DbSize {
  class: string
  cheapClass: string
  primaryReadBudgetQps: number
  replicaQps: number
  writeBudgetQps: number
}

export interface RedisSize {
  class: string
  cheapClass: string
  clustered: boolean
}

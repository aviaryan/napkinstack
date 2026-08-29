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
  /** Fraction of *read* traffic a CDN absorbs at the edge (0–0.95). Ignored when no CDN. */
  cdnOffload: number
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
  originReadQps: number
  originWriteQps: number
  originTotalQps: number
  storageGb: number
  appN: number
  appCapacityRps: number
  replicas: number
  shards: number
  cacheNodes: number
  effectiveDbReads: number
  cacheHitUsed: number
  cdnOffloadUsed: number
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

export type AppSizeKey = 'small' | 'medium' | 'large' | 'xlarge' | '2xlarge'

export interface AppSize {
  key: AppSizeKey
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
  storageBudgetGb: number
}

export interface DbPlan {
  size: DbSize
  shards: number
  replicas: number
}

export interface RedisSize {
  class: string
  cheapClass: string
  clustered: boolean
  nodes: number
}

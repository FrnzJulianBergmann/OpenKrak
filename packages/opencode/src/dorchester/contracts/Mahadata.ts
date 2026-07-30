// engine/contracts/Mahadata.ts
// Authority: mahadata_schema.md v2.1 — FROZEN (v2.0 + complexity field)
// All types derived from schema. No logic here.

export interface Mahadata {
  meta: Meta;
  repository: Repository;
  project_topology: ProjectTopology;
  dependency_graph: DependencyGraph;
  file_index: FileIndexEntry[];
  hotspots: Hotspot[];
  findings: Finding[];
  correlations: Correlation[];
  blast_radius: BlastRadiusEntry[];
  execution_order: ExecutionOrder;
  execution_brief: ExecutionBrief;
  threat_matrix: ThreatMatrix;
}

// ─── meta ───────────────────────────────────────────────
export interface Meta {
  schema_version: "2.1";
  generated_at: string;       // ISO8601
  generator_version: string;  // semver
  scan_id: string;            // uuid
  scan_duration_ms: number;
  status: "complete" | "partial" | "failed";
  partial_reason: string | null;
}

// ─── repository ─────────────────────────────────────────
export interface Repository {
  name: string;
  path: string;
  remote_url: string | null;
  primary_language: string;
  languages: { name: string; percentage: number }[];
  framework: string | null;
  total_files: number;
  total_loc: number;
  git: {
    current_branch: string | null;
    last_commit_hash: string | null;
    last_commit_at: string | null;
    is_dirty: boolean;
  };
}

// ─── project_topology ───────────────────────────────────
export interface ProjectTopology {
  type: "monolith" | "monorepo" | "microservice" | "library" | "unknown";
  entry_points: {
    path: string;
    type: "main" | "api" | "worker" | "cli" | "test";
  }[];
  layers: { name: string; paths: string[] }[];
  modules: {
    name: string;
    path: string;
    type: "service" | "library" | "utility" | "config" | "test";
    responsibility: string;
  }[];
}

// ─── dependency_graph ───────────────────────────────────
export type NodeKind =
  | "file" | "function" | "class" | "method" | "interface"
  | "type_alias" | "enum" | "variable" | "constant" | "module" | "namespace";

export type EdgeKind =
  | "import" | "call" | "extend" | "implement" | "instantiate"
  | "type_reference" | "re_export" | "dynamic_import" | "re_export_resolved";

export interface DependencyNode {
  id: string; // "<file_path>::<qualified_symbol_name>::<line_start>"
  kind: NodeKind;
  name: string;
  file: string;
  line_start: number;
  line_end: number | null;
  language: string;
  content_hash: string; // sha256
  is_exported: boolean;
  is_entry_point: boolean;
  module: string | null;
}

export interface DependencyEdge {
  id: string; // "<from>::<to>:<kind>"
  from: string;
  to: string;
  kind: EdgeKind;
  file: string;
  line: number | null;
  is_dynamic: boolean;
  is_barrel_import: boolean;
  resolved_via: string | null;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
    max_depth: number;
    cycles_detected: boolean;
    cycle_paths: string[][];
    node_kind_breakdown: Record<string, number>;
    edge_kind_breakdown: Record<string, number>;
  };
}

// ─── file_index ─────────────────────────────────────────
export interface FileIndexEntry {
  path: string;
  language: string;
  loc: number;
  size_bytes: number;
  content_hash: string;
  last_modified: string; // ISO8601
  role: "source" | "test" | "config" | "build" | "docs" | "generated";
  module: string | null;
  is_entry_point: boolean;
  symbol_count: number;
  complexity: {
    cyclomatic: number | null;   // from AST if extractable
    cognitive: number | null;    // from AST if extractable
    loc: number;                 // repeat of loc field for scoring convenience
  };
}

// ─── hotspots ───────────────────────────────────────────
export type HotspotReasonType =
  | "high_coupling" | "high_complexity" | "frequent_change"
  | "deep_inheritance" | "god_object" | "circular_dependency";

export interface Hotspot {
  id: string; // uuid
  path: string;
  score: number; // 0.0–1.0
  risk_level: "critical" | "high" | "medium" | "low";
  reasons: { type: HotspotReasonType; detail: string }[];
  affected_symbols: string[]; // node_id[]
  change_frequency: number;
}

// ─── findings ───────────────────────────────────────────
export type FindingType =
  | "dependency_issue" | "complexity_issue" | "coupling_issue"
  | "missing_symbol" | "circular_dependency" | "dead_code"
  | "security_pattern" | "architecture_violation";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingSource = "deepstrike" | "hotspot_registry" | "blast_radius";

// raw_data per type — §4.7.1
export interface RawDataCircularDependency {
  cycle_path: string[];
  cycle_length: number;
}
export interface RawDataMissingSymbol {
  import_statement: string;
  attempted_resolution: string;
}
export interface RawDataDeadCode {
  incoming_edge_count: 0;
  last_referenced_at: string | null;
}
export interface RawDataDependencyIssue {
  import_path: string;
  resolution_error: string;
}
export interface RawDataSecurityPattern {
  pattern_id: string;
  pattern_name: string;
  matched_text: string;
  cve_reference: string | null;
}
export interface RawDataCouplingIssue {
  fan_in: number;
  fan_out: number;
  coupling_score: number;
  threshold_exceeded: "fan_in" | "fan_out" | "both";
}
export interface RawDataComplexityIssue {
  cyclomatic_complexity: number | null;
  loc: number;
  cognitive_complexity: number | null;
  threshold_exceeded: "cyclomatic" | "loc" | "cognitive" | "multiple";
}
export interface RawDataArchitectureViolation {
  from_layer: string;
  to_layer: string;
  violation_rule: string;
}

export type FindingRawData =
  | RawDataCircularDependency
  | RawDataMissingSymbol
  | RawDataDeadCode
  | RawDataDependencyIssue
  | RawDataSecurityPattern
  | RawDataCouplingIssue
  | RawDataComplexityIssue
  | RawDataArchitectureViolation;

export interface Finding {
  id: string; // uuid
  type: FindingType;
  severity: FindingSeverity;
  file: string;
  line_start: number | null;
  line_end: number | null;
  symbol: string | null; // node_id
  title: string;
  description: string;
  raw_data: FindingRawData;
  source_component: FindingSource;
  is_structural: boolean;
}

// ─── correlations ───────────────────────────────────────
export interface CorrelationImpactStep {
  step: number;
  finding_id: string;
  mechanism: string;
}

export interface Correlation {
  id: string;
  type: "root_cause" | "impact_chain" | "duplicate_finding" | "amplified_risk" | "noise_suppression";
  confidence: number; // 0.0–1.0
  root_finding_id: string;
  related_finding_ids: string[];
  impact_chain: CorrelationImpactStep[];
  consolidated_title: string;
  consolidated_description: string;
  noise_suppressed: boolean;
  noise_reason: string | null;
}

// ─── blast_radius ────────────────────────────────────────
export interface BlastRadiusEntry {
  trigger_file: string;
  trigger_type: "modification" | "deletion" | "interface_change";
  impact: {
    files: { path: string; impact_type: "direct" | "transitive"; depth: number; confidence: number }[];
    modules: { name: string; impact_level: "full" | "partial" | "minimal" }[];
    services: { name: string; impact_level: "full" | "partial" | "minimal" }[];
    apis: { endpoint: string; impact_level: "breaking" | "non_breaking" | "unknown" }[];
  };
  total_affected_files: number;
  total_affected_modules: number;
  risk_score: number;
}

// ─── execution_order ─────────────────────────────────────
export interface ExecutionTask {
  task_id: string;
  order: number;
  action: string;
  target_file: string;
  depends_on_task_ids: string[];
  blocked_by: string | null;
  is_blocked: boolean;
  safety_checks: { check: string; passed: boolean }[];
}

export interface ExecutionOrder {
  is_valid: boolean;
  validation_errors: string[];
  tasks: ExecutionTask[];
}

// ─── execution_brief ─────────────────────────────────────
export interface ExecutionBrief {
  objective: string;
  repository_summary: string;
  critical_context: { key: string; value: string }[];
  priority_hotspots: { path: string; why_relevant: string }[]; // top 5
  key_correlations: { id: string; summary: string }[];         // top 5
  recommended_entry_points: { path: string; symbol: string | null; reason: string }[];
  constraints: string[];
  token_budget_estimate: number;
}

// ─── threat_matrix ───────────────────────────────────────
export type ThreatLevel = "critical" | "high" | "medium" | "low" | "none";

export interface ThreatCategory {
  level: ThreatLevel;
  finding_count: number;
  top_finding_ids: string[];
}

export interface ThreatMatrix {
  overall_risk_score: number;
  risk_summary: string;
  categories: {
    security: ThreatCategory;
    architecture: ThreatCategory;
    reliability: ThreatCategory;
    maintainability: ThreatCategory;
    performance: ThreatCategory;
  };
  blockers: { finding_id: string; reason: string }[];
  warnings: { finding_id: string; reason: string }[];
}

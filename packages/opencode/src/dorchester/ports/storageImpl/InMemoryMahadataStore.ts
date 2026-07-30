// engine/ports/storageImpl/InMemoryMahadataStore.ts
// In-memory implementation of MahadataStore.
// folder_structure.md §6 — ports/ hanya import dari contracts/

import type {
  MahadataStore,
  Meta,
  Repository,
  ProjectTopology,
  DependencyGraph,
  FileIndexEntry,
  Hotspot,
  Finding,
  Correlation,
  BlastRadiusEntry,
  ExecutionOrder,
  ExecutionBrief,
  ThreatMatrix,
} from "../../contracts/index.js";
import { randomUUID } from "crypto";

export class InMemoryMahadataStore implements MahadataStore {
  private meta: Meta = {
    schema_version: "2.1",
    generated_at: "",
    generator_version: "0.1.0",
    scan_id: randomUUID(),
    scan_duration_ms: 0,
    status: "partial",
    partial_reason: "scan in progress",
  };
  private repository: Repository = {} as Repository;
  private projectTopology: ProjectTopology = {} as ProjectTopology;
  private dependencyGraph: DependencyGraph = { nodes: [], edges: [], stats: { total_nodes: 0, total_edges: 0, max_depth: 0, cycles_detected: false, cycle_paths: [], node_kind_breakdown: { file: 0, function: 0, class: 0, method: 0, interface: 0, other: 0 }, edge_kind_breakdown: { import: 0, call: 0, extend: 0, re_export_resolved: 0, other: 0 } } };
  private fileIndex: FileIndexEntry[] = [];
  private hotspots: Hotspot[] = [];
  private findings: Finding[] = [];
  private correlations: Correlation[] = [];
  private blastRadius: BlastRadiusEntry[] = [];
  private executionOrder: ExecutionOrder = { is_valid: false, validation_errors: [], tasks: [] };
  private executionBrief: ExecutionBrief = {} as ExecutionBrief;
  private threatMatrix: ThreatMatrix = {} as ThreatMatrix;

  getMeta() { return this.meta; }
  getRepository() { return this.repository; }
  getProjectTopology() { return this.projectTopology; }
  getDependencyGraph() { return this.dependencyGraph; }
  getFileIndex() { return this.fileIndex; }
  getHotspots() { return this.hotspots; }
  getFindings() { return this.findings; }
  getCorrelations() { return this.correlations; }
  getBlastRadius() { return this.blastRadius; }
  getExecutionOrder() { return this.executionOrder; }
  getExecutionBrief() { return this.executionBrief; }
  getThreatMatrix() { return this.threatMatrix; }

  setRepository(data: Repository) { this.repository = data; }
  setProjectTopology(data: ProjectTopology) { this.projectTopology = data; }
  setDependencyGraph(data: DependencyGraph) { this.dependencyGraph = data; }
  setFileIndex(data: FileIndexEntry[]) { this.fileIndex = data; }
  addFindings(findings: Finding[]) { this.findings.push(...findings); }
  setHotspots(data: Hotspot[]) { this.hotspots = data; }
  setBlastRadius(data: BlastRadiusEntry[]) { this.blastRadius = data; }
  setCorrelations(data: Correlation[]) { this.correlations = data; }
  setExecutionOrder(data: ExecutionOrder) { this.executionOrder = data; }
  setExecutionBrief(data: ExecutionBrief) { this.executionBrief = data; }
  setThreatMatrix(data: ThreatMatrix) { this.threatMatrix = data; }

  finalizeMeta(status: "complete" | "partial", reason?: string) {
    this.meta.status = status;
    this.meta.partial_reason = reason ?? null;
    this.meta.generated_at = new Date().toISOString();
  }

  /** Dump seluruh Mahadata sebagai plain object (untuk scorer Colorado) */
  snapshot(): Record<string, unknown> {
    return {
      meta: this.meta,
      repository: this.repository,
      project_topology: this.projectTopology,
      dependency_graph: this.dependencyGraph,
      file_index: this.fileIndex,
      hotspots: this.hotspots,
      findings: this.findings,
      correlations: this.correlations,
      blast_radius: this.blastRadius,
      execution_order: this.executionOrder,
      execution_brief: this.executionBrief,
      threat_matrix: this.threatMatrix,
    };
  }
}

// engine/ports/storageImpl/memory.ts
// Default MahadataStore implementation — in-memory.
// folder_structure.md v2.0 §6: disk implementation deferred (OQ-G3).

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
    generated_at: new Date().toISOString(),
    generator_version: "0.1.0",
    scan_id: randomUUID(),
    scan_duration_ms: 0,
    status: "partial",
    partial_reason: "scan in progress",
  };
  private repository?: Repository;
  private projectTopology?: ProjectTopology;
  private dependencyGraph?: DependencyGraph;
  private fileIndex: FileIndexEntry[] = [];
  private hotspots: Hotspot[] = [];
  private findings: Finding[] = [];
  private correlations: Correlation[] = [];
  private blastRadius: BlastRadiusEntry[] = [];
  private executionOrder?: ExecutionOrder;
  private executionBrief?: ExecutionBrief;
  private threatMatrix?: ThreatMatrix;

  // ── Reads ──────────────────────────────────────────────
  getMeta(): Meta { return this.meta; }

  getRepository(): Repository {
    if (!this.repository) throw new Error("repository not set");
    return this.repository;
  }
  getProjectTopology(): ProjectTopology {
    if (!this.projectTopology) throw new Error("project_topology not set");
    return this.projectTopology;
  }
  getDependencyGraph(): DependencyGraph {
    if (!this.dependencyGraph) throw new Error("dependency_graph not set");
    return this.dependencyGraph;
  }
  getFileIndex(): FileIndexEntry[] { return this.fileIndex; }
  getHotspots(): Hotspot[] { return this.hotspots; }
  getFindings(): Finding[] { return this.findings; }
  getCorrelations(): Correlation[] { return this.correlations; }
  getBlastRadius(): BlastRadiusEntry[] { return this.blastRadius; }

  getExecutionOrder(): ExecutionOrder {
    if (!this.executionOrder) throw new Error("execution_order not set");
    return this.executionOrder;
  }
  getExecutionBrief(): ExecutionBrief {
    if (!this.executionBrief) throw new Error("execution_brief not set");
    return this.executionBrief;
  }
  getThreatMatrix(): ThreatMatrix {
    if (!this.threatMatrix) throw new Error("threat_matrix not set");
    return this.threatMatrix;
  }

  // ── Writes ─────────────────────────────────────────────
  setRepository(data: Repository): void { this.repository = data; }
  setProjectTopology(data: ProjectTopology): void { this.projectTopology = data; }
  setDependencyGraph(data: DependencyGraph): void { this.dependencyGraph = data; }
  setFileIndex(data: FileIndexEntry[]): void { this.fileIndex = data; }
  addFindings(findings: Finding[]): void { this.findings.push(...findings); }
  setHotspots(data: Hotspot[]): void { this.hotspots = data; }
  setBlastRadius(data: BlastRadiusEntry[]): void { this.blastRadius = data; }
  setCorrelations(data: Correlation[]): void { this.correlations = data; }
  setExecutionOrder(data: ExecutionOrder): void { this.executionOrder = data; }
  setExecutionBrief(data: ExecutionBrief): void { this.executionBrief = data; }
  setThreatMatrix(data: ThreatMatrix): void { this.threatMatrix = data; }

  finalizeMeta(status: "complete" | "partial", reason?: string): void {
    this.meta.status = status;
    this.meta.partial_reason = reason ?? null;
    this.meta.generated_at = new Date().toISOString();
  }
}

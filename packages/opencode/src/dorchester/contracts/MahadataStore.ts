// engine/contracts/MahadataStore.ts
// Authority: mahadata_schema.md v2.0, folder_structure.md v2.0
// Interface resmi untuk akses Mahadata antar komponen.
// Tidak ada komponen yang boleh komunikasi langsung — semua via store ini.

import type {
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
} from "./Mahadata.js";

export interface MahadataStore {
  // ── Reads ──────────────────────────────────────────────
  getMeta(): Meta;
  getRepository(): Repository;
  getProjectTopology(): ProjectTopology;
  getDependencyGraph(): DependencyGraph;
  getFileIndex(): FileIndexEntry[];
  getHotspots(): Hotspot[];
  getFindings(): Finding[];
  getCorrelations(): Correlation[];
  getBlastRadius(): BlastRadiusEntry[];
  getExecutionOrder(): ExecutionOrder;
  getExecutionBrief(): ExecutionBrief;
  getThreatMatrix(): ThreatMatrix;

  // ── Writes — setiap field hanya boleh ditulis oleh owner-nya ──
  // DeepStrike
  setRepository(data: Repository): void;
  setProjectTopology(data: ProjectTopology): void;
  setDependencyGraph(data: DependencyGraph): void;
  setFileIndex(data: FileIndexEntry[]): void;
  addFindings(findings: Finding[]): void;      // append — multi-owner

  // Hotspot Registry
  setHotspots(data: Hotspot[]): void;

  // Blast Radius Engine
  setBlastRadius(data: BlastRadiusEntry[]): void;

  // Correlation Engine
  setCorrelations(data: Correlation[]): void;

  // Execution Gate
  setExecutionOrder(data: ExecutionOrder): void;

  // Mahadata Generator
  setExecutionBrief(data: ExecutionBrief): void;
  setThreatMatrix(data: ThreatMatrix): void;
  finalizeMeta(status: "complete" | "partial", reason?: string): void;
}

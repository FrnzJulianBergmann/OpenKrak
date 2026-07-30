// engine/action_layer/effectors/fileEffector.ts
// action_layer.md §3.1

import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafePath } from "../safetyChecker.js";
import { FileEffectorError } from "../types.js";
import type { Effector, ExecutionContext, ValidationResult } from "../types.js";
import type { FileWriteParams, FileDeleteParams, FileRenameParams } from "../../action_contracts/index.js";

export class FileWriteEffector implements Effector<FileWriteParams, { path: string; bytes_written: number; previous_existed: boolean }> {
  readonly type = "file_write" as const;

  validate(params: FileWriteParams): ValidationResult {
    const errors: string[] = [];
    if (!params.path) errors.push("path is required");
    if (params.content === undefined) errors.push("content is required");
    return { valid: errors.length === 0, errors };
  }

  async execute(params: FileWriteParams, ctx: ExecutionContext) {
    const absPath = resolveSafePath(params.path, ctx.repo_root);
    let previousExisted = false;
    try {
      const prev = await fs.readFile(absPath, "utf-8");
      ctx.setBackup(params.path, prev);
      previousExisted = true;
    } catch {
      ctx.setBackup(params.path, null);
    }

    if (!previousExisted && !params.create_dirs) {
      const parent = path.dirname(absPath);
      try {
        await fs.access(parent);
      } catch {
        throw new FileEffectorError(`Parent directory does not exist and create_dirs is false: ${parent}`);
      }
    }

    if (params.create_dirs) {
      await fs.mkdir(path.dirname(absPath), { recursive: true });
    }
    await fs.writeFile(absPath, params.content, params.encoding ?? "utf-8");
    return { path: params.path, bytes_written: Buffer.byteLength(params.content), previous_existed: previousExisted };
  }

  async rollback(params: FileWriteParams, ctx: ExecutionContext): Promise<void> {
    const absPath = resolveSafePath(params.path, ctx.repo_root);
    const backup = ctx.getBackup(params.path);
    if (backup === null) {
      await fs.unlink(absPath).catch(() => undefined);
    } else {
      await fs.writeFile(absPath, backup, "utf-8");
    }
  }
}

export class FileDeleteEffector implements Effector<FileDeleteParams, { path: string; deleted: boolean }> {
  readonly type = "file_delete" as const;

  validate(params: FileDeleteParams): ValidationResult {
    return { valid: !!params.path, errors: params.path ? [] : ["path is required"] };
  }

  async execute(params: FileDeleteParams, ctx: ExecutionContext) {
    const absPath = resolveSafePath(params.path, ctx.repo_root);
    const stat = await fs.stat(absPath).catch(() => null);

    if (!stat) {
      if (params.require_exists === false) return { path: params.path, deleted: false };
      throw new FileEffectorError(`File does not exist: ${params.path}`);
    }
    if (stat.isDirectory()) {
      throw new FileEffectorError(`file_delete cannot target a directory: ${params.path}`);
    }

    const content = await fs.readFile(absPath, "utf-8");
    ctx.setBackup(params.path, content);
    await fs.unlink(absPath);
    return { path: params.path, deleted: true };
  }

  async rollback(params: FileDeleteParams, ctx: ExecutionContext): Promise<void> {
    const backup = ctx.getBackup(params.path);
    if (backup === null) return;
    const absPath = resolveSafePath(params.path, ctx.repo_root);
    await fs.writeFile(absPath, backup, "utf-8");
  }
}

export class FileRenameEffector implements Effector<FileRenameParams, { from: string; to: string }> {
  readonly type = "file_rename" as const;

  validate(params: FileRenameParams): ValidationResult {
    const errors: string[] = [];
    if (!params.from) errors.push("from is required");
    if (!params.to) errors.push("to is required");
    return { valid: errors.length === 0, errors };
  }

  async execute(params: FileRenameParams, ctx: ExecutionContext) {
    const absFrom = resolveSafePath(params.from, ctx.repo_root);
    const absTo = resolveSafePath(params.to, ctx.repo_root);

    const fromExists = await fs.access(absFrom).then(() => true).catch(() => false);
    if (!fromExists) throw new FileEffectorError(`Source file does not exist: ${params.from}`);

    const toExists = await fs.access(absTo).then(() => true).catch(() => false);
    if (toExists && !params.overwrite) {
      throw new FileEffectorError(`Target already exists and overwrite is false: ${params.to}`);
    }

    await fs.rename(absFrom, absTo);
    return { from: params.from, to: params.to };
  }

  async rollback(params: FileRenameParams, ctx: ExecutionContext): Promise<void> {
    const absFrom = resolveSafePath(params.from, ctx.repo_root);
    const absTo = resolveSafePath(params.to, ctx.repo_root);
    await fs.rename(absTo, absFrom).catch(() => undefined);
  }
}

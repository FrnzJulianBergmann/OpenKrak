// engine/action_layer/effectors/gitEffector.ts
// action_layer.md §3.2 — simple-git (ADR-009)

import { simpleGit, type SimpleGit } from "simple-git";
import { GitEffectorError } from "../types.js";
import type { Effector, ExecutionContext, ValidationResult } from "../types.js";
import type { GitCommitParams, GitBranchParams, GitPushParams } from "../../action_contracts/index.js";

function git(ctx: ExecutionContext): SimpleGit {
  return simpleGit(ctx.repo_root);
}

export class GitCommitEffector implements Effector<GitCommitParams, { commit_hash: string }> {
  readonly type = "git_commit" as const;

  validate(params: GitCommitParams): ValidationResult {
    return { valid: !!params.message, errors: params.message ? [] : ["message is required"] };
  }

  async execute(params: GitCommitParams, ctx: ExecutionContext) {
    const g = git(ctx);
    const status = await g.status();
    if (status.conflicted.length > 0) {
      throw new GitEffectorError("Repository has unresolved merge conflicts");
    }

    if (params.files.length > 0) {
      await g.add(params.files);
    } else {
      await g.add(["-A"]);
    }

    const commitOpts: Record<string, string> = {};
    if (params.author) commitOpts["--author"] = params.author;

    const result = await g.commit(params.message, undefined, {
      ...(params.allow_empty ? { "--allow-empty": null } : {}),
      ...commitOpts,
    } as Record<string, string | null>);

    return { commit_hash: result.commit };
  }

  async rollback(_params: GitCommitParams, ctx: ExecutionContext): Promise<void> {
    await git(ctx).reset(["--soft", "HEAD~1"]);
  }
}

export class GitBranchEffector implements Effector<GitBranchParams, { name: string }> {
  readonly type = "git_branch" as const;
  private previousBranch: string | null = null;

  validate(params: GitBranchParams): ValidationResult {
    const errors: string[] = [];
    if (!params.name || /\s/.test(params.name) || params.name.startsWith("-")) {
      errors.push("invalid branch name");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(params: GitBranchParams, ctx: ExecutionContext) {
    const g = git(ctx);
    const branches = await g.branchLocal();
    if (branches.all.includes(params.name)) {
      throw new GitEffectorError(`Branch already exists: ${params.name}`);
    }
    this.previousBranch = branches.current;

    await g.branch([params.name, params.from ?? "HEAD"]);
    if (params.checkout ?? true) {
      await g.checkout(params.name);
    }
    return { name: params.name };
  }

  async rollback(params: GitBranchParams, ctx: ExecutionContext): Promise<void> {
    const g = git(ctx);
    if (this.previousBranch) await g.checkout(this.previousBranch).catch(() => undefined);
    await g.branch(["-D", params.name]).catch(() => undefined);
  }
}

export class GitPushEffector implements Effector<GitPushParams, { remote: string; branch: string }> {
  readonly type = "git_push" as const;

  validate(params: GitPushParams): ValidationResult {
    const errors: string[] = [];
    if (params.force && !params.force_confirmation) {
      errors.push("force push requires force_confirmation: true");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(params: GitPushParams, ctx: ExecutionContext) {
    const g = git(ctx);
    const remote = params.remote ?? "origin";
    const branch = params.branch ?? (await g.status()).current ?? "HEAD";

    const args = [remote, branch];
    if (params.force) args.push("--force");
    if (params.set_upstream ?? true) args.push("--set-upstream");

    await g.push(args);
    return { remote, branch };
  }

  // ⚠️ git_push tidak memiliki rollback deterministik — action_layer.md §3.2.3
  async rollback(params: GitPushParams, ctx: ExecutionContext): Promise<void> {
    ctx.logger.warn(
      { event: "rollback.not_possible", action_type: this.type, remote: params.remote, branch: params.branch },
      "ROLLBACK WARNING: git_push ke remote sudah berhasil dan tidak dapat di-undo secara otomatis. Manual intervention diperlukan.",
    );
  }
}

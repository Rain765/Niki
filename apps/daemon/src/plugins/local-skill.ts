// Plugin-local SKILL.md loader (Stage A of plugin-driven-flow-plan).
//
// Plugins that declare `od.context.skills[{ path: './SKILL.md' }]` ship
// their own skill body inside their plugin folder. Those files never
// register against the global skills registry, so the
// `composeSystemPrompt` skill slot would otherwise be empty.
//
// This module is the lone reader of plugin-local SKILL.md files. It
// stays separate from `apply.ts` because apply.ts is intentionally pure
// (no filesystem reads) — the daemon calls this loader during prompt
// composition, not during snapshot apply.
//
// The returned record mirrors the shape `composeDaemonSystemPrompt`
// already consumes for global skills (`body`, `name`, `dir`) so it can
// occupy the active slot for plugin-only runs or a separate scenario
// slot when a functional skill was explicitly selected.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { pickFirstLocalSkillPath } from './apply.js';

export interface PluginLocalSkill {
  body: string;
  name: string;
  // Absolute directory containing the SKILL.md — used by
  // `stageActiveSkill` to copy companion files into the project cwd.
  dir: string;
  // Relative path inside the plugin folder, kept for debugging /
  // logging. Always normalised (no leading './').
  relpath: string;
}

export interface PromptSkillSource {
  body: string;
  name: string;
  dir: string;
}

export interface LayeredPromptSkills {
  active: PromptSkillSource | null;
  scenario: PromptSkillSource | null;
  dirs: string[];
}

/**
 * Keep an explicitly selected functional skill authoritative while still
 * exposing a plugin-local skill as scenario orchestration. Plugin-only runs
 * retain the legacy behavior where the local skill occupies the active slot.
 */
export function layerPluginLocalSkill(
  active: PromptSkillSource | null,
  local: PluginLocalSkill | null,
): LayeredPromptSkills {
  if (!local) {
    return {
      active,
      scenario: null,
      dirs: active ? [active.dir] : [],
    };
  }

  if (!active) {
    return {
      active: local,
      scenario: null,
      dirs: [local.dir],
    };
  }

  return {
    active,
    scenario: local,
    dirs: Array.from(new Set([active.dir, local.dir])),
  };
}

export async function loadPluginLocalSkill(
  plugin: InstalledPluginRecord,
): Promise<PluginLocalSkill | null> {
  const manifest = plugin.manifest;
  const relpath = pickFirstLocalSkillPath(manifest);
  if (!relpath) return null;
  const safeRel = stripLeadingDotSlash(relpath);
  // Guard against path traversal — the manifest is trusted but we still
  // refuse `..` escapes so a bad plugin author can't reach outside its
  // own fsPath.
  if (safeRel.split('/').some((segment) => segment === '..')) return null;
  const abs = path.join(plugin.fsPath, safeRel);
  let raw: string;
  try {
    raw = await fsp.readFile(abs, 'utf8');
  } catch {
    return null;
  }
  const body = stripFrontmatter(raw).trim();
  if (!body) return null;
  const name = (manifest.title ?? manifest.name ?? plugin.id).toString();
  return {
    body,
    name,
    dir: path.dirname(abs),
    relpath: safeRel,
  };
}

function stripLeadingDotSlash(value: string): string {
  return value.startsWith('./') ? value.slice(2) : value;
}

// Mirrors the loader inside `atom-bodies.ts`. Kept duplicated here on
// purpose: atom-bodies is the lone reader for atom SKILL.md, and we do
// not want to grow a cross-file import surface for one regex.
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const closeIdx = raw.indexOf('\n---', 3);
  if (closeIdx === -1) return raw;
  const after = raw.slice(closeIdx + 4);
  return after.replace(/^\r?\n/, '');
}

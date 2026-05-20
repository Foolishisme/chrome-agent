import type { RoundDecisionResult } from "../llm/llm-client";
import type {
  CommerceTaskSpec,
  PublicResearchTaskSpec,
  SiteOverviewTaskSpec,
} from "../../shared/agent-domain-model";
import { dedupeStrings } from "../tools/data-mappers";

function clampPositiveInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value) || !value) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function appendTaskNotes(notes: string[], notesAppend?: string[]) {
  return dedupeStrings([...notes, ...(notesAppend ?? [])]);
}

export function applyPublicResearchPatch(taskSpec: PublicResearchTaskSpec, decision: RoundDecisionResult): PublicResearchTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  return {
    ...taskSpec,
    searchQuery: patch.searchQuery?.trim() || taskSpec.searchQuery,
    candidateLimit: clampPositiveInt(patch.candidateLimit, taskSpec.candidateLimit, 1, 10),
    sourceTargetCount: clampPositiveInt(patch.sourceTargetCount, taskSpec.sourceTargetCount, 1, 5),
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };
}

export function applySiteOverviewPatch(taskSpec: SiteOverviewTaskSpec, decision: RoundDecisionResult): SiteOverviewTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  const entryUrl = patch.entryUrl ?? taskSpec.entryUrl;
  const nextTaskSpec: SiteOverviewTaskSpec = {
    ...taskSpec,
    entryUrl,
    candidateLimit: clampPositiveInt(patch.candidateLimit, taskSpec.candidateLimit, 1, 10),
    sourceTargetCount: clampPositiveInt(patch.sourceTargetCount, taskSpec.sourceTargetCount, 1, 5),
    pageReadLimit: clampPositiveInt(patch.pageReadLimit, taskSpec.pageReadLimit, 1, 8),
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };

  if (patch.officialSearchQuery?.trim()) {
    nextTaskSpec.officialSearchQuery = patch.officialSearchQuery.trim();
  }

  if (entryUrl) {
    nextTaskSpec.entryMode = "explicit_url";
    try {
      nextTaskSpec.targetDomain = new URL(entryUrl).hostname.replace(/^www\./, "");
    } catch {
      nextTaskSpec.targetDomain = taskSpec.targetDomain;
    }
  }

  return nextTaskSpec;
}

export function applyCommercePatch(taskSpec: CommerceTaskSpec, decision: RoundDecisionResult): CommerceTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  return {
    ...taskSpec,
    searchQuery: patch.searchQuery?.trim() || taskSpec.searchQuery,
    topK: clampPositiveInt(patch.topK, taskSpec.topK, 1, 8),
    llmInputLimit: clampPositiveInt(patch.llmInputLimit, taskSpec.llmInputLimit, 1, 10),
    extractLimit: clampPositiveInt(patch.extractLimit, taskSpec.extractLimit, 1, 20),
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };
}

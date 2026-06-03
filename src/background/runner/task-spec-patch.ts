import type { RoundDecisionResult } from "../llm/llm-client";
import type {
  CommerceTaskSpec,
  PublicResearchTaskSpec,
  SiteOverviewTaskSpec,
} from "../../shared/agent-domain-model";
import { dedupeStrings } from "../tools/data-mappers";

function appendTaskNotes(notes: string[], notesAppend?: string[]) {
  return dedupeStrings([...notes, ...(notesAppend ?? [])]);
}

export function applyPublicResearchPatch(taskSpec: PublicResearchTaskSpec, decision: RoundDecisionResult): PublicResearchTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  return {
    ...taskSpec,
    searchQuery: patch.searchQuery?.trim() || taskSpec.searchQuery,
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };
}

export function applySiteOverviewPatch(taskSpec: SiteOverviewTaskSpec, decision: RoundDecisionResult): SiteOverviewTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  const nextTaskSpec: SiteOverviewTaskSpec = {
    ...taskSpec,
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };

  if (patch.officialSearchQuery?.trim()) {
    nextTaskSpec.officialSearchQuery = patch.officialSearchQuery.trim();
  }

  return nextTaskSpec;
}

export function applyCommercePatch(taskSpec: CommerceTaskSpec, decision: RoundDecisionResult): CommerceTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  return {
    ...taskSpec,
    searchQuery: patch.searchQuery?.trim() || taskSpec.searchQuery,
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };
}

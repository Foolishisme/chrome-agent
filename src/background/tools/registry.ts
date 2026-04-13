import type { ToolName } from "../../shared/types";
import { collectCommerceCandidatesTool } from "./collect-commerce-candidates";
import { collectResearchCandidatesTool } from "./collect-research-candidates";
import { compileTaskSpecTool } from "./compile-task-spec";
import { finalizeCommerceResultTool } from "./finalize-commerce-result";
import { finalizeDirectAnswerTool } from "./finalize-direct-answer";
import { finalizeResearchResultTool } from "./finalize-research-result";
import { openSearchResultsTool } from "./open-search-results";
import { readResearchSourceFactsTool } from "./read-research-source-facts";
import { resolveEntryPointTool } from "./resolve-entry-point";
import type { AgentToolDefinition } from "./shared";

const TOOL_REGISTRY: Record<ToolName, AgentToolDefinition> = {
  compileTaskSpec: compileTaskSpecTool,
  finalizeDirectAnswer: finalizeDirectAnswerTool,
  resolveEntryPoint: resolveEntryPointTool,
  openSearchResults: openSearchResultsTool,
  collectCommerceCandidates: collectCommerceCandidatesTool,
  collectResearchCandidates: collectResearchCandidatesTool,
  readResearchSourceFacts: readResearchSourceFactsTool,
  finalizeCommerceResult: finalizeCommerceResultTool,
  finalizeResearchResult: finalizeResearchResultTool,
};

export function getToolDefinition(toolName: ToolName) {
  return TOOL_REGISTRY[toolName];
}

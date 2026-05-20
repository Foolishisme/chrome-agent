import type { SearchTaskSpec } from "../../../shared/agent-domain-model";
import type { CommerceResearchToolOutput } from "../first-party-tool-contracts";
import type { ToolExecutionContext } from "../tool-execution-context";
import { toCommerceEvidence, toCommerceShortlist } from "../data-mappers";
import { prepareCommerceCandidates } from "../adapters/prepare-task-candidates";
import { openCommerceSearchResults } from "./open-commerce-search-results";

export async function runCommerceResearchDelegate(
  context: ToolExecutionContext,
  taskSpec: SearchTaskSpec | undefined,
): Promise<CommerceResearchToolOutput> {
  const openResult = await openCommerceSearchResults(context);
  if (openResult.stepStatus !== "succeeded") {
    const openStatus: CommerceResearchToolOutput["status"] =
      openResult.stepStatus === "blocked"
        ? "blocked"
        : openResult.status === "partial"
          ? "partial"
          : "failed";
    return {
      status: openStatus,
      shortlist: [],
      evidence: [],
      gaps: [openResult.summary],
      coverage: {
        scope: "Commerce helper path inside runtime tool loop.",
        limitations: ["Search preparation failed before candidate extraction."],
      },
      problems: [
        {
          code: openResult.errorCode ?? "COMMERCE_SEARCH_PREP_FAILED",
          message: openResult.summary,
        },
      ],
    };
  }

  if (!taskSpec || taskSpec.taskType !== "commerce_search") {
    throw new Error("Commerce candidate preparation requires a commerce task spec.");
  }

  const collectResult = await prepareCommerceCandidates(context, taskSpec);
  const shortlist = toCommerceShortlist(context.memory);
  const evidence = toCommerceEvidence(context.memory);
  const gaps = shortlist.length > 0 ? [] : [collectResult.summary];
  const collectStatus: CommerceResearchToolOutput["status"] =
    collectResult.status === "success"
      ? "success"
      : collectResult.status === "partial"
        ? "partial"
        : "failed";

  return {
    status: collectStatus,
    shortlist,
    evidence,
    gaps,
    coverage: {
      scope: "Runtime commerce research path.",
      limitations: shortlist.length > 0 ? [] : ["No shortlisted items were preserved after candidate preparation."],
    },
    problems:
      shortlist.length > 0
        ? []
        : [
            {
              code: collectResult.errorCode ?? "NO_COMMERCE_SHORTLIST",
              message: collectResult.summary,
            },
          ],
  };
}

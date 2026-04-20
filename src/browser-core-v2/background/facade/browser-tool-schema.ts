import { z } from "zod";

export const BROWSER_CORE_V2_ACTIONS = ["open", "navigate", "observe", "read", "extractLinksAndControls", "finalize"] as const;

export const BrowserCoreV2ToolInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    url: z.string().url(),
    active: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("navigate"),
    tabId: z.number().int().nonnegative(),
    url: z.string().url(),
    active: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("observe"),
    tabId: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("read"),
    tabId: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("extractLinksAndControls"),
    tabId: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("finalize"),
    summary: z.string().min(1),
    status: z.enum(["success", "partial", "failed", "blocked"]),
  }),
]);

export type BrowserCoreV2ToolInput = z.infer<typeof BrowserCoreV2ToolInputSchema>;

export function parseBrowserCoreV2ToolInput(input: unknown) {
  return BrowserCoreV2ToolInputSchema.parse(input);
}

import type { BrowserRiskLevel, BrowserTargetRef } from "../../../shared/browser-capability";

const HIGH_RISK_TEXT = /(buy|purchase|checkout|pay|delete|remove|send|submit|confirm|order|支付|付款|下单|删除|发送|提交|确认)/i;

export function classifyBrowserCoreActionRisk(input: { target?: BrowserTargetRef; text?: string; submit?: boolean }): BrowserRiskLevel {
  const combined = [input.target?.name, input.target?.text, input.text].filter(Boolean).join(" ");

  if (input.submit || HIGH_RISK_TEXT.test(combined)) {
    return "medium_risk_submit";
  }

  if (input.text) {
    return "low_risk_write";
  }

  return "read_only";
}

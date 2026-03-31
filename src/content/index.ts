import type {
  ExecuteActionMessage,
  ExecuteActionResponse,
  RequestSnapshotMessage,
  SnapshotResponse,
} from "../shared/protocol";
import { executeAction } from "./actions";
import { scanPage } from "./scanner";

chrome.runtime.onMessage.addListener((message: RequestSnapshotMessage | ExecuteActionMessage, _sender, sendResponse) => {
  if (message.type === "REQUEST_SNAPSHOT") {
    const response: SnapshotResponse = {
      ok: true,
      snapshot: scanPage(),
    };
    sendResponse(response);
    return false;
  }

  if (message.type === "EXECUTE_ACTION") {
    void executeAction(message.action)
      .then((result) => {
        const response: ExecuteActionResponse = {
          ok: true,
          result,
        };
        sendResponse(response);
      })
      .catch((error) => {
        const response: ExecuteActionResponse = {
          ok: false,
          error: error instanceof Error ? error.message : "动作执行失败",
        };
        sendResponse(response);
      });
    return true;
  }

  return false;
});

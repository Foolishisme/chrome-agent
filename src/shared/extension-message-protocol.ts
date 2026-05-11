import type {
  ActionResult,
  AgentAction,
  DebugLogEntry,
  LlmProfile,
  SearchPreference,
  SessionDebugBundle,
  SessionPublicState,
  SnapshotData,
} from "./agent-domain-model";

export type StartSessionMessage = {
  type: "START_SESSION";
  goal: string;
  searchPreference?: SearchPreference;
  llmProfile?: LlmProfile;
};

export type StopSessionMessage = {
  type: "STOP_SESSION";
};

export type RequestSessionStateMessage = {
  type: "REQUEST_SESSION_STATE";
};

export type DeleteSessionArchiveMessage = {
  type: "DELETE_SESSION_ARCHIVE";
  sessionId: string;
};

export type CreateConversationMessage = {
  type: "CREATE_CONVERSATION";
};

export type SelectConversationMessage = {
  type: "SELECT_CONVERSATION";
  conversationId: string;
};

export type DeleteConversationMessage = {
  type: "DELETE_CONVERSATION";
  conversationId: string;
};

export type RollbackConversationTurnMessage = {
  type: "ROLLBACK_CONVERSATION_TURN";
  conversationId: string;
  turnId: number;
};

export type RequestSessionRunLogMessage = {
  type: "REQUEST_SESSION_RUN_LOG";
  sessionId?: string;
};

export type ExportSessionDebugBundleMessage = {
  type: "EXPORT_SESSION_DEBUG_BUNDLE";
  sessionId?: string;
};

export type DeleteSessionRunLogMessage = {
  type: "DELETE_SESSION_RUN_LOG";
  sessionId: string;
};

export type RequestSnapshotMessage = {
  type: "REQUEST_SNAPSHOT";
};

export type ExecuteActionMessage = {
  type: "EXECUTE_ACTION";
  action: AgentAction;
};

export type SessionUpdateMessage = {
  type: "SESSION_UPDATE";
  payload: SessionPublicState;
};

export type SessionErrorMessage = {
  type: "SESSION_ERROR";
  payload: SessionPublicState;
};

export type RuntimeMessage =
  | StartSessionMessage
  | StopSessionMessage
  | RequestSessionStateMessage
  | DeleteSessionArchiveMessage
  | CreateConversationMessage
  | SelectConversationMessage
  | DeleteConversationMessage
  | RollbackConversationTurnMessage
  | RequestSessionRunLogMessage
  | ExportSessionDebugBundleMessage
  | DeleteSessionRunLogMessage
  | RequestSnapshotMessage
  | ExecuteActionMessage
  | SessionUpdateMessage
  | SessionErrorMessage;

export interface StartSessionResponse {
  ok: boolean;
  error?: string;
  payload?: SessionPublicState;
}

export interface SessionStateResponse {
  ok: boolean;
  error?: string;
  payload?: SessionPublicState;
}

export interface SnapshotResponse {
  ok: boolean;
  snapshot?: SnapshotData;
  error?: string;
}

export interface ExecuteActionResponse {
  ok: boolean;
  result?: ActionResult;
  error?: string;
}

export interface SessionRunLogResponse {
  ok: boolean;
  sessionId?: string;
  logs?: DebugLogEntry[];
  error?: string;
}

export interface SessionDebugBundleResponse {
  ok: boolean;
  bundle?: SessionDebugBundle;
  error?: string;
}

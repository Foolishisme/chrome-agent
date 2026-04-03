import type { ActionResult, AgentAction, SessionPublicState, SnapshotData } from "./types";

export type StartSessionMessage = {
  type: "START_SESSION";
  goal: string;
};

export type StopSessionMessage = {
  type: "STOP_SESSION";
};

export type RequestSessionStateMessage = {
  type: "REQUEST_SESSION_STATE";
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
  | RequestSnapshotMessage
  | ExecuteActionMessage
  | SessionUpdateMessage
  | SessionErrorMessage;

export interface StartSessionResponse {
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

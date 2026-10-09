// Messages exchanged between the API (hub) and the agent running on each house server.
// Every message is validated on arrival: neither side trusts the other's JSON blindly.
import { z } from "zod";

// Room names become DNS labels and Docker names, so keep them boring.
export const RoomName = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,30}$/, "lowercase letters, digits and dashes, 2-31 chars");

export const RoomLimits = z.object({
  memoryMb: z.number().int().min(64).max(65536),
  cpus: z.number().min(0.1).max(64),
});
export type RoomLimits = z.infer<typeof RoomLimits>;

export const DeployKind = z.enum(["prod", "preview"]);
export type DeployKind = z.infer<typeof DeployKind>;

// ---- API → agent ----

export const DeployCommand = z.object({
  type: z.literal("deploy"),
  deployId: z.string().min(1),
  room: RoomName,
  kind: DeployKind,
  // Any URL git can clone. For private GitHub repos the API embeds a short-lived token.
  repo: z.string().min(1),
  ref: z.string().min(1).default("main"),
  // Sub-folder holding the Dockerfile, for monorepos.
  path: z.string().default("."),
  // Port the app listens on inside its container. Falls back to the image's EXPOSE, then 3000.
  port: z.number().int().min(1).max(65535).optional(),
  limits: RoomLimits,
  env: z.record(z.string()).default({}),
});
export type DeployCommand = z.infer<typeof DeployCommand>;

export const RemoveRoomCommand = z.object({
  type: z.literal("remove_room"),
  room: RoomName,
});
export type RemoveRoomCommand = z.infer<typeof RemoveRoomCommand>;

// Restarts what runs in a room, as is (no rebuild).
export const RestartRoomCommand = z.object({
  type: z.literal("restart_room"),
  room: RoomName,
});
export type RestartRoomCommand = z.infer<typeof RestartRoomCommand>;

// Removes a room's preview (the pull request closed). The room itself keeps running.
export const RemovePreviewCommand = z.object({
  type: z.literal("remove_preview"),
  room: RoomName,
});
export type RemovePreviewCommand = z.infer<typeof RemovePreviewCommand>;

// Asks for the last lines a room's app printed. The agent answers with a `logs` message carrying the same requestId.
export const GetLogsCommand = z.object({
  type: z.literal("get_logs"),
  requestId: z.string().min(1).max(64),
  room: RoomName,
  kind: DeployKind.default("prod"),
  lines: z.number().int().min(1).max(1000).default(200),
});
export type GetLogsCommand = z.infer<typeof GetLogsCommand>;

export const ApiToAgent = z.discriminatedUnion("type", [DeployCommand, RemoveRoomCommand, RestartRoomCommand, RemovePreviewCommand, GetLogsCommand]);
export type ApiToAgent = z.infer<typeof ApiToAgent>;

// ---- agent → API ----

export const Hello = z.object({
  type: z.literal("hello"),
  houseId: z.string().min(1),
  secret: z.string().min(1),
  agentVersion: z.string(),
});
export type Hello = z.infer<typeof Hello>;

export const DeployStatus = z.object({
  type: z.literal("deploy_status"),
  deployId: z.string(),
  room: RoomName,
  status: z.enum(["cloning", "building", "starting", "live", "failed"]),
  detail: z.string().optional(),
  url: z.string().optional(),
});
export type DeployStatus = z.infer<typeof DeployStatus>;

export const UsageSample = z.object({
  room: RoomName,
  cpuPercent: z.number(),
  memoryBytes: z.number(),
  memoryLimitBytes: z.number(),
});
export type UsageSample = z.infer<typeof UsageSample>;

export const Usage = z.object({
  type: z.literal("usage"),
  at: z.string(),
  samples: z.array(UsageSample),
});
export type Usage = z.infer<typeof Usage>;

// Things that happen to a room on their own: the material for fridge notes.
export const RoomEvent = z.object({
  type: z.literal("room_event"),
  room: RoomName,
  event: z.enum(["oom", "crashed", "restarted"]),
  at: z.string(),
});
export type RoomEvent = z.infer<typeof RoomEvent>;

// Sent on every (re)connect: what's actually running, so the API can rebuild its picture
// after a restart instead of trusting stale state.
export const RoomsSnapshot = z.object({
  type: z.literal("rooms_snapshot"),
  rooms: z.array(
    z.object({
      room: RoomName,
      kind: DeployKind,
      state: z.enum(["running", "restarting", "stopped"]),
      url: z.string(),
    }),
  ),
});
export type RoomsSnapshot = z.infer<typeof RoomsSnapshot>;

export const Logs = z.object({
  type: z.literal("logs"),
  requestId: z.string(),
  room: RoomName,
  // Plain text, oldest line first. Capped so a chatty app can't flood the line.
  text: z.string().max(256_000),
  error: z.string().optional(),
});
export type Logs = z.infer<typeof Logs>;

export const AgentToApi = z.discriminatedUnion("type", [Hello, DeployStatus, Usage, RoomEvent, RoomsSnapshot, Logs]);
export type AgentToApi = z.infer<typeof AgentToApi>;

export function parseApiToAgent(raw: string): ApiToAgent {
  return ApiToAgent.parse(JSON.parse(raw));
}

export function parseAgentToApi(raw: string): AgentToApi {
  return AgentToApi.parse(JSON.parse(raw));
}

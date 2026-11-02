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
  // No ref: the repo's default branch.
  ref: z.string().min(1).optional(),
  // Sub-folder holding the Dockerfile, for monorepos.
  path: z.string().default("."),
  // Port the app listens on inside its container. Falls back to the image's EXPOSE, then 3000.
  port: z.number().int().min(1).max(65535).optional(),
  limits: RoomLimits,
  env: z.record(z.string()).default({}),
  // Who lives there: their files are kept for them, and never handed to the next person (room-spec.ts, roomHomeVolume).
  occupant: z.string().min(1).optional(),
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

// Asks what a project is, before anything is built. The agent answers with an `inspected` message.
export const InspectCommand = z.object({
  type: z.literal("inspect"),
  requestId: z.string().min(1).max(64),
  room: RoomName,
  repo: z.string().min(1),
  // Left out: the repo's default branch.
  ref: z.string().min(1).optional(),
  path: z.string().default("."),
});
export type InspectCommand = z.infer<typeof InspectCommand>;

// Stops the build running (or waiting) in a room. The deployment then ends as failed, with BUILD_CANCELLED as its detail.
export const CancelBuildCommand = z.object({
  type: z.literal("cancel_build"),
  room: RoomName,
});
export type CancelBuildCommand = z.infer<typeof CancelBuildCommand>;

// What a cancelled deployment says, so the API and the room page can tell it from a real failure.
export const BUILD_CANCELLED = "Build cancelled.";

// A shell inside a room's running app, for someone the API let in over SSH (apps/api/src/ssh). The bytes go as base64,
// a few KB at a time. `command`: run that and stop (`ssh room ls`). Left out: an interactive shell. `tty`: a terminal of
// that size, as `ssh` asks for when a person is typing.
export const ShellId = z.string().min(1).max(64);
export const ShellOpen = z.object({
  type: z.literal("shell_open"),
  shellId: ShellId,
  room: RoomName,
  command: z.string().max(8192).optional(),
  tty: z.object({ term: z.string().max(64), cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) }).optional(),
});
export type ShellOpen = z.infer<typeof ShellOpen>;
export const ShellInput = z.object({ type: z.literal("shell_input"), shellId: ShellId, data: z.string().max(90_000) });
// Nothing more to read on its stdin: `cat file | ssh room 'cat > /tmp/file'` needs to hear it.
export const ShellEof = z.object({ type: z.literal("shell_eof"), shellId: ShellId });
export const ShellResize = z.object({ type: z.literal("shell_resize"), shellId: ShellId, cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) });
// So much of its output has reached the person. The caretaker holds a command back when too much hasn't.
export const ShellAck = z.object({ type: z.literal("shell_ack"), shellId: ShellId, bytes: z.number().int().min(0) });
// The person left: whatever the shell is running stops too.
export const ShellClose = z.object({ type: z.literal("shell_close"), shellId: ShellId });

export const ApiToAgent = z.discriminatedUnion("type", [ShellOpen, ShellInput, ShellEof, ShellResize, ShellAck, ShellClose, DeployCommand, RemoveRoomCommand, RestartRoomCommand, RemovePreviewCommand, GetLogsCommand, InspectCommand, CancelBuildCommand]);
export type ApiToAgent = z.infer<typeof ApiToAgent>;

// ---- agent → API ----

export const Hello = z.object({
  type: z.literal("hello"),
  houseId: z.string().min(1),
  secret: z.string().min(1),
  agentVersion: z.string(),
  // The builds it's on or has waiting, so the API can give up on any others: they died with an earlier caretaker.
  building: z.array(z.string()).optional(),
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

// What a build prints, as it prints it, for the log window.
export const DeployLog = z.object({
  type: z.literal("deploy_log"),
  deployId: z.string(),
  room: RoomName,
  lines: z.array(z.string().max(4000)).max(500),
});
export type DeployLog = z.infer<typeof DeployLog>;

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

// What reading a project found: how we'd run it (null: no idea), its port and where that came from, the settings it
// expects, what might get in its way, and where a runnable project is when it isn't in the folder asked.
export const Findings = z.object({
  branch: z.string(),
  sha: z.string(),
  stack: z.enum(["dockerfile", "node", "python", "go", "php", "static"]).nullable(),
  port: z.number().int().nullable(),
  portFrom: z.enum(["dockerfile", "env", "package", "compose", "readme"]).nullable(),
  env: z.array(z.string()),
  flags: z.array(z.enum(["noRunner", "noFolder", "forCloud", "wantsDatabase", "wantsInternet"])),
  folders: z.array(z.string()),
});
export type Findings = z.infer<typeof Findings>;

export const Inspected = z.object({
  type: z.literal("inspected"),
  requestId: z.string().min(1).max(64),
  findings: Findings.optional(),
  error: z.string().optional(),
});
export type Inspected = z.infer<typeof Inspected>;

export const ShellOutput = z.object({ type: z.literal("shell_output"), shellId: ShellId, data: z.string().max(90_000), stderr: z.boolean().optional() });
export type ShellOutput = z.infer<typeof ShellOutput>;
// It's over: how the command ended, or why it never started. `reason` is one of a few words the API turns into a sentence.
export const ShellExit = z.object({ type: z.literal("shell_exit"), shellId: ShellId, code: z.number().int().optional(), reason: z.enum(["not_running", "failed"]).optional() });
export type ShellExit = z.infer<typeof ShellExit>;

export const AgentToApi = z.discriminatedUnion("type", [ShellOutput, ShellExit, Hello, DeployStatus, DeployLog, Inspected, Usage, RoomEvent, RoomsSnapshot, Logs]);
export type AgentToApi = z.infer<typeof AgentToApi>;

export function parseApiToAgent(raw: string): ApiToAgent {
  return ApiToAgent.parse(JSON.parse(raw));
}

export function parseAgentToApi(raw: string): AgentToApi {
  return AgentToApi.parse(JSON.parse(raw));
}

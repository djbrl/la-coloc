// Reads each room's CPU and memory, for the live floor plan and the monthly bill.
import type Docker from "dockerode";
import type { UsageSample } from "@coloc/protocol";
import { docker } from "./docker";
import { LABEL, roomFilter } from "./room-spec";

export function cpuPercent(stats: Docker.ContainerStats): number {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
  const cpus = stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
  if (cpuDelta <= 0 || systemDelta <= 0) return 0;
  return Math.round((cpuDelta / systemDelta) * cpus * 10_000) / 100;
}

export function memoryUsed(stats: Docker.ContainerStats): number {
  // Page cache isn't the app's fault: subtract it, like `docker stats` does.
  const s = stats.memory_stats as Docker.ContainerStats["memory_stats"] & { stats?: Record<string, number> };
  const cache = s.stats?.inactive_file ?? s.stats?.total_inactive_file ?? 0;
  return Math.max(0, (s.usage ?? 0) - cache);
}

export async function sampleRooms(houseId: string): Promise<UsageSample[]> {
  const running = await docker.listContainers({ filters: { label: [...roomFilter(houseId), `${LABEL.kind}=prod`] } });
  return Promise.all(
    running.map(async (c) => {
      const stats = (await docker.getContainer(c.Id).stats({ stream: false })) as Docker.ContainerStats;
      return {
        room: c.Labels[LABEL.room],
        cpuPercent: cpuPercent(stats),
        memoryBytes: memoryUsed(stats),
        memoryLimitBytes: stats.memory_stats.limit ?? 0,
      };
    }),
  );
}

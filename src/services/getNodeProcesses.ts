import { type LocalhostHttpPort } from './getLocalhostActivePorts';

function sortByPort(entries: LocalhostHttpPort[]): LocalhostHttpPort[] {
  return [...entries].sort((a, b) => a.port - b.port);
}

export function getNodeProcessesFirst(
  entries: LocalhostHttpPort[],
): LocalhostHttpPort[] {
  const nodeEntries: LocalhostHttpPort[] = [];
  const otherEntries: LocalhostHttpPort[] = [];

  for (const entry of entries) {
    if (entry.processName === 'Node') {
      nodeEntries.push(entry);
      continue;
    }

    otherEntries.push(entry);
  }

  return [...sortByPort(nodeEntries), ...sortByPort(otherEntries)];
}

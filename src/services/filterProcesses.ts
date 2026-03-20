import { type LocalhostHttpPort } from './getLocalhostActivePorts';

const HIDDEN_PROCESS_PATTERNS = [
  /^code(?:\.exe)?$/i,
  /^cursor(?:\.exe)?$/i,
  /^lms(?:\.exe)?$/i,
  /^wslrelay(?:\.exe)?$/i,
  /^com\.docker\.backend(?:\.exe)?$/i,
];

function isHiddenProcess(processName: string): boolean {
  for (const pattern of HIDDEN_PROCESS_PATTERNS) {
    if (pattern.test(processName)) {
      return true;
    }
  }

  return false;
}

export function filterProcesses(entries: LocalhostHttpPort[]): LocalhostHttpPort[] {
  return entries.filter((entry) => !isHiddenProcess(entry.processName));
}

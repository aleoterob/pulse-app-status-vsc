const BUN_PROCESS_PATTERNS = [
  /^bun(?:\.exe)?$/i,
];

export function isBunProcess(processName: string): boolean {
  for (const pattern of BUN_PROCESS_PATTERNS) {
    if (pattern.test(processName)) {
      return true;
    }
  }

  return false;
}

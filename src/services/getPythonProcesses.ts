const PYTHON_PROCESS_PATTERNS = [
  /^python(?:\.exe)?$/i,
  /^python\d+(?:\.\d+)?(?:\.exe)?$/i,
  /^py(?:\.exe)?$/i,
];

export function isPythonProcess(processName: string): boolean {
  for (const pattern of PYTHON_PROCESS_PATTERNS) {
    if (pattern.test(processName)) {
      return true;
    }
  }

  return false;
}

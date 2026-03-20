const VSC_PROCESS_PATTERNS = [
  /^code(?:\.exe)?$/i,
  /^code - insiders(?:\.exe)?$/i,
];
const CURSOR_PROCESS_PATTERNS = [
  /^cursor(?:\.exe)?$/i,
];

export function isVsCodeProcess(processName: string): boolean {
  for (const pattern of VSC_PROCESS_PATTERNS) {
    if (pattern.test(processName)) {
      return true;
    }
  }

  return false;
}

export function isCursorProcess(processName: string): boolean {
  for (const pattern of CURSOR_PROCESS_PATTERNS) {
    if (pattern.test(processName)) {
      return true;
    }
  }

  return false;
}

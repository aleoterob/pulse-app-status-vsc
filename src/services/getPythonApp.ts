export function inferPythonAppName(commandLine: string): string | undefined {
  const normalized = commandLine.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  const moduleMatch = /(?:^|\s)-m\s+([a-zA-Z0-9_.-]+)/.exec(normalized);
  if (moduleMatch?.[1]) {
    return moduleMatch[1];
  }

  const scriptMatch = /(?:^|\s)(["']?[^"'\s]+?\.(?:py|pyw)["']?)(?:\s|$)/i.exec(normalized);
  if (!scriptMatch?.[1]) {
    return undefined;
  }

  const quotedScript = scriptMatch[1];
  const scriptPath = quotedScript.replace(/^['"]|['"]$/g, '');
  const pathParts = scriptPath.split(/[\\/]/).filter((part) => part.length > 0);
  const fileName = pathParts[pathParts.length - 1];
  return fileName && fileName.length > 0 ? fileName : undefined;
}

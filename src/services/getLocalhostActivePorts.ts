import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getAppPackageInfoFromCommandLine } from './getAppNameFromPackageJson';
import { isBunProcess } from './getBunProcesses';
import { getDockerAppsByPublishedPort } from './getDockerApps';
import { filterProcesses } from './filterProcesses';
import { inferPythonAppName } from './getPythonApp';
import { isPythonProcess } from './getPythonProcesses';

const execAsync = promisify(exec);
const HTTP_PROBE_TIMEOUT_MS = 2000;
const HTTP_PROBE_CONCURRENCY = 12;
const HTTP_PROBE_TARGETS = ['localhost', '127.0.0.1', '[::1]'] as const;

type WindowsTcpConnection = {
  LocalAddress: string;
  LocalPort: number;
  OwningProcess?: number;
  ProcessName?: string;
  CommandLine?: string;
};

export type LocalhostHttpPort = {
  processName: string;
  appName?: string;
  port: number;
};

type ListeningPortEntry = {
  processName: string;
  appName?: string;
  port: number;
};

function isJsRuntimeProcess(processName: string): boolean {
  return processName === 'Node' || processName === 'Bun';
}

function normalizeProcessName(processName: string): string {
  if (/^node(?:\.exe)?$/i.test(processName)) {
    return 'Node';
  }

  if (isBunProcess(processName)) {
    return 'Bun';
  }

  if (isPythonProcess(processName) || /^phython(?:\.exe)?$/i.test(processName)) {
    return 'Python';
  }

  return processName;
}

async function inferNodeAppInfo(
  commandLine: string,
): Promise<{ appName?: string; runtimeProcessName?: string }> {
  const normalized = commandLine.trim();
  if (normalized.length === 0) {
    return {};
  }

  const packageInfo = await getAppPackageInfoFromCommandLine(normalized);
  const runtimeProcessName =
    typeof packageInfo?.packageManager === 'string' &&
      packageInfo.packageManager.toLowerCase().startsWith('bun@')
      ? 'Bun'
      : undefined;

  if (packageInfo?.name) {
    return { appName: packageInfo.name, runtimeProcessName };
  }

  const scriptMatch = /(?:^|\s)(["']?[^"'\s]+?\.(?:js|mjs|cjs|ts|mts|cts)["']?)(?:\s|$)/i.exec(normalized);
  if (!scriptMatch?.[1]) {
    return {};
  }

  const quotedScript = scriptMatch[1];
  const scriptPath = quotedScript.replace(/^['"]|['"]$/g, '');
  const pathParts = scriptPath.split(/[\\/]/).filter((part) => part.length > 0);
  const fileName = pathParts[pathParts.length - 1];
  return {
    appName: fileName && fileName.length > 0 ? fileName : undefined,
    runtimeProcessName,
  };
}

function isLocalhostReachableBinding(address: string): boolean {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === 'localhost' ||
    address === '0.0.0.0' ||
    address === '::'
  );
}

function extractPortFromAddress(address: string): number | null {
  const localhostReachableMatch =
    /(?:127\.0\.0\.1|localhost|::1|0\.0\.0\.0|\*|::|\[::1\]|\[::\]):(\d+)$/.exec(address);
  if (!localhostReachableMatch?.[1]) {
    return null;
  }

  return Number(localhostReachableMatch[1]);
}

function mergeEntriesByPort(entries: ListeningPortEntry[]): ListeningPortEntry[] {
  const byPort = new Map<number, ListeningPortEntry>();

  for (const entry of entries) {
    const current = byPort.get(entry.port);
    if (!current) {
      byPort.set(entry.port, entry);
      continue;
    }

    if (!isJsRuntimeProcess(current.processName) && isJsRuntimeProcess(entry.processName)) {
      byPort.set(entry.port, entry);
      continue;
    }

    if (isJsRuntimeProcess(current.processName) && !current.appName && entry.appName) {
      byPort.set(entry.port, entry);
      continue;
    }

  }

  return [...byPort.values()];
}

async function getWindowsPorts(): Promise<ListeningPortEntry[]> {
  const { stdout } = await execAsync(
    'powershell -NoProfile -Command "$processByPid = @{}; Get-NetTCPConnection -State Listen | ForEach-Object { if (-not $processByPid.ContainsKey($_.OwningProcess)) { $processByPid[$_.OwningProcess] = Get-CimInstance Win32_Process -Filter (\\"ProcessId = $($_.OwningProcess)\\") -ErrorAction SilentlyContinue } $processInfo = $processByPid[$_.OwningProcess]; [PSCustomObject]@{ LocalAddress = $_.LocalAddress; LocalPort = $_.LocalPort; OwningProcess = $_.OwningProcess; ProcessName = $processInfo.Name; CommandLine = $processInfo.CommandLine } } | ConvertTo-Json -Compress"',
  );
  const entries: ListeningPortEntry[] = [];
  const parsed = JSON.parse(stdout) as
    | WindowsTcpConnection
    | WindowsTcpConnection[]
    | null;
  if (parsed === null) {
    return [];
  }

  const connections = Array.isArray(parsed) ? parsed : [parsed];

  for (const connection of connections) {
    const localAddress = connection.LocalAddress;
    const localPort = connection.LocalPort;
    if (typeof localAddress !== 'string') {
      continue;
    }

    if (typeof localPort !== 'number' || !Number.isInteger(localPort) || localPort <= 0) {
      continue;
    }

    if (isLocalhostReachableBinding(localAddress)) {
      let processName =
        typeof connection.ProcessName === 'string' && connection.ProcessName.length > 0
          ? normalizeProcessName(connection.ProcessName)
          : 'Unknown';
      const appInfo = typeof connection.CommandLine === 'string'
        ? isJsRuntimeProcess(processName)
          ? await inferNodeAppInfo(connection.CommandLine)
          : isPythonProcess(processName)
            ? {
              appName: inferPythonAppName(connection.CommandLine),
            }
            : {}
        : {};

      if (
        processName === 'Node' &&
        appInfo.runtimeProcessName &&
        appInfo.runtimeProcessName === 'Bun'
      ) {
        processName = 'Bun';
      }

      entries.push({
        port: localPort,
        processName,
        appName: appInfo.appName,
      });
    }
  }

  return mergeEntriesByPort(entries);
}

async function getUnixPorts(): Promise<ListeningPortEntry[]> {
  const { stdout } = await execAsync('lsof -nP -iTCP -sTCP:LISTEN');
  const entries: ListeningPortEntry[] = [];
  const lines = stdout.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith('COMMAND')) {
      continue;
    }

    const columns = trimmedLine.split(/\s+/);
    const command = columns[0] ?? 'Unknown';
    const addressColumn = columns[columns.length - 1] ?? '';
    const address = addressColumn.split('->')[0] ?? '';
    const port = extractPortFromAddress(address);

    if (port !== null && Number.isInteger(port) && port > 0) {
      entries.push({ port, processName: normalizeProcessName(command) });
    }
  }

  return mergeEntriesByPort(entries);
}

async function isHttpResponsive(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });

    return response.status >= 100 && response.status <= 599;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function isHttpResponsiveOnLocalhost(port: number): Promise<boolean> {
  for (const host of HTTP_PROBE_TARGETS) {
    const isResponsive = await isHttpResponsive(`http://${host}:${port}/`);
    if (isResponsive) {
      return true;
    }
  }

  return false;
}

async function filterVisiblePorts(
  entries: ListeningPortEntry[],
  dockerPorts: Set<number>,
): Promise<ListeningPortEntry[]> {
  const uniquePorts = [...new Set(entries.map((entry) => entry.port))];
  const visiblePorts = new Set<number>(dockerPorts);
  const portsNeedingHttpCheck = uniquePorts.filter((port) => !dockerPorts.has(port));

  for (let index = 0; index < portsNeedingHttpCheck.length; index += HTTP_PROBE_CONCURRENCY) {
    const batch = portsNeedingHttpCheck.slice(index, index + HTTP_PROBE_CONCURRENCY);
    const checks = await Promise.all(
      batch.map(async (port) => {
        const isResponsive = await isHttpResponsiveOnLocalhost(port);
        return { port, isResponsive };
      }),
    );

    for (const check of checks) {
      if (check.isResponsive) {
        visiblePorts.add(check.port);
      }
    }
  }

  return entries.filter((entry) => visiblePorts.has(entry.port));
}

function mergeDockerPorts(
  entries: LocalhostHttpPort[],
  dockerPortMap: Map<number, { containerName: string; imageName: string }>,
): LocalhostHttpPort[] {
  if (dockerPortMap.size === 0) {
    return entries;
  }

  const merged: LocalhostHttpPort[] = [...entries];
  const existingKeys = new Set<string>(
    merged.map((entry) => `${entry.processName}|${entry.port}|${entry.appName ?? ''}`),
  );

  for (const [port, dockerInfo] of dockerPortMap.entries()) {
    const dockerKey = `Docker|${port}|${dockerInfo.containerName}`;
    if (existingKeys.has(dockerKey)) {
      continue;
    }

    merged.push({
      processName: 'Docker',
      appName: dockerInfo.containerName,
      port,
    });
    existingKeys.add(dockerKey);
  }

  return merged;
}

export async function getLocalhostActivePorts(): Promise<LocalhostHttpPort[]> {
  try {
    const activePorts = process.platform === 'win32'
      ? await getWindowsPorts()
      : await getUnixPorts();

    const dockerPortMap = await getDockerAppsByPublishedPort();
    const dockerPorts = new Set<number>(dockerPortMap.keys());
    const visiblePorts = await filterVisiblePorts(activePorts, dockerPorts);
    return filterProcesses(mergeDockerPorts(visiblePorts, dockerPortMap));
  } catch {
    return [];
  }
}

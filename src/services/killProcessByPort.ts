import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type KillProcessResult = {
  port: number;
  killedPids: number[];
};

async function getListeningPidsWindows(port: number): Promise<number[]> {
  const { stdout } = await execAsync(
    `powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ConvertTo-Json -Compress"`,
  );

  if (stdout.trim().length === 0) {
    return [];
  }

  const parsed = JSON.parse(stdout) as number | number[] | null;
  if (parsed === null) {
    return [];
  }

  const pids = Array.isArray(parsed) ? parsed : [parsed];
  const uniquePids = new Set<number>();

  for (const pid of pids) {
    if (Number.isInteger(pid) && pid > 0) {
      uniquePids.add(pid);
    }
  }

  return [...uniquePids];
}

async function getListeningPidsUnix(port: number): Promise<number[]> {
  const { stdout } = await execAsync(`lsof -tiTCP:${port} -sTCP:LISTEN`);
  const uniquePids = new Set<number>();

  for (const line of stdout.split(/\r?\n/)) {
    const value = Number(line.trim());
    if (Number.isInteger(value) && value > 0) {
      uniquePids.add(value);
    }
  }

  return [...uniquePids];
}

async function killPid(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /PID ${pid} /F`);
      return true;
    }

    await execAsync(`kill -9 ${pid}`);
    return true;
  } catch {
    return false;
  }
}

export async function killProcessByPort(port: number): Promise<KillProcessResult> {
  if (!Number.isInteger(port) || port <= 0) {
    return { port, killedPids: [] };
  }

  const pids = process.platform === 'win32'
    ? await getListeningPidsWindows(port)
    : await getListeningPidsUnix(port);

  const killedPids: number[] = [];
  for (const pid of pids) {
    const killed = await killPid(pid);
    if (killed) {
      killedPids.push(pid);
    }
  }

  return { port, killedPids };
}

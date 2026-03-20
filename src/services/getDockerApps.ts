import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type DockerPortInfo = {
  containerName: string;
  imageName: string;
};

function extractPublishedHostPorts(portsValue: string): number[] {
  const hostPorts = new Set<number>();
  const hostPortRegex =
    /(?:0\.0\.0\.0|127\.0\.0\.1|localhost|\[::\]|::):(\d+)->\d+\/(?:tcp|udp)/gi;

  let match: RegExpExecArray | null = hostPortRegex.exec(portsValue);
  while (match) {
    const hostPort = Number(match[1]);
    if (Number.isInteger(hostPort) && hostPort > 0) {
      hostPorts.add(hostPort);
    }
    match = hostPortRegex.exec(portsValue);
  }

  return [...hostPorts];
}

export async function getDockerAppsByPublishedPort(): Promise<Map<number, DockerPortInfo>> {
  try {
    const { stdout } = await execAsync(
      'docker ps --format "{{.Names}}|{{.Image}}|{{.Ports}}"',
    );
    const portMap = new Map<number, DockerPortInfo>();

    for (const row of stdout.split(/\r?\n/)) {
      const line = row.trim();
      if (line.length === 0) {
        continue;
      }

      const [containerName = '', imageName = '', portsValue = ''] = line.split('|');
      if (portsValue.length === 0) {
        continue;
      }

      const hostPorts = extractPublishedHostPorts(portsValue);
      for (const hostPort of hostPorts) {
        if (!portMap.has(hostPort)) {
          portMap.set(hostPort, {
            containerName: containerName || 'Unknown',
            imageName: imageName || 'Unknown',
          });
        }
      }
    }

    return portMap;
  } catch {
    return new Map<number, DockerPortInfo>();
  }
}

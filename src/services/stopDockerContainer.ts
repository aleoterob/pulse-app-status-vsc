import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type StopDockerContainerResult = {
  containerName: string;
  stopped: boolean;
};

export async function stopDockerContainerByName(
  containerName: string,
): Promise<StopDockerContainerResult> {
  const trimmedName = containerName.trim();
  if (trimmedName.length === 0) {
    return {
      containerName,
      stopped: false,
    };
  }

  try {
    const escapedName = trimmedName.replace(/"/g, '\\"');
    await execAsync(`docker stop "${escapedName}"`);
    return {
      containerName: trimmedName,
      stopped: true,
    };
  } catch {
    return {
      containerName: trimmedName,
      stopped: false,
    };
  }
}

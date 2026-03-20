import { access, readFile } from 'node:fs/promises';
import * as path from 'node:path';

export type AppPackageInfo = {
  name?: string;
  packageManager?: string;
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeCandidatePath(rawValue: string): string | undefined {
  const cleaned = rawValue.trim().replace(/^['"]|['"]$/g, '');
  if (cleaned.length === 0) {
    return undefined;
  }

  const resolved = path.normalize(cleaned);
  if (!path.isAbsolute(resolved)) {
    return undefined;
  }

  return resolved;
}

function extractCommandLinePaths(commandLine: string): string[] {
  const candidates = new Set<string>();

  const quotedMatches = [...commandLine.matchAll(/"([^"]+)"/g)];
  for (const match of quotedMatches) {
    const candidate = normalizeCandidatePath(match[1] ?? '');
    if (candidate) {
      candidates.add(candidate);
    }
  }

  const tokenMatches = commandLine.split(/\s+/);
  for (const token of tokenMatches) {
    const candidate = normalizeCandidatePath(token);
    if (candidate) {
      candidates.add(candidate);
    }
  }

  return [...candidates];
}

function collectSearchDirectories(candidatePath: string): string[] {
  const prioritizedDirs: string[] = [];
  const isDirectory = path.extname(candidatePath).length === 0;
  const fromPath = isDirectory ? candidatePath : path.dirname(candidatePath);

  const nodeModulesMarker = `${path.sep}node_modules${path.sep}`;
  const nodeModulesIndex = candidatePath.toLowerCase().indexOf(nodeModulesMarker.toLowerCase());
  if (nodeModulesIndex > 0) {
    // Prefer the project root over package roots inside node_modules.
    prioritizedDirs.push(candidatePath.slice(0, nodeModulesIndex));
  }

  prioritizedDirs.push(fromPath);

  return [...new Set(prioritizedDirs)];
}

async function readPackageInfo(packageJsonPath: string): Promise<AppPackageInfo> {
  try {
    const content = await readFile(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(content) as {
      name?: unknown;
      packageManager?: unknown;
    };

    return {
      name: typeof parsed.name === 'string' && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : undefined,
      packageManager: typeof parsed.packageManager === 'string'
        ? parsed.packageManager
        : undefined,
    };
  } catch {
    return {};
  }
}

async function findNearestPackageJsonInfo(startDir: string): Promise<AppPackageInfo | undefined> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (await pathExists(packageJsonPath)) {
      const info = await readPackageInfo(packageJsonPath);
      if (info.name || info.packageManager) {
        return info;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

export async function getAppPackageInfoFromCommandLine(
  commandLine: string,
): Promise<AppPackageInfo | undefined> {
  const candidatePaths = extractCommandLinePaths(commandLine);
  for (const candidatePath of candidatePaths) {
    const searchDirs = collectSearchDirectories(candidatePath);
    for (const searchDir of searchDirs) {
      const packageInfo = await findNearestPackageJsonInfo(searchDir);
      if (packageInfo) {
        return packageInfo;
      }
    }
  }

  return undefined;
}

export async function getAppNameFromPackageJson(
  commandLine: string,
): Promise<string | undefined> {
  const info = await getAppPackageInfoFromCommandLine(commandLine);
  return info?.name;
}

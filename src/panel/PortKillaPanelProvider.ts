import * as vscode from 'vscode';
import { isBunProcess } from '../services/getBunProcesses';
import { getLocalhostActivePorts, type LocalhostHttpPort } from '../services/getLocalhostActivePorts';
import { getNodeProcessesFirst } from '../services/getNodeProcesses';
import { isPythonProcess } from '../services/getPythonProcesses';
import { isCursorProcess, isVsCodeProcess } from '../services/getVSCProcesses';
import { stopDockerContainerByName } from '../services/stopDockerContainer';
import { killProcessByPort } from '../services/killProcessByPort';

type PortKillaWebviewMessage = {
  type: 'kill-process';
  port: number;
  processName?: string;
  appName?: string;
};

export class PortKillaPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'portkilla-panel-view';
  private static readonly refreshIntervalMs = 4000;
  private static readonly htmlTemplatePath = ['media', 'panel', 'index.html'] as const;
  private static readonly cssPath = ['media', 'panel', 'styles.css'] as const;
  private static readonly nodeLogoPath = ['media', 'logos', 'nodejs.svg'] as const;
  private static readonly bunLogoPath = ['media', 'logos', 'bun.svg'] as const;
  private static readonly vscodeLogoPath = ['media', 'logos', 'vscode.svg'] as const;
  private static readonly cursorLogoPath = ['media', 'logos', 'cursor_dark.svg'] as const;
  private static readonly dockerLogoPath = ['media', 'logos', 'docker.svg'] as const;
  private static readonly pythonLogoPath = ['media', 'logos', 'python.svg'] as const;
  private view?: vscode.WebviewView;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private htmlTemplate?: string;
  private nodeLogoUri?: string | null;
  private bunLogoUri?: string | null;
  private vscodeLogoUri?: string | null;
  private cursorLogoUri?: string | null;
  private dockerLogoUri?: string | null;
  private pythonLogoUri?: string | null;

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleWebviewMessage(message);
    });

    await this.render(webviewView);
    this.startAutoRefresh();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.render(webviewView);
      }
    });

    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = undefined;
      }

      this.stopAutoRefresh();
    });
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }

    await this.render(this.view);
  }

  private async render(webviewView: vscode.WebviewView): Promise<void> {
    const ports = await getLocalhostActivePorts();
    webviewView.webview.html = await this.getHtml(webviewView.webview, ports);
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, PortKillaPanelProvider.refreshIntervalMs);
  }

  private stopAutoRefresh(): void {
    if (!this.refreshTimer) {
      return;
    }

    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private async getHtml(
    webview: vscode.Webview,
    ports: LocalhostHttpPort[],
  ): Promise<string> {
    const escapeHtml = (value: string): string =>
      value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const sortedPorts = getNodeProcessesFirst(ports);
    const nodeLogoUri = await this.getNodeLogoUri(webview);
    const bunLogoUri = await this.getBunLogoUri(webview);
    const vscodeLogoUri = await this.getVsCodeLogoUri(webview);
    const cursorLogoUri = await this.getCursorLogoUri(webview);
    const dockerLogoUri = await this.getDockerLogoUri(webview);
    const pythonLogoUri = await this.getPythonLogoUri(webview);
    const rowsHtml = sortedPorts.length === 0
      ? '<tr><td colspan="5">No localhost HTTP ports responded.</td></tr>'
      : sortedPorts
        .map(
          (entry) => {
            const processLabel = escapeHtml(entry.processName);
            const appName = entry.appName ? escapeHtml(entry.appName) : '-';
            const processAttr = escapeHtml(entry.processName);
            const appNameAttr = entry.appName ? escapeHtml(entry.appName) : '';
            const processCell =
              entry.processName === 'Docker' && dockerLogoUri
                ? `<span class="process-with-logo"><img src="${dockerLogoUri}" alt="Docker logo" class="process-logo" /><span>${processLabel}</span></span>`
                : entry.processName === 'Node' && nodeLogoUri
                ? `<span class="process-with-logo"><img src="${nodeLogoUri}" alt="Node logo" class="process-logo" /><span>${processLabel}</span></span>`
                : isBunProcess(entry.processName) && bunLogoUri
                  ? `<span class="process-with-logo"><img src="${bunLogoUri}" alt="Bun logo" class="process-logo" /><span>${processLabel}</span></span>`
                : isPythonProcess(entry.processName) && pythonLogoUri
                  ? `<span class="process-with-logo"><img src="${pythonLogoUri}" alt="Python logo" class="process-logo" /><span>${processLabel}</span></span>`
                : isCursorProcess(entry.processName) && cursorLogoUri
                  ? `<span class="process-with-logo"><img src="${cursorLogoUri}" alt="Cursor logo" class="process-logo" /><span>${processLabel}</span></span>`
                : isVsCodeProcess(entry.processName) && vscodeLogoUri
                  ? `<span class="process-with-logo"><img src="${vscodeLogoUri}" alt="VS Code logo" class="process-logo" /><span>${processLabel}</span></span>`
                  : processLabel;

            return `<tr>
  <td>${processCell}</td>
  <td>${appName}</td>
  <td><code>${entry.port}</code></td>
  <td><a class="vsc-button" href="http://localhost:${entry.port}">Open</a></td>
  <td><button class="vsc-button vsc-button-danger kill-button" type="button" data-port="${entry.port}" data-process-name="${processAttr}" data-app-name="${appNameAttr}">Stop</button></td>
</tr>`;
          },
        )
        .join('');

    const template = await this.readHtmlTemplate();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, ...PortKillaPanelProvider.cssPath),
    );

    const nonce = getNonce();

    return template
      .replaceAll('__CSP_SOURCE__', webview.cspSource)
      .replaceAll('__NONCE__', nonce)
      .replace('__CSS_URI__', cssUri.toString())
      .replace('__ROWS__', rowsHtml);
  }

  private isPortKillaWebviewMessage(message: unknown): message is PortKillaWebviewMessage {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    if (!('type' in message) || !('port' in message)) {
      return false;
    }

    if (message.type !== 'kill-process' || typeof message.port !== 'number') {
      return false;
    }

    if ('processName' in message && typeof message.processName !== 'undefined' && typeof message.processName !== 'string') {
      return false;
    }

    if ('appName' in message && typeof message.appName !== 'undefined' && typeof message.appName !== 'string') {
      return false;
    }

    return true;
  }

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (!this.isPortKillaWebviewMessage(message)) {
      return;
    }

    const confirmKillAction = 'Stop process';
    const selectedAction = await vscode.window.showWarningMessage(
      `Are you sure you want to stop the process on port ${message.port}?`,
      {
        modal: true,
        detail: 'This action stops the process immediately.',
      },
      confirmKillAction,
    );

    if (selectedAction !== confirmKillAction) {
      return;
    }

    const currentPorts = await getLocalhostActivePorts();
    const dockerEntriesForPort = currentPorts.filter(
      (entry) => entry.port === message.port && entry.processName === 'Docker' && entry.appName,
    );

    if (dockerEntriesForPort.length > 0) {
      const dockerContainerNames = [...new Set(
        dockerEntriesForPort
          .map((entry) => entry.appName?.trim())
          .filter((name): name is string => typeof name === 'string' && name.length > 0),
      )];

      const stoppedContainers: string[] = [];
      const failedContainers: string[] = [];

      for (const containerName of dockerContainerNames) {
        const dockerResult = await stopDockerContainerByName(containerName);
        if (dockerResult.stopped) {
          stoppedContainers.push(dockerResult.containerName);
        } else {
          failedContainers.push(dockerResult.containerName);
        }
      }

      if (stoppedContainers.length > 0) {
        void vscode.window.showInformationMessage(
          `Stopped Docker container(s): ${stoppedContainers.join(', ')}.`,
        );
      }

      if (failedContainers.length > 0) {
        void vscode.window.showWarningMessage(
          `Could not stop Docker container(s): ${failedContainers.join(', ')}. Check Docker Desktop/engine status.`,
        );
      }

      await this.refresh();
      return;
    }

    if (message.processName === 'Docker' && message.appName && message.appName.trim().length > 0) {
      const dockerResult = await stopDockerContainerByName(message.appName);
      if (!dockerResult.stopped) {
        void vscode.window.showWarningMessage(
          `Could not stop Docker container "${dockerResult.containerName}". Check Docker Desktop/engine status.`,
        );
      } else {
        void vscode.window.showInformationMessage(
          `Stopped Docker container "${dockerResult.containerName}".`,
        );
      }
    } else {
      const result = await killProcessByPort(message.port);
      if (result.killedPids.length === 0) {
        void vscode.window.showWarningMessage(`No process was stopped on port ${message.port}.`);
      } else {
        void vscode.window.showInformationMessage(
          `Stopped PID(s) ${result.killedPids.join(', ')} on port ${message.port}.`,
        );
      }
    }

    await this.refresh();
  }

  private async getNodeLogoUri(webview: vscode.Webview): Promise<string | null> {
    if (typeof this.nodeLogoUri !== 'undefined') {
      return this.nodeLogoUri;
    }

    const logoUri = vscode.Uri.joinPath(this.extensionUri, ...PortKillaPanelProvider.nodeLogoPath);
    try {
      await vscode.workspace.fs.stat(logoUri);
      this.nodeLogoUri = webview.asWebviewUri(logoUri).toString();
      return this.nodeLogoUri;
    } catch {
      this.nodeLogoUri = null;
      return null;
    }
  }

  private async getBunLogoUri(webview: vscode.Webview): Promise<string | null> {
    if (typeof this.bunLogoUri !== 'undefined') {
      return this.bunLogoUri;
    }

    const logoUri = vscode.Uri.joinPath(this.extensionUri, ...PortKillaPanelProvider.bunLogoPath);
    try {
      await vscode.workspace.fs.stat(logoUri);
      this.bunLogoUri = webview.asWebviewUri(logoUri).toString();
      return this.bunLogoUri;
    } catch {
      this.bunLogoUri = null;
      return null;
    }
  }

  private async getVsCodeLogoUri(webview: vscode.Webview): Promise<string | null> {
    if (typeof this.vscodeLogoUri !== 'undefined') {
      return this.vscodeLogoUri;
    }

    const logoUri = vscode.Uri.joinPath(this.extensionUri, ...PortKillaPanelProvider.vscodeLogoPath);
    try {
      await vscode.workspace.fs.stat(logoUri);
      this.vscodeLogoUri = webview.asWebviewUri(logoUri).toString();
      return this.vscodeLogoUri;
    } catch {
      this.vscodeLogoUri = null;
      return null;
    }
  }

  private async getCursorLogoUri(webview: vscode.Webview): Promise<string | null> {
    if (typeof this.cursorLogoUri !== 'undefined') {
      return this.cursorLogoUri;
    }

    const logoUri = vscode.Uri.joinPath(this.extensionUri, ...PortKillaPanelProvider.cursorLogoPath);
    try {
      await vscode.workspace.fs.stat(logoUri);
      this.cursorLogoUri = webview.asWebviewUri(logoUri).toString();
      return this.cursorLogoUri;
    } catch {
      this.cursorLogoUri = null;
      return null;
    }
  }

  private async getDockerLogoUri(webview: vscode.Webview): Promise<string | null> {
    if (typeof this.dockerLogoUri !== 'undefined') {
      return this.dockerLogoUri;
    }

    const logoUri = vscode.Uri.joinPath(this.extensionUri, ...PortKillaPanelProvider.dockerLogoPath);
    try {
      await vscode.workspace.fs.stat(logoUri);
      this.dockerLogoUri = webview.asWebviewUri(logoUri).toString();
      return this.dockerLogoUri;
    } catch {
      this.dockerLogoUri = null;
      return null;
    }
  }

  private async getPythonLogoUri(webview: vscode.Webview): Promise<string | null> {
    if (typeof this.pythonLogoUri !== 'undefined') {
      return this.pythonLogoUri;
    }

    const logoUri = vscode.Uri.joinPath(this.extensionUri, ...PortKillaPanelProvider.pythonLogoPath);
    try {
      await vscode.workspace.fs.stat(logoUri);
      this.pythonLogoUri = webview.asWebviewUri(logoUri).toString();
      return this.pythonLogoUri;
    } catch {
      this.pythonLogoUri = null;
      return null;
    }
  }

  private async readHtmlTemplate(): Promise<string> {
    if (this.htmlTemplate) {
      return this.htmlTemplate;
    }

    const templateUri = vscode.Uri.joinPath(
      this.extensionUri,
      ...PortKillaPanelProvider.htmlTemplatePath,
    );
    const templateBytes = await vscode.workspace.fs.readFile(templateUri);
    this.htmlTemplate = new TextDecoder('utf-8').decode(templateBytes);
    return this.htmlTemplate;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 24; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}

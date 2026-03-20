import * as vscode from 'vscode';
import { PortKillaPanelProvider } from './panel/PulsePanelProvider';

export function activate(context: vscode.ExtensionContext) {
  const panelProvider = new PortKillaPanelProvider(context.extensionUri);
  const providerRegistration = vscode.window.registerWebviewViewProvider(
    PortKillaPanelProvider.viewType,
    panelProvider,
  );

  const runCommand = vscode.commands.registerCommand(
    'portkilla.run-portkilla',
    async () => {
      await vscode.commands.executeCommand(
        'workbench.view.extension.portkilla-panel',
      );
    },
  );

  const refreshProcessesCommand = vscode.commands.registerCommand(
    'portkilla.refresh-processes',
    async () => {
      await panelProvider.refresh();
    },
  );

  const openExtensionDetailsCommand = vscode.commands.registerCommand(
    'portkilla.open-extension-details',
    async () => {
      try {
        await vscode.commands.executeCommand('workbench.view.extensions');
        await vscode.commands.executeCommand(
          'workbench.extensions.action.showExtensionsWithIds',
          [context.extension.id],
        );
      } catch {
        try {
          await vscode.commands.executeCommand('workbench.view.extensions');
          await vscode.commands.executeCommand(
            'workbench.extensions.search',
            `@id:${context.extension.id}`,
          );
        } catch {
          void vscode.window.showWarningMessage(
            'Could not open extension details automatically. Open Extensions (Ctrl+Shift+X) and search for PortKilla.',
          );
        }
      }
    },
  );

  context.subscriptions.push(
    providerRegistration,
    runCommand,
    refreshProcessesCommand,
    openExtensionDetailsCommand,
  );
}

export function deactivate() {}

import * as vscode from 'vscode';
import { BranchPrunerViewProvider } from './providers/BranchPrunerViewProvider';

/**
 * Extension activation entry point
 * Registers the WebView provider for Git Branch Pruner
 */
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BranchPrunerViewProvider.viewId, new BranchPrunerViewProvider())
  );
}

export function deactivate() {}

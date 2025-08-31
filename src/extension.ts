import * as vscode from 'vscode';
import { NoteExplorerProvider } from './noteExplorer';
import { registerCommands } from './commands';

export async function activate(context: vscode.ExtensionContext) {
    const noteExplorerProvider = new NoteExplorerProvider(context);
    
    // Register the TreeDataProvider for the explorer view with drag and drop
    const treeView = vscode.window.createTreeView('yzc-note.explorer', {
        treeDataProvider: noteExplorerProvider,
        showCollapseAll: true,
        dragAndDropController: noteExplorerProvider,
        canSelectMany: true
    });

    // Register all commands
    registerCommands(context, noteExplorerProvider);
    
    // Add tree view to subscriptions
    context.subscriptions.push(treeView);

    // Initialize with saved root path if exists
    const rootPath = context.globalState.get('rootPath');
    if (rootPath) {
        await noteExplorerProvider.setRootPath(rootPath as string);
    } else {
        await vscode.commands.executeCommand('setContext', 'yzc-note:hasRootFolder', false);
    }
}

export function deactivate() {}

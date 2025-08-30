import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

class NoteExplorerProvider implements vscode.TreeDataProvider<NoteItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<NoteItem | undefined | null | void> = new vscode.EventEmitter<NoteItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NoteItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootPath: string | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.rootPath = this.context.globalState.get('rootPath');
    }

    setRootPath(path: string | undefined) {
        this.rootPath = path;
        this.context.globalState.update('rootPath', path);
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: NoteItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: NoteItem): Promise<NoteItem[]> {
        if (!this.rootPath) {
            return [];
        }

        if (element) {
            return this.getFilesInDirectory(element.resourceUri!.fsPath);
        } else {
            return this.getFilesInDirectory(this.rootPath);
        }
    }

    private async getFilesInDirectory(directory: string): Promise<NoteItem[]> {
        try {
            const files = await fs.promises.readdir(directory, { withFileTypes: true });
            
            const items = await Promise.all(files.map(async file => {
                const fullPath = path.join(directory, file.name);
                const isDirectory = file.isDirectory();
                
                if (isDirectory) {
                    return new NoteItem(
                        file.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        vscode.Uri.file(fullPath),
                        'folder',
                        undefined
                    );
                } else if (file.name.endsWith('.md')) {
                    return new NoteItem(
                        file.name,
                        vscode.TreeItemCollapsibleState.None,
                        vscode.Uri.file(fullPath),
                        'file',
                        {
                            command: 'yzc-note.openMarkdown',
                            title: 'Open Markdown',
                            arguments: [vscode.Uri.file(fullPath)]
                        }
                    );
                }
                return null;
            }));

            return items.filter((item): item is NoteItem => item !== null);
        } catch (error) {
            console.error('Error reading directory:', error);
            return [];
        }
    }
}

class NoteItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly resourceUri: vscode.Uri,
        public readonly type: 'file' | 'folder',
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = this.label;
        this.contextValue = type;
        this.iconPath = new vscode.ThemeIcon(type === 'file' ? 'file' : 'folder');
    }
}

export function activate(context: vscode.ExtensionContext) {
    const noteExplorerProvider = new NoteExplorerProvider(context);
    
    // Register the TreeDataProvider for the explorer view
    const treeView = vscode.window.createTreeView('yzc-note.explorer', {
        treeDataProvider: noteExplorerProvider,
        showCollapseAll: true
    });

    // Register commands
    const setRootFolderCommand = vscode.commands.registerCommand('yzc-note.setRootFolder', async () => {
        const rootUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Root Folder for Notes'
        });

        if (rootUri && rootUri[0]) {
            noteExplorerProvider.setRootPath(rootUri[0].fsPath);
            vscode.window.showInformationMessage(`Notes root folder set to: ${rootUri[0].fsPath}`);
        }
    });

    const refreshCommand = vscode.commands.registerCommand('yzc-note.refresh', () => {
        noteExplorerProvider.refresh();
    });

    const openMarkdownCommand = vscode.commands.registerCommand('yzc-note.openMarkdown', (uri: vscode.Uri) => {
        if (uri) {
            vscode.commands.executeCommand('milkdown.open', uri);
        }
    });

    // Add commands to subscriptions
    context.subscriptions.push(
        treeView,
        setRootFolderCommand,
        refreshCommand,
        openMarkdownCommand
    );

    // Initialize with saved root path if exists
    const rootPath = context.globalState.get('rootPath');
    if (rootPath) {
        noteExplorerProvider.setRootPath(rootPath as string);
    }
}

export function deactivate() {}

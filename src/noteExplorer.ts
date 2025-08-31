import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class NoteExplorerProvider implements vscode.TreeDataProvider<NoteItem>, vscode.TreeDragAndDropController<NoteItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<NoteItem | undefined | null | void> = new vscode.EventEmitter<NoteItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NoteItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootPath: string | undefined;
    dropMimeTypes = ['application/vnd.code.tree.yzc-note'];
    dragMimeTypes = ['text/uri-list'];

    constructor(private context: vscode.ExtensionContext) {
        this.rootPath = this.context.globalState.get('rootPath');
        if (this.rootPath) {
            vscode.workspace.updateWorkspaceFolders(
                vscode.workspace.workspaceFolders?.length ?? 0,
                null,
                { uri: vscode.Uri.file(this.rootPath), name: "My Notes" }
            );
        }
    }

    async setRootPath(path: string | undefined) {
        this.rootPath = path;
        await this.context.globalState.update('rootPath', path);
        await vscode.commands.executeCommand('setContext', 'yzc-note:hasRootFolder', !!path);
        this.refresh();
    }

    getRootPath(): string | undefined {
        return this.rootPath;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async handleDrag?(source: readonly NoteItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        dataTransfer.set('application/vnd.code.tree.yzc-note', new vscode.DataTransferItem(source));
    }

    async handleDrop(target: NoteItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.yzc-note');
        if (!transferItem) {
            return;
        }

        const sourceItems: NoteItem[] = transferItem.value;
        const targetPath = target?.resourceUri?.fsPath || this.rootPath;
        
        if (!targetPath) {
            return;
        }

        try {
            for (const sourceItem of sourceItems) {
                const sourcePath = sourceItem.resourceUri.fsPath;
                const targetItemPath = path.join(targetPath, path.basename(sourcePath));
                
                if (sourcePath === targetItemPath) {
                    continue;
                }

                if (await this.pathExists(targetItemPath)) {
                    const overwrite = await vscode.window.showWarningMessage(
                        `'${path.basename(sourcePath)}' already exists in the target location. Overwrite?`,
                        { modal: true },
                        'Yes', 'No'
                    );
                    
                    if (overwrite !== 'Yes') {
                        continue;
                    }
                }

                await vscode.workspace.fs.rename(
                    vscode.Uri.file(sourcePath),
                    vscode.Uri.file(targetItemPath),
                    { overwrite: true }
                );
            }
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to move items: ${error}`);
        }
    }

    private async pathExists(path: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(path));
            return true;
        } catch {
            return false;
        }
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
            const timeSuffixRegex = /^(.+)_\d{10,13}\.md$/;

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
                } else if (timeSuffixRegex.test(file.name)) {
                    const baseName = file.name.replace(/_\d{10,13}\.md$/, ".md");
                    return new NoteItem(
                        baseName,
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

export class NoteItem extends vscode.TreeItem {
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
        
        this.resourceUri = resourceUri;
        this.id = resourceUri.fsPath;
    }
    
    get resource(): vscode.Uri {
        return this.resourceUri;
    }
}

export async function getSubfolders(rootPath: string): Promise<string[]> {
    const folders: string[] = [];
    try {
        const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(rootPath, entry.name);
                folders.push(fullPath);
                const subFolders = await getSubfolders(fullPath);
                folders.push(...subFolders);
            }
        }
    } catch (error) {
        console.error('Error reading directories:', error);
    }
    return folders;
}

export async function createNewFile(directory: string, isFolder: boolean = false, rootPath?: string): Promise<void> {
    const input = await vscode.window.showInputBox({
        prompt: `Enter ${isFolder ? 'folder' : 'file'} name`,
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value) {
                return 'Name cannot be empty';
            }
            if (/[\\/:*?"<>|]/.test(value)) {
                return 'Invalid character in name';
            }
            return null;
        }
    });

    if (!input) {
        return;
    }

    const fullPath = path.join(directory, input + (isFolder ? '' : '_'+Date.now()+'.md'));
    
    try {
        if (isFolder) {
            await fs.promises.mkdir(fullPath, { recursive: true });
        } else {
            await fs.promises.writeFile(fullPath, '');
            const uri = vscode.Uri.file(fullPath);
            await vscode.commands.executeCommand('milkdown.open', uri);;
        }
        
        if (rootPath) {
            const relativePath = path.relative(rootPath, fullPath);
            vscode.commands.executeCommand('yzc-note.refresh');
            vscode.window.showInformationMessage(`Created ${isFolder ? 'folder' : 'file'}: ${relativePath}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create ${isFolder ? 'folder' : 'file'}: ${error}`);
    }
}


export async function moveCurrentNoteToFolder(originalPath: string, rootPath: string): Promise<string | undefined> {
    const folders = await getSubfolders(rootPath);
    const folderItems = [
        { label: 'Root', description: rootPath },
        ...folders.map(folder => ({
            label: path.relative(rootPath, folder),
            description: folder
        }))
    ];

    const selected = await vscode.window.showQuickPick(folderItems, {
        placeHolder: 'Select a folder for the new note',
        title: 'Select Destination Folder'
    });

    if (!selected) {
        return undefined; // User cancelled the operation
    }

    const itemName = path.basename(originalPath);
    const targetPath = path.join(selected.description || rootPath, itemName);
    console.log("Target Path", targetPath);

    try {
        await fs.promises.rename(originalPath, targetPath);
        vscode.window.showInformationMessage('Note moved successfully');
        return targetPath;
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to move note: ${error}`);
        return undefined;
    }    
}

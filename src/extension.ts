import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

class NoteExplorerProvider implements vscode.TreeDataProvider<NoteItem>, vscode.TreeDragAndDropController<NoteItem> {
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
                
                // Skip if trying to move to the same location
                if (sourcePath === targetItemPath) {
                    continue;
                }

                // Check if target already exists
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

                // Move the file/folder
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
        
        // Enable drag and drop
        this.resourceUri = resourceUri;
        this.id = resourceUri.fsPath;
    }
    
    // Make the item draggable
    get resource(): vscode.Uri {
        return this.resourceUri;
    }
}

async function getSubfolders(rootPath: string): Promise<string[]> {
    const folders: string[] = [];
    try {
        const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(rootPath, entry.name);
                folders.push(fullPath);
                // Get subfolders recursively
                const subFolders = await getSubfolders(fullPath);
                folders.push(...subFolders);
            }
        }
    } catch (error) {
        console.error('Error reading directories:', error);
    }
    return folders;
}

async function createNewFile(directory: string, isFolder: boolean = false, rootPath?: string): Promise<void> {
    // If this is not a folder creation and we have a root path, show folder selection
    if (!isFolder && rootPath) {
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

        if (selected) {
            directory = selected.description || directory;
        } else {
            return; // User cancelled
        }
    }

    const name = await vscode.window.showInputBox({
        prompt: `Enter ${isFolder ? 'folder' : 'note'} name`,
        validateInput: (value: string) => {
            if (!value) { return 'Name cannot be empty'; }
            if (value.includes('\\') || value.includes('/')) { return 'Name cannot contain slashes'; }
            return null;
        }
    });

    if (!name) { return; }

    const fullPath = path.join(directory, isFolder ? name : `${name}.md`);
    console.log("New Full path", fullPath);

    try {
        if (isFolder) {
            await fs.promises.mkdir(fullPath, { recursive: true });
        } else {
            // Create an empty markdown file
            await fs.promises.writeFile(fullPath, '', 'utf8');
            // Open the file with VSCode's default editor
            const uri = vscode.Uri.file(fullPath);
            await vscode.commands.executeCommand('milkdown.open', uri);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create ${isFolder ? 'folder' : 'note'}: ${error}`);
    }
}

export async function activate(context: vscode.ExtensionContext) {
    const noteExplorerProvider = new NoteExplorerProvider(context);
    
    // Register the TreeDataProvider for the explorer view with drag and drop
    const treeView = vscode.window.createTreeView('yzc-note.explorer', {
        treeDataProvider: noteExplorerProvider,
        showCollapseAll: true,
        dragAndDropController: noteExplorerProvider,
        canSelectMany: true
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
    // New commands
    const newNoteCommand = vscode.commands.registerCommand('yzc-note.newNote', async (uri?: vscode.Uri) => {
        const rootPath = noteExplorerProvider.getRootPath();
        if (!rootPath) {
            vscode.window.showErrorMessage('Please set a root folder first');
            return;
        }
        const targetDir = uri?.fsPath || rootPath;
        await createNewFile(targetDir, false, rootPath);
        noteExplorerProvider.refresh();
    });

    const newFolderCommand = vscode.commands.registerCommand('yzc-note.newFolder', async (uri?: vscode.Uri) => {
        const rootPath = noteExplorerProvider.getRootPath();
        if (!rootPath) {
            vscode.window.showErrorMessage('Please set a root folder first');
            return;
        }
        
        let targetDir = uri?.fsPath || rootPath;
        
        // Show folder selection
        const folders = await getSubfolders(rootPath);
        const folderItems = [
            { label: 'Root', description: rootPath },
            ...folders.map(folder => ({
                label: path.relative(rootPath, folder),
                description: folder
            }))
        ];

        const selected = await vscode.window.showQuickPick(folderItems, {
            placeHolder: 'Select where to create the new folder',
            title: 'Select Parent Folder'
        });

        if (selected) {
            targetDir = selected.description || targetDir;
            await createNewFile(targetDir, true);
            noteExplorerProvider.refresh();
        }
    });

    // Add rename and delete commands
    const renameItemCommand = vscode.commands.registerCommand('yzc-note.renameItem', async (item: NoteItem) => {
        if (!item || !item.resourceUri) { 
            vscode.window.showErrorMessage('No item selected to rename');
            return; 
        }
        
        try {
            const oldPath = item.resourceUri.fsPath;
            const isFile = item.type === 'file';
            const oldName = path.basename(oldPath, isFile ? '.md' : '');
            const dirName = path.dirname(oldPath);
            
            const newName = await vscode.window.showInputBox({
                value: oldName,
                prompt: `Enter new ${isFile ? 'note' : 'folder'} name`,
                validateInput: (value: string) => {
                    if (!value) { return 'Name cannot be empty'; }
                    if (value.includes('\\') || value.includes('/')) { return 'Name cannot contain slashes'; }
                    if (value === oldName) { return 'Please enter a new name'; }
                    
                    const newPath = path.join(dirName, isFile ? `${value}.md` : value);
                    if (fs.existsSync(newPath)) {
                        return 'A file or folder with this name already exists';
                    }
                    return null;
                }
            });
            
            if (!newName) { return; }
            
            const newPath = path.join(dirName, isFile ? `${newName}.md` : newName);
            
            // Close the file if it's open in the editor
            const openEditor = vscode.window.visibleTextEditors.find(
                editor => editor.document.uri.fsPath === oldPath
            );
            if (openEditor) {
                await vscode.window.showTextDocument(openEditor.document).then(
                    () => vscode.commands.executeCommand('workbench.action.closeActiveEditor')
                );
            }
            
            await vscode.workspace.fs.rename(
                vscode.Uri.file(oldPath),
                vscode.Uri.file(newPath),
                { overwrite: false }
            );
            
            noteExplorerProvider.refresh();
            vscode.window.showInformationMessage(`Successfully renamed to ${newName}`);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    
    const deleteItemCommand = vscode.commands.registerCommand('yzc-note.deleteItem', async (item: NoteItem) => {
        if (!item || !item.resourceUri) { 
            vscode.window.showErrorMessage('No item selected to delete');
            return; 
        }
        
        try {
            const isFile = item.type === 'file';
            const itemPath = item.resourceUri.fsPath;
            const itemName = path.basename(itemPath, isFile ? '.md' : '');
            
            // Close the file if it's open in the editor
            const openEditor = vscode.window.visibleTextEditors.find(
                editor => editor.document.uri.fsPath === itemPath
            );
            if (openEditor) {
                await vscode.window.showTextDocument(openEditor.document).then(
                    () => vscode.commands.executeCommand('workbench.action.closeActiveEditor')
                );
            }
            
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${isFile ? 'note' : 'folder'} '${itemName}'?`,
                { modal: true },
                'Delete', 'Cancel'
            );
            
            if (confirm !== 'Delete') { return; }
            
            await vscode.workspace.fs.delete(
                vscode.Uri.file(itemPath), 
                { 
                    recursive: true, 
                    useTrash: true 
                }
            );
            
            noteExplorerProvider.refresh();
            vscode.window.showInformationMessage(`Successfully deleted ${isFile ? 'note' : 'folder'}`);
            
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to delete: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    });


    const newSubFolder = vscode.commands.registerCommand('yzc-note.newSubfolder', async (item: NoteItem) => {
        if (!item || !item.resourceUri) { 
            vscode.window.showErrorMessage('No folder selected');
            return; 
        }

        const targetDir = item.resourceUri.fsPath;
        console.log("Folder Path", targetDir);
        await createNewFile(targetDir, true);
        noteExplorerProvider.refresh();

    });

    const newSubNote = vscode.commands.registerCommand('yzc-note.newSubNote', async (item: NoteItem) =>{
        const targetDir = item.resourceUri.fsPath;
        await createNewFile(targetDir, false);
        noteExplorerProvider.refresh();  

    });


    const moveNote = vscode.commands.registerCommand('yzc-note.moveNote', async (item: NoteItem) => {
        const rootPath = noteExplorerProvider.getRootPath();
        if (!rootPath) {
            vscode.window.showErrorMessage('No root path set');
            return;
        }
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

        const itemPath = item.resourceUri.fsPath;
        console.log("Item Path", itemPath);
        const itemName = path.basename(itemPath);
        const targetPath = path.join(selected?.description || rootPath, itemName);
        console.log("Target Path", targetPath);

        try {
            await fs.promises.rename(itemPath, targetPath);
            noteExplorerProvider.refresh();
            vscode.window.showInformationMessage('Note moved successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to move note: ${error}`);
        }        
    });

    // Add commands to subscriptions
    context.subscriptions.push(
        treeView,
        setRootFolderCommand,
        refreshCommand,
        openMarkdownCommand,
        newNoteCommand,
        newFolderCommand,
        renameItemCommand,
        deleteItemCommand,
        newSubFolder,
        newSubNote,
        moveNote
    );

    // Initialize with saved root path if exists
    const rootPath = context.globalState.get('rootPath');
    if (rootPath) {
        await noteExplorerProvider.setRootPath(rootPath as string);
    } else {
        await vscode.commands.executeCommand('setContext', 'yzc-note:hasRootFolder', false);
    }
}

export function deactivate() {}

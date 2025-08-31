import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NoteExplorerProvider, NoteItem, createNewFile, getSubfolders, moveCurrentNoteToFolder } from './noteExplorer';

export function registerCommands(context: vscode.ExtensionContext, noteExplorerProvider: NoteExplorerProvider) {
    // Set root folder command
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

    // Refresh command
    const refreshCommand = vscode.commands.registerCommand('yzc-note.refresh', () => {
        noteExplorerProvider.refresh();
    });

    // Open markdown command
    const openMarkdownCommand = vscode.commands.registerCommand('yzc-note.openMarkdown', (uri: vscode.Uri) => {
        if (uri) {
            vscode.commands.executeCommand('milkdown.open', uri);
        }
    });

    // New note command
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

    // New folder command
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

    // Rename item command
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
    
    // Delete item command
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

    // New subfolder command
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

    // New subnote command
    const newSubNote = vscode.commands.registerCommand('yzc-note.newSubNote', async (item: NoteItem) => {
        if (!item || !item.resourceUri) {
            vscode.window.showErrorMessage('No folder selected');
            return;
        }
        const targetDir = item.resourceUri.fsPath;
        await createNewFile(targetDir, false);
        noteExplorerProvider.refresh();
    });

    // Move note command
    const moveNote = vscode.commands.registerCommand('yzc-note.moveNote', async (item: NoteItem) => {
        const rootPath = noteExplorerProvider.getRootPath();
        if (!rootPath) {
            vscode.window.showErrorMessage('No root path set');
            return;
        }
        const itemPath = item.resourceUri.fsPath;
        await moveCurrentNoteToFolder(itemPath, rootPath);
        noteExplorerProvider.refresh();
    });

    // Move current note command
    const moveCurrentNote = vscode.commands.registerCommand('yzc-note.moveCurrentNote', async () => {
        try {
            console.log("[YZC-NOTE] Move current note command triggered");
            const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
            const tabInput = tab?.input as { uri: vscode.Uri } | undefined;
            if (!tabInput?.uri) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const currentFilePath = tabInput.uri.fsPath;
            console.log("Current File Path", currentFilePath);

            const rootPath = noteExplorerProvider.getRootPath();
            if (!rootPath) {
                vscode.window.showErrorMessage('No root path set');
                return;
            }
            
            const targetPath = await moveCurrentNoteToFolder(currentFilePath, rootPath);
            if (!targetPath) {
                return; // User cancelled the operation
            }

            if (tab) {
                await vscode.window.tabGroups.close(tab, true);
                await vscode.commands.executeCommand('milkdown.open', vscode.Uri.file(targetPath));
            }
            
            noteExplorerProvider.refresh();

        } catch (error) {
            console.error("[YZC-NOTE] Error in moveCurrentNote:", error);
        }
    });

    // Add all commands to subscriptions
    context.subscriptions.push(
        setRootFolderCommand,
        refreshCommand,
        openMarkdownCommand,
        newNoteCommand,
        newFolderCommand,
        renameItemCommand,
        deleteItemCommand,
        newSubFolder,
        newSubNote,
        moveNote,
        moveCurrentNote
    );
}

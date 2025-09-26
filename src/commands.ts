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
            vscode.commands.executeCommand('markdown-editor.openEditor', uri);
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

    

    const openLink = vscode.commands.registerCommand('yzc-note.openLink', async (url: string) => {
        console.log("Open Link", url);
        const rootPath = noteExplorerProvider.getRootPath();
        if (!rootPath) {
            vscode.window.showErrorMessage('No root path set');
            return;
        }
    
        try {
            async function findAndOpenFile(dir: string): Promise<boolean> {
                const files = await fs.promises.readdir(dir, { withFileTypes: true });
                
                for (const file of files) {
                    const fullPath = path.join(dir, file.name);
                    
                    if (file.isDirectory()) {
                        // Recursively search in subdirectories
                        const found = await findAndOpenFile(fullPath);
                        if (found) {return true; };
                    } else if (file.name.includes(url)) {
                        // Found a matching file, open it and return true
                        await vscode.commands.executeCommand('milkdown.open', vscode.Uri.file(fullPath));
                        return true;
                    }
                }
                
                return false; // No match found in this directory
            }
            
            const rusult = await findAndOpenFile(rootPath);
            if (!rusult) {
                vscode.window.showInformationMessage(`No file containing the URL was found.`);
            }
        } catch (error) {
            console.error('Error searching for URL:', error);
            vscode.window.showErrorMessage('An error occurred while searching for the URL');
        }
    });


    async function findMarkdownFiles(dir: string): Promise<string[]> {
        const files: string[] = [];
        const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const dirent of dirents) {
            const fullPath = path.join(dir, dirent.name);
            
            // Skip node_modules and other hidden directories
            if (dirent.isDirectory() && !dirent.name.startsWith('.') && dirent.name !== 'node_modules') {
                const subFiles = await findMarkdownFiles(fullPath);
                files.push(...subFiles);
            } else if (dirent.isFile() && dirent.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }
        
        return files;
    }

    const insertLink = vscode.commands.registerCommand('yzc-note.insertLink', async () => {
        const rootPath = noteExplorerProvider.getRootPath();
        if (!rootPath) {
            vscode.window.showErrorMessage('No root folder is set. Please set a root folder first.');
            return;
        }

        try {
            const timeSuffixRegex = /^(.+)_(\d{10,13})\.md$/;
            const allFiles = await findMarkdownFiles(rootPath);
            
            const matchedFiles = allFiles
                .map(filePath => {
                    const fileName = path.basename(filePath);
                    const match = fileName.match(timeSuffixRegex);
                    if (match && match[1] && match[2]) {
                        return {
                            label: match[1], // Display name without timestamp
                            description: `Last modified: ${new Date(parseInt(match[2])).toLocaleString()}`,
                            detail: filePath,
                            timestamp: match[2]
                        };
                    }
                    return null;
                })
                .filter((file): file is NonNullable<typeof file> => file !== null);

            if (matchedFiles.length === 0) {
                vscode.window.showInformationMessage('No matching markdown files found.');
                return;
            }

            // Sort by timestamp in descending order (newest first)
            matchedFiles.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

            // Show quick pick to select a file
            const selected = await vscode.window.showQuickPick(matchedFiles, {
                placeHolder: 'Select a note to link to',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                // Get the active text editor
                const relativePath = path.relative(rootPath, selected.detail);
                const linkText = `[${selected.label}](/${relativePath.replace(/\\/g, '/')})`;
                vscode.commands.executeCommand('milkdown.insertText', linkText);
            }
        } catch (error) {
            console.error('Error finding markdown files:', error);
            vscode.window.showErrorMessage('An error occurred while searching for markdown files');
        }
    });


    const quickOpenNoteCommand = vscode.commands.registerCommand('yzc-note.quickOpenNote', async () => {
        const rootPath = noteExplorerProvider.getRootPath();
        if (!rootPath) {
            vscode.window.showErrorMessage('Please set a root folder first');
            return;
        }

        // Get all markdown files in the root directory recursively
        const files: string[] = [];
        const findMarkdownFiles = (dir: string) => {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    findMarkdownFiles(fullPath);
                } else if (item.isFile() && item.name.endsWith('.md')) {
                    files.push(fullPath);
                }
            }
        };

        try {
            findMarkdownFiles(rootPath);

            if (files.length === 0) {
                vscode.window.showInformationMessage('No markdown notes found in the repository');
                return;
            }

            // Create quick pick items with relative paths
            const items = files.map(file => ({
                label: path.basename(file, '.md'),
                description: path.relative(rootPath, path.dirname(file)) || 'Root',
                detail: file,
                uri: vscode.Uri.file(file)
            }));

            // Show quick pick with search functionality
            const selected = await vscode.window.showQuickPick(items, {
                matchOnDescription: true,
                matchOnDetail: true,
                placeHolder: 'Search for a note to open',
                title: 'Quick Open Note'
            });

            if (selected) {
                await vscode.commands.executeCommand('milkdown.open', selected.uri);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error searching for notes: ${error instanceof Error ? error.message : String(error)}`);
        }
    });


    const askAIQuestionCommand = vscode.commands.registerCommand('yzc-note.askAIQuestion', async () => {
        const text = await vscode.commands.executeCommand('milkdown.getSelection');
        if (!text) {
            vscode.window.showInformationMessage('No text selected');
            return;
        };

        console.log("Selected Text", text);

        const response = await vscode.window.showInputBox({
            prompt: 'Ask AI Question',
            ignoreFocusOut: true,
        });

        if (!response) {
            vscode.window.showInformationMessage('No question asked');
            return;
        }
        
        console.log("Question", response);
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
        moveCurrentNote,
        insertLink,
        quickOpenNoteCommand
    );
}

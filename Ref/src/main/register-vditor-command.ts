
import * as vscode from 'vscode';



export function registerCommand(viewType: string): void {


    vscode.commands.registerCommand(
        'vditor.open',
        (uri: vscode.Uri | undefined = vscode.window.activeTextEditor?.document.uri) => {
            if (!uri) {
                // cannot get url
                return;
            }

            vscode.commands.executeCommand('vscode.openWith', uri, viewType);
        },
    );

}


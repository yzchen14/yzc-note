import * as vscode from 'vscode';
import { join } from 'path';
import { getNonce } from './get-nonce';
import {registerCommand } from './register-vditor-command';


function getHtmlTemplateForWebView(webview: vscode.Webview, extensionUri: vscode.Uri){
    const getMediaUri = (fileName: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', fileName));

    const scriptUri = getMediaUri('view_vidtor.global.js');
    const styleUri = getMediaUri('style.css');
    const nonce = getNonce();

    return /* html */ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet" />
				<title>Milkdown</title>
			</head>
			<body>
                <div id="app"></div>

                <script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
}



export class VditorEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'vditor.editor';
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        registerCommand(VditorEditorProvider.viewType);
        const provider = new VditorEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            VditorEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
            },
        );
        return providerRegistration;
    }
    private static getHtmlForWebview(context: vscode.ExtensionContext, webview: vscode.Webview): string {
        return getHtmlTemplateForWebView(webview, context.extensionUri);
    }


    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
    ): Promise<void> {
        webviewPanel.webview.options = { enableScripts: true };
        webviewPanel.webview.html = VditorEditorProvider.getHtmlForWebview(this.context, webviewPanel.webview);
        }

    

}
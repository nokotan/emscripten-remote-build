// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { showPreview } from './previewProvider';
import { CustomBuildTaskProvider } from './taskProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "emscripten-remote-build" is now active!');

	const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
	if (!workspaceRoot) {
		return;
	}

	const disposable = vscode.tasks.registerTaskProvider("emcc", new CustomBuildTaskProvider(workspaceRoot));

	context.subscriptions.push(disposable);

	context.subscriptions.push(
		vscode.commands.registerCommand("emcc.preview.show", (selectedFile) => {
			if (selectedFile instanceof vscode.Uri) {
				showPreview(workspaceRoot, selectedFile);
			}
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}

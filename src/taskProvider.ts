import path = require('path');
import * as vscode from 'vscode';
import { File, FileType } from './wasm-studio/models';
import { Language, Service } from './wasm-studio/service';

interface EmscriptenBuildTaskDefinition extends vscode.TaskDefinition {
    /**
     * The task name
     */
    flags: string[];
  }

export class CustomBuildTaskProvider implements vscode.TaskProvider {
	static CustomBuildScriptType = 'emcc';
	private tasks: vscode.Task[] | undefined;

	// We use a CustomExecution task when state needs to be shared across runs of the task or when 
	// the task requires use of some VS Code API to run.
	// If you don't need to share state between runs and if you don't need to execute VS Code API in your task, 
	// then a simple ShellExecution or ProcessExecution should be enough.
	// Since our build has this shared state, the CustomExecution is used below.
	private sharedState: string | undefined;

	constructor(private workspaceRoot: string) { }

	public async provideTasks(): Promise<vscode.Task[]> {
		return this.getTasks();
	}

	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		const definition: EmscriptenBuildTaskDefinition = <any>_task.definition;
		return this.getTask(definition.flavor, definition.flags ? definition.flags : [], definition);
	}

	private getTasks(): vscode.Task[] {
		if (this.tasks !== undefined) {
			return this.tasks;
		}
		// In our fictional build, we have two build flavors
		const flavors: string[] = ['32', '64'];
		// Each flavor can have some options.
		const flags: string[][] = [['watch', 'incremental'], ['incremental'], []];

		this.tasks = [];
		flavors.forEach(flavor => {
			flags.forEach(flagGroup => {
				this.tasks!.push(this.getTask(flavor, flagGroup));
			});
		});
		return this.tasks;
	}

	private getTask(flavor: string, flags: string[], definition?: EmscriptenBuildTaskDefinition): vscode.Task {
		if (definition === undefined) {
			definition = {
                type: "emcc",
				flags: []
			};
		}
		return new vscode.Task(definition, vscode.TaskScope.Workspace, `${flavor} ${flags.join(' ')}`,
			CustomBuildTaskProvider.CustomBuildScriptType, new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
				// When the task is executed, this callback will run. Here, we setup for running the task.
				return new CustomBuildTaskTerminal(this.workspaceRoot, flavor, flags, () => this.sharedState, (state: string) => this.sharedState = state);
			}));
	}
}

class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
	private writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	private closeEmitter = new vscode.EventEmitter<number>();
	onDidClose?: vscode.Event<number> = this.closeEmitter.event;

	private fileWatcher: vscode.FileSystemWatcher | undefined;

	constructor(private workspaceRoot: string, private flavor: string, private flags: string[], private getSharedState: () => string | undefined, private setSharedState: (state: string) => void) {
	}

	open(initialDimensions: vscode.TerminalDimensions | undefined): void {
		// At this point we can start using the terminal.
		if (this.flags.indexOf('watch') > -1) {
			const pattern = path.join(this.workspaceRoot, 'customBuildFile');
			this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
			this.fileWatcher.onDidChange(() => this.doBuild());
			this.fileWatcher.onDidCreate(() => this.doBuild());
			this.fileWatcher.onDidDelete(() => this.doBuild());
		}
		this.doBuild();
	}

	close(): void {
		// The terminal has been closed. Shutdown the build.
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
		}
	}

	private async doBuild(): Promise<void> {
		this.writeEmitter.fire('Starting build...\r\n');
        const fileURLs = await vscode.workspace.findFiles("**/*.cpp");

        const filePromises = fileURLs.map(async url => {
            const content = await vscode.workspace.fs.readFile(url);
            const text = content.toLocaleString();
            const file = new File(url.toString(), FileType.Cpp);
            file.setData(text);
            return file;
        });

        const files = await Promise.all(filePromises);

        const outputs = await Service.compileFiles(files, Language.Cpp, Language.Wasm, this.flags.join(" "));

		await vscode.workspace.fs.writeFile(vscode.Uri.file(`${this.workspaceRoot}/main.wasm`), new Uint8Array(outputs["a.wasm"] as ArrayBuffer));
			
		this.writeEmitter.fire('Finish.\r\n');
	}
}

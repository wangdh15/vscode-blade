// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { QuickPickOptions } from 'vscode';
import { QuickPickItem } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Terminal } from 'vscode';

interface Target {
	parentDir: string;
	name: string;
};

interface TargetPickType extends QuickPickItem {
	parentDir: string;
};
// import { parse } from './libs/python-parser';
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let channel = vscode.window.createOutputChannel("Blade");

	channel.appendLine('Congratulations, your extension "blade" is now active!');

	let targetPickItems: Array<TargetPickType> = new Array();

	const allTargetType: Array<string> = ["library", "executable", "test", "proto"];
	let allTargets: Map<string, Array<Target>> = new Map();

	// initialize the terminal
	let terminal = startNewTerminal();

	const folders = vscode.workspace.workspaceFolders;
	let projectRootPath: string ;

	if (!folders) {
		vscode.window.showErrorMessage("workspaceFolder is undefined!");
		projectRootPath = "";
	} else {
		projectRootPath = folders[0].uri.fsPath;
		terminal.sendText('cd ' + projectRootPath);
	}

	function startNewTerminal() {
		let terminal = vscode.window.createTerminal();
		let commands = vscode.workspace.getConfiguration("BLADE").get<Array<string>>("CommandsWhenStartNewTerminal");
		if (commands) {
			for (const command of commands) {
				terminal.sendText(command);
			}
		}
		return terminal;
	}

	function checkAndSendText(content: string) {
		console.log(terminal.exitStatus);
		if (terminal.exitStatus !== undefined) {
			terminal = startNewTerminal();	
		}
		if (folders) {
			terminal.sendText('cd ' + folders[0].uri.fsPath);
		}
		terminal.sendText(content);
		terminal.show();
	}

	const selecTargetQuickPickOptions: QuickPickOptions = {
		matchOnDescription: true,
		matchOnDetail: true,
		ignoreFocusOut: true,
		placeHolder: "Select the default build target"
	};

	let currentSelectTarget: TargetPickType;


    interface DumpStruct {
		allTarget: string;
		selectTarget: TargetPickType;
	};

	function getParentDir(uri: vscode.Uri):string {
		const relativePath = vscode.workspace.asRelativePath(uri);
		let parentDir = path.dirname(relativePath);
		if (parentDir === '.') {
			parentDir = '';
		}
		return parentDir;	
	}

	function getAllTarget() {
		allTargets.clear();
		targetPickItems = [];
		for (const type of allTargetType) {
			allTargets.set(type, []);
		}
		channel.show();
		vscode.workspace.findFiles("**/BUILD", "**/build64_release/**").then((uris) => {
			let cnt = 0;
			const allCnt = uris.length;
			for (const uri of uris) {
				vscode.workspace.fs.readFile(uri).then((data) => {
					const content: string = data.toString();
					const rows: string[] = content.split('\n');
					let parentDir = getParentDir(uri);
					let targetType: string = "";
					let targetName: string = "";
					for (const row of rows) {
						if (row.includes("cc_library")) {
							targetType = "library";
						} else if (row.includes("cc_binary")) {
							targetType = "executable";
						} else if (row.includes("cc_test")) {
							targetType = "test";
						} else if (row.includes("proto_library")) {
							targetType = "proto";
						}
						else if (row.includes("name")) { 
							const tmpArr: string[] = row.split("=");
							var tmp: string = tmpArr[tmpArr.length - 1];
							targetName = tmp.split(",")[0].trim();
							targetName = targetName.substring(1, targetName.length - 1);
							let tmpVec = allTargets.get(targetType);
							if (!tmpVec){
								channel.appendLine("unknown target type: " +  targetType +  ", ignore it");
							} else {
								channel.appendLine("find target: "  + parentDir + ":" + targetName);
								tmpVec.push({
									parentDir: parentDir,
									name: targetName 
								});
								targetPickItems.push({
									label: targetName,
									description: targetType,
									parentDir:  parentDir
								});
							}
						}
					}
					cnt += 1;
					if (cnt === allCnt) {
						dumpAnalysisResult();
					}
				});
			}
		});
	}


	function checkCurrentTarget(toRun: Boolean): Boolean {
		if (!currentSelectTarget) {
			vscode.window.showErrorMessage("please select target first!");
			return false;
		}
		if (toRun) {
			if (currentSelectTarget.description !== "executable" && currentSelectTarget.description !== "test") {
				vscode.window.showErrorMessage("the type of target " + currentSelectTarget.label + " is " + currentSelectTarget.description + ". you can't run it!");
				return false;
			}
		}
		return true;
	}

	const selectTarget = () => {
		vscode.window.showQuickPick(targetPickItems, selecTargetQuickPickOptions).then(select => {
			if (select) {
				channel.appendLine("select target: " + select.label);
				currentSelectTarget = select;
				selectedTargetBarHandler.text = "[" + select.label + "]";
				dumpAnalysisResult();
			} else {
				channel.appendLine("select is undefined");
			}
		});
	};

	const buildTarget = () => {
		if (!checkCurrentTarget(false)) {
			return;
		}
		let cmdStr: string = "";
		const cpuNum = vscode.workspace.getConfiguration("BLADE").get<number>("CPUNumber");
		const commandPrefix = vscode.workspace.getConfiguration("BLADE").get<Array<string>>("CommandPrefix");
		if (commandPrefix)	 {
			for (const xx of commandPrefix) {
				cmdStr += xx;
				cmdStr += " ";
			}
		}
		let targetFullPath: string =  currentSelectTarget.parentDir + ":" + currentSelectTarget.label;
		if (currentSelectTarget.description === "test") {
			cmdStr += "blade test -j "  + cpuNum + " " + targetFullPath;
		} else {
			 cmdStr += 'blade build --generate-dynamic -j ' + cpuNum + " " + targetFullPath; 
		}
		checkAndSendText(cmdStr);
	};

	const runTarget = () => {
		if (!checkCurrentTarget(true)) {
			return; 
		}
		buildTarget();
		let tmpp: string;
		if (currentSelectTarget.parentDir === '') {
			tmpp = "/";
		} else {
			tmpp = "/" + currentSelectTarget.parentDir + "/";
		}
		checkAndSendText("build64_release" + tmpp + currentSelectTarget.label);
	};

	const cleanAllTarget = () => {
		checkAndSendText("rm -rf build64_release");
		checkAndSendText("rm -rf  blade-bin");
	};

	const runAllTest = ()=> {
		let oddSelectTarget = currentSelectTarget;
		currentSelectTarget = {
			label: "",
			parentDir: "",
			description: "test"	
		};
		let	allTestTargets = allTargets.get("test");
		if (!allTestTargets) {
			return;
		}
		currentSelectTarget.description = "test";
		for (const target of allTestTargets ) {
			currentSelectTarget.label = target.name;
			currentSelectTarget.parentDir = target.parentDir;
			buildTarget();
		}
		currentSelectTarget = oddSelectTarget;
	};


	const configProjId = 'blade.configProject';
	const selectTargetId = 'blade.selectTarget';
	const buildTargetId = 'blade.buildTarget';
	const runTargetId = 'blade.runTarget';
	const cleanId = 'blade.clean';
	const runAllTestId = 'blade.runAllTest';
	const dumpCompDB = 'blade.dumpComDB';

	const analysisProj = () => {
			channel.clear();
			readAndParseAnalysisHistory();
			channel.appendLine('Analysis Project!');
			getAllTarget();
			if (vscode.workspace.getConfiguration("BLADE").get<boolean>("DumpCompileDB")) {
				checkAndSendText("blade dump --compdb --to-file  compile_commands.json");
			}
	};

	function dumpAnalysisResult() {
			// Create the folder if it doesn't exist
			const folderPath = path.join(projectRootPath, ".blade");
    		if (!fs.existsSync(folderPath)) {
        		fs.mkdirSync(folderPath, { recursive: true });
    		}
			const analysisHistory = path.join(folderPath, "analysis_history.json");
			console.log(allTargets);
			console.log(JSON.stringify(allTargets));
			let dumpStruct: DumpStruct = {
				allTarget: "",
				selectTarget: currentSelectTarget
			};

			dumpStruct.allTarget = JSON.stringify(Array.from(allTargets.entries()));
			console.log(dumpStruct);

			const jsonContent = JSON.stringify(dumpStruct, null, 4);
			fs.writeFileSync(analysisHistory, jsonContent);
			channel.appendLine("write the analysis result to disk");
			channel.appendLine(jsonContent);
	}

	function readAndParseAnalysisHistory(): boolean {
		const analysisHistory = path.join(projectRootPath, ".blade", "analysis_history.json");
		if (!fs.existsSync(analysisHistory)) {
			return false;
		} 
		const fileContent = fs.readFileSync(analysisHistory, 'utf-8');
		const parsedContent = JSON.parse(fileContent);
		allTargets = new Map<string, Array<Target>>(JSON.parse(parsedContent.allTarget));
		currentSelectTarget = parsedContent.selectTarget;
		console.log(allTargets);
		console.log(currentSelectTarget);
		targetPickItems = [];
		for (const [key, val] of allTargets) {
			console.log(val);
			for (const xx of val) {
				console.log(xx);
				targetPickItems.push({
					label: xx.name,
					description: key,
					parentDir: xx.parentDir 
				});
			}
		}
		console.log(targetPickItems);
		selectedTargetBarHandler.text = "[" + currentSelectTarget.label + "]";
		return true;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(configProjId, analysisProj));

	context.subscriptions.push(vscode.commands.registerCommand(selectTargetId, () => {
		channel.appendLine('Select Target To Build Or Run');
		selectTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(buildTargetId, () => {
		channel.appendLine("Build Target!");
		buildTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(runTargetId, () => {
		channel.appendLine("Run Target!");
		runTarget();
	}));

	context.subscriptions.push(vscode.commands.registerCommand(cleanId, () => {
		channel.appendLine("Clean Project");
		cleanAllTarget();
	}));
	// context.subscriptions.push(vscode.commands.registerCommand(runAllTestId, () => {
	// 	channel.appendLine("Run All Unit Test!");
	// 	runAllTest();
	// }));
	context.subscriptions.push(vscode.commands.registerCommand(dumpCompDB, ()=> {
		channel.appendLine("dump compilation database!");
		checkAndSendText("blade dump --compdb --to-file  compile_commands.json");
	}));

	let addStatusBarItem = (command: string, text: string, icon: string, tips: string) => {
		let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		myStatusBarItem.command = command;
		if (icon === "") {
			myStatusBarItem.text = text;
		} else {
			myStatusBarItem.text = "$(" + icon + ") "  + text;
		}
		myStatusBarItem.tooltip = tips;
		myStatusBarItem.show();
		context.subscriptions.push(myStatusBarItem);
		return myStatusBarItem;
	};

	addStatusBarItem(configProjId, "Analyse", "tools", "analyse whole project");
	let selectedTargetBarHandler = 	addStatusBarItem(selectTargetId, "[NoSelect]", "", "select target to build");
	if (!readAndParseAnalysisHistory()) {
		analysisProj();
	}
	addStatusBarItem(buildTargetId, "Build", "gear", "build the target");
	addStatusBarItem(runTargetId, "", "run", "run the target");
	addStatusBarItem(cleanId, "", "clear-all", "clean the project");
	// addStatusBarItem(runAllTestId, "", "run-all");
}

// This method is called when your extension is deactivated
export function deactivate() { }

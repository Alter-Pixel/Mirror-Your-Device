"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util = __importStar(require("util"));
const execAsync = util.promisify(child_process_1.exec);
// Rate notification constants
const RATE_URL = 'https://marketplace.visualstudio.com/items?itemName=AlterPixel.mirror-your-device&ssr=false#review-details';
const INSTALL_DATE_KEY = 'mirrorYourDevice.installDate';
const FIRST_COMMAND_EXECUTED_KEY = 'mirrorYourDevice.firstCommandExecuted';
const RATE_NOTIFICATION_INSTALL_SHOWN_KEY = 'mirrorYourDevice.rateNotificationInstallShown';
const RATE_NOTIFICATION_COMMAND_SHOWN_KEY = 'mirrorYourDevice.rateNotificationCommandShown';
const USER_DECISION_KEY = 'mirrorYourDevice.userDecision';
// Rate notification functions
async function showRateNotification(context, reason) {
    const config = vscode.workspace.getConfiguration();
    const rateEnabled = config.get('mirrorYourDevice.rateNotification.enabled', true);
    if (!rateEnabled) {
        return;
    }
    // Check if user already made a decision
    const userDecision = context.globalState.get(USER_DECISION_KEY);
    if (userDecision === 'never' || userDecision === 'rated') {
        return;
    }
    // Check if this specific notification was already shown
    const notificationKey = reason === 'install' ? RATE_NOTIFICATION_INSTALL_SHOWN_KEY : RATE_NOTIFICATION_COMMAND_SHOWN_KEY;
    const alreadyShown = context.globalState.get(notificationKey, false);
    if (alreadyShown) {
        return;
    }
    const message = reason === 'install'
        ? '🌟 Enjoying Mirror Your Device? Help others discover it by leaving a review!'
        : '🎉 Great! You just mirrored your first device! If you found this extension helpful, please consider rating it.';
    const rateNow = 'Rate Now ⭐';
    const later = 'Later';
    const never = "Don't Ask Again";
    const choice = await vscode.window.showInformationMessage(message, rateNow, later, never);
    if (choice === rateNow) {
        await context.globalState.update(USER_DECISION_KEY, 'rated');
        await vscode.env.openExternal(vscode.Uri.parse(RATE_URL));
    }
    else if (choice === never) {
        await context.globalState.update(USER_DECISION_KEY, 'never');
    }
    // Mark this notification as shown
    await context.globalState.update(notificationKey, true);
}
async function checkInstallDateNotification(context) {
    const config = vscode.workspace.getConfiguration();
    const daysAfterInstall = config.get('mirrorYourDevice.rateNotification.daysAfterInstall', 7);
    // Get or set install date
    let installDate = context.globalState.get(INSTALL_DATE_KEY);
    if (!installDate) {
        installDate = Date.now();
        await context.globalState.update(INSTALL_DATE_KEY, installDate);
        return; // Don't show notification on first install
    }
    // Check if enough days have passed
    const daysPassed = (Date.now() - installDate) / (1000 * 60 * 60 * 24);
    if (daysPassed >= daysAfterInstall) {
        await showRateNotification(context, 'install');
    }
}
async function checkFirstCommandNotification(context) {
    const config = vscode.workspace.getConfiguration();
    const showAfterFirstCommand = config.get('mirrorYourDevice.rateNotification.showAfterFirstCommand', true);
    if (!showAfterFirstCommand) {
        return;
    }
    const firstCommandExecuted = context.globalState.get(FIRST_COMMAND_EXECUTED_KEY, false);
    if (!firstCommandExecuted) {
        await context.globalState.update(FIRST_COMMAND_EXECUTED_KEY, true);
        // Show notification after a short delay to let the command complete
        setTimeout(() => {
            showRateNotification(context, 'firstCommand');
        }, 2000);
    }
}
async function listAdbDevices(adbPath, filterStatus) {
    try {
        const { stdout } = await execAsync(`${adbPath} devices -l`);
        const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const devices = [];
        for (const line of lines) {
            if (/^List of devices attached/.test(line))
                continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                const id = parts[0];
                const status = parts[1];
                if (filterStatus && status !== 'device')
                    continue;
                let transportId;
                const transportMatch = line.match(/transport_id:(\d+)/);
                if (transportMatch)
                    transportId = transportMatch[1];
                devices.push({ id, status, raw: line, transportId });
            }
        }
        return devices;
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to run adb: ${errorMessage}`);
        return [];
    }
}
let outputChannel;
async function binaryExists(cmd) {
    try {
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        await execAsync(`${whichCmd} ${cmd}`);
        return true;
    }
    catch {
        return false;
    }
}
async function checkDependencies(adbPath, scrcpyPath) {
    const adbOk = await binaryExists(adbPath);
    const scrcpyOk = await binaryExists(scrcpyPath);
    return { adb: adbOk, scrcpy: scrcpyOk };
}
async function showDependencyFeedback(adbOk, scrcpyOk) {
    if (!outputChannel)
        outputChannel = vscode.window.createOutputChannel('Mirror Your Device');
    outputChannel.appendLine('[CHECK] Dependency status:');
    outputChannel.appendLine(` - adb: ${adbOk ? 'OK' : 'MISSING'}`);
    outputChannel.appendLine(` - scrcpy: ${scrcpyOk ? 'OK' : 'MISSING'}`);
    if (adbOk && scrcpyOk) {
        vscode.window.setStatusBarMessage('Mirror Your Device: adb & scrcpy detected ✔', 4000);
        return;
    }
    const missing = [];
    if (!adbOk)
        missing.push('adb');
    if (!scrcpyOk)
        missing.push('scrcpy');
    const msg = `Missing: ${missing.join(', ')}. Open instructions?`;
    const open = 'Instructions';
    const choice = await vscode.window.showWarningMessage(msg, open);
    if (choice === open) {
        const docs = `# Install instructions\n\n## adb\n- Android Platform Tools: https://developer.android.com/tools/releases/platform-tools\n  - Extract and add folder to PATH.\n\n## scrcpy\n- Windows (Scoop): scoop install scrcpy\n- Windows (Chocolatey): choco install scrcpy\n- Windows (Winget): winget install scrcpy.scrcpy\n- macOS (Homebrew): brew install scrcpy\n- Linux (Debian/Ubuntu): apt install scrcpy (repo may be outdated) or use latest build instructions: https://github.com/Genymobile/scrcpy#linux\n\nAfter install, ensure both commands run in a terminal: \n  adb --version\n  scrcpy --version`;
        outputChannel.appendLine('\n[INSTRUCTIONS]\n' + docs);
        outputChannel.show(true);
    }
}
async function runScrcpy(scrcpyPath, deviceId, statusItem) {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Mirror Your Device');
    }
    statusItem.text = `$(device-camera) scrcpy ${deviceId}: starting`;
    statusItem.show();
    const args = ['-s', deviceId];
    outputChannel.appendLine(`[CMD] ${scrcpyPath} ${args.join(' ')}`);
    try {
        const proc = (0, child_process_1.spawn)(scrcpyPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.stdout?.on('data', (d) => outputChannel?.append(d.toString()));
        proc.stderr?.on('data', (d) => outputChannel?.append(d.toString()));
        proc.on('close', code => {
            outputChannel?.appendLine(`\n[EXIT] scrcpy(${deviceId}) code=${code}`);
        });
        statusItem.text = `$(device-camera) scrcpy ${deviceId}: running`;
        setTimeout(() => { if (statusItem.text.includes(deviceId))
            statusItem.hide(); }, 5000);
    }
    catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        statusItem.text = `$(error) scrcpy failed`;
        outputChannel.appendLine(`[ERROR] ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to start scrcpy: ${errorMessage}`);
        setTimeout(() => statusItem.hide(), 4000);
    }
}
function activate(context) {
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.command = 'scrcpy.mirrorDevice';
    statusItem.text = '$(device-camera) Scrcpy';
    statusItem.tooltip = 'Run scrcpy for a device';
    context.subscriptions.push(statusItem);
    // Check for install date notification on startup
    checkInstallDateNotification(context);
    // Dependency check on startup (once per session)
    const config = vscode.workspace.getConfiguration();
    const showCheck = config.get('scrcpy.showDependencyCheckOnStartup', true);
    if (showCheck) {
        const adbPath = config.get('scrcpy.adbPath', 'adb');
        const scrcpyPath = config.get('scrcpy.scrcpyPath', 'scrcpy');
        checkDependencies(adbPath, scrcpyPath).then(r => {
            showDependencyFeedback(r.adb, r.scrcpy);
        });
    }
    const disposable = vscode.commands.registerCommand('scrcpy.mirrorDevice', async () => {
        const config = vscode.workspace.getConfiguration();
        const adbPath = config.get('scrcpy.adbPath', 'adb');
        const scrcpyPath = config.get('scrcpy.scrcpyPath', 'scrcpy');
        const filterStatus = config.get('scrcpy.filterStatus', true);
        const loading = vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Fetching devices from adb...' }, async () => {
            const devices = await listAdbDevices(adbPath, filterStatus);
            if (!devices.length) {
                vscode.window.showWarningMessage('No devices available.');
                return;
            }
            const pick = await vscode.window.showQuickPick(devices.map(d => ({
                label: d.id,
                description: d.status,
                detail: d.raw
            })), { placeHolder: 'Select a device to run scrcpy' });
            if (!pick)
                return;
            await runScrcpy(scrcpyPath, pick.label, statusItem);
            // Check for first command notification
            await checkFirstCommandNotification(context);
        });
        await loading;
    });
    context.subscriptions.push(disposable);
    const depCmd = vscode.commands.registerCommand('scrcpy.checkDependencies', async () => {
        const cfg = vscode.workspace.getConfiguration();
        const adbPath = cfg.get('scrcpy.adbPath', 'adb');
        const scrcpyPath = cfg.get('scrcpy.scrcpyPath', 'scrcpy');
        const { adb, scrcpy } = await checkDependencies(adbPath, scrcpyPath);
        await showDependencyFeedback(adb, scrcpy);
    });
    context.subscriptions.push(depCmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
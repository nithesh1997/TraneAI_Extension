/**
 * ProcessManager provides utilities to inspect and terminate local processes.
 * It supports killing process trees and identifying processes bound to ports,
 * which is useful for managing development servers launched by workflows.
 */
import { exec, execSync } from 'child_process';

export class ProcessManager {
	public static findChildProcesses(parentPid: number): number[] {
		const children: number[] = [];
		try {
			if (process.platform === 'win32') {
				const result = execSync(`wmic process where "ParentProcessId=${parentPid}" get ProcessId`, { encoding: 'utf8' });
				const lines = result.split('\n');
				for (const line of lines) {
					const pid = parseInt(line.trim());
					if (!isNaN(pid) && pid !== parentPid) {
						children.push(pid);
					}
				}
			} else {
				const result = execSync(`ps -o pid --no-headers --ppid ${parentPid}`, { encoding: 'utf8' });
				const lines = result.split('\n');
				for (const line of lines) {
					const pid = parseInt(line.trim());
					if (!isNaN(pid) && pid !== parentPid) {
						children.push(pid);
						children.push(...this.findChildProcesses(pid));
					}
				}
			}
		} catch (error) {
			// Ignore errors - process might already be dead
		}
		return children;
	}

	public static killProcessTree(pid: number, log?: (msg: string) => void) {
		try {
			if (process.platform === 'win32') {
				exec(`taskkill /PID ${pid} /T /F`);
			} else {
				const childPids = this.findChildProcesses(pid);
				const allPids = [pid, ...childPids];
				
				if (log) log(`\x1b[33m  Found ${allPids.length} process(es) to kill: ${allPids.join(', ')}\x1b[0m\r\n`);
				
				for (const childPid of [...childPids].reverse()) {
					try {
						process.kill(childPid, 'SIGTERM');
						if (log) log(`\x1b[32m  → Killed child process ${childPid}\x1b[0m\r\n`);
					} catch (e) {}
				}
				
				try {
					process.kill(pid, 'SIGTERM');
					if (log) log(`\x1b[32m  → Killed main process ${pid}\x1b[0m\r\n`);
				} catch (e) {}
				
				setTimeout(() => {
					for (const childPid of allPids) {
						try {
							process.kill(childPid, 'SIGKILL');
						} catch (e) {}
					}
				}, 2000);
			}
		} catch (error) {
			console.error(`Failed to kill process tree for ${pid}:`, error);
		}
	}

	public static killProcessByPort(port: number) {
		try {
			if (process.platform === 'win32') {
				const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
				const lines = result.split('\n');
				const pids = new Set<number>();
				for (const line of lines) {
					const match = line.match(/\s+(\d+)\s*$/);
					if (match) pids.add(parseInt(match[1]));
				}
				for (const pid of pids) exec(`taskkill /PID ${pid} /F`);
			} else {
				const result = execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
				const pids = result.split('\n').filter(pid => pid.trim()).map(pid => parseInt(pid.trim()));
				for (const pid of pids) this.killProcessTree(pid);
			}
		} catch (error) {
			// No process found on port or error
		}
	}
}

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runCommand(command: string, workspaceRoot?: string): Promise<{ cmd: string; status: string; output: string; duration: number }> {
  const start = Date.now();
  try {
    const cwd = workspaceRoot || process.cwd();
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 30000, shell: true });
    const output = (stdout + (stderr ? '\n' + stderr : '')).trim();
    return { cmd: command, status: 'success', output: output || '(no output)', duration: Date.now() - start };
  } catch (err: any) {
    const output = ((err.stdout || '') + (err.stderr ? '\n' + err.stderr : '') || err.message || 'Command failed').trim();
    return { cmd: command, status: 'error', output, duration: Date.now() - start };
  }
}

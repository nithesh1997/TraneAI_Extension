import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runCommand(command: string, workspaceRoot?: string): Promise<string> {
  // Return as a proposal instead of executing directly for Mandatory Approval flow
  return `[COMMAND_PROPOSAL]\ncommand: ${command}\nstatus: pending\nmessage: Proposal to execute terminal command\n[END_COMMAND]`;
}

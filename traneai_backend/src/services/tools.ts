export const AI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'List files in a directory (max 2 levels deep)',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Relative path from workspace root' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path from workspace root' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace directory. Use for git commands, npm/yarn commands, running tests, building, listing directory contents, or any shell operation requested by the user.',
      parameters: {
        type: 'object', 
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
];

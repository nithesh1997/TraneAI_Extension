export const AI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'List files and directories in a workspace directory. Use this to explore project structure, find files, or understand directory layout. Returns file/folder names with [DIR] or [FILE] prefixes. Skips node_modules and .git directories.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Relative path from workspace root (default: "." for root)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the complete contents of a file. ALWAYS use this before editing, modifying, or explaining any code. Returns the full file content including all lines.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path from workspace root to the file (e.g., "src/app.component.ts" or "package.json")' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create a new file with the specified content. Use this when the user wants to create a new file, component, service, or any new code file. Returns confirmation with file path.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path for the new file from workspace root (e.g., "src/new-component.ts")' },
          content: { type: 'string', description: 'The complete content to write to the new file' },
        },
        required: ['filePath', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Make targeted, minimal edits to a specific section of an existing file. Uses smart matching so minor whitespace/indentation differences are OK. ALWAYS use this for edits - never use write_file for modifications. Only modifies the exact section you specify - preserves all other code, formatting, and whitespace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path from workspace root to the file to edit' },
          oldString: { type: 'string', description: 'The EXACT text to find and replace (must match exactly, including whitespace)' },
          newString: { type: 'string', description: 'The replacement text' },
        },
        required: ['filePath', 'oldString', 'newString'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write/overwrite an entire file. ONLY use this for new files or when you need to completely rewrite a file. For small edits, use edit_file instead.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path from workspace root to the file to write' },
          content: { type: 'string', description: 'The complete new content for the file' },
        },
        required: ['filePath', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fuzzy_find_file',
      description: 'Fuzzy find files by partial name match. Use to quickly locate files when you know part of the filename but not the full path. E.g. "userServ" finds "userService.ts", "app.comp" finds "app.component.ts". Returns up to 15 matching file paths ranked by relevance.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Partial filename to search for (e.g., "userServ", "app.comp", "style")' },
          max_results: { type: 'number', description: 'Maximum number of results to return (default: 15)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_code',
      description: 'Analyze code structure and logic. Use this to understand how code works, explain functionality, find bugs, understand imports, identify dependencies, or provide detailed code explanations. Returns structured analysis including: file summary, key functions/classes, imports, exports, and logic explanation.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path from workspace root to the file to analyze' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace directory. Use for git commands, npm/yarn/pnpm/ng commands, running tests, building projects, listing directory contents, Docker commands, or any terminal operation. Returns command output with success/error status.',
      parameters: {
        type: 'object', 
        properties: {
          command: { type: 'string', description: 'The complete shell command to execute (e.g., "npm install", "ng build", "git status", "docker ps")' },
        },
        required: ['command'],
      },
    },
  },
	{
		type: 'function' as const,
		function: {
			name: 'multi_file_edit',
			description: 'Apply multiple edits across one or more files simultaneously. Use this for refactoring related files, updating components and their modules, or fixing errors that span multiple files. This tool returns a unified edit proposal that handles all changes atomically.',
			parameters: {
				type: 'object',
				properties: {
					changes: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								filePath: { type: 'string', description: 'Relative path from workspace root to the file to edit' },
								oldString: { type: 'string', description: 'The EXACT text to find and replace (must match exactly, including whitespace)' },
								newString: { type: 'string', description: 'The replacement text' }
							},
							required: ['filePath', 'oldString', 'newString']
						},
						description: 'A list of file edits to apply together'
					},
					summary: { type: 'string', description: 'A short summary of the overall changes' }
				},
				required: ['changes']
			}
		}
	},
  {
    type: 'function' as const,
    function: {
      name: 'analyze_impact',
      description: 'Analyze the multi-file impact of changing a specific file or symbol. Shows which files will be affected, what depends on the changed code, and what the change depends on. Essential before making cross-file changes.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path from workspace root to the file being changed' },
          symbolName: { type: 'string', description: '(Optional) Specific symbol/export within the file to check impact for' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_symbol',
      description: 'Search for a symbol (function, class, interface, variable) across the entire workspace. Shows all files that contain the symbol with line numbers and definition type.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The symbol name to search for (e.g., "UserService", "getUserById", "AuthGuard")' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_references',
      description: 'Find all references to a symbol across the workspace. Shows every location where the symbol is used, imported, or referenced, grouped by file. Use to understand the full impact of renaming or refactoring.',
      parameters: {
        type: 'object',
        properties: {
          symbolName: { type: 'string', description: 'The symbol name to find all references for (e.g., "UserService", "isAuthenticated")' },
        },
        required: ['symbolName'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'investigate_error',
      description: 'Analyze an error message with stack trace to identify the root cause, affected files, and suggested fix. Use this when the user provides an error message or when troubleshooting issues.',
      parameters: {
        type: 'object',
        properties: {
          errorMessage: { type: 'string', description: 'The full error message including stack trace' },
        },
        required: ['errorMessage'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_architecture',
      description: 'Get the overall architecture overview of the workspace. Shows technology stack, project structure, key directories, and component relationships. Use to understand how the project is organized.',
      parameters: {
        type: 'object',
        properties: {
          detail: { type: 'string', enum: ['overview', 'components'], description: 'Detail level: "overview" for high-level architecture, "components" for component/service breakdown (default: "overview")' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'explain_code_deeply',
      description: 'Get a deep, structured explanation of code in a file. Returns purpose, data flow, dependencies, side effects, architecture decisions, and recommendations. Use when the user asks "how does this work", "explain this", or "what does this do".',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path from workspace root to the file to explain' },
        },
        required: ['filePath'],
      },
    },
  },
];

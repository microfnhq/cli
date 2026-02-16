import type { Command } from "commander";
import { createClient } from "../client.js";
import { formatCreatedWorkspaceText } from "../formatters.js";
import { type GlobalOptions, outputWithMode, readCodeInput } from "../utils.js";

export function registerCreateCommand(program: Command): void {
	program
		.command("create")
		.description("Create a new function from a code file.")
		.argument("<name>", "Function name")
		.argument("<file>", "Code file path or '-' to read stdin")
		.action(async (name: string, file: string) => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			const code = readCodeInput(file);
			const workspace = await client.createWorkspace({ name, code });
			outputWithMode(options.output, workspace, formatCreatedWorkspaceText);
		});
}

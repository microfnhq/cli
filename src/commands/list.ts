import type { Command } from "commander";
import { createClient } from "../client.js";
import { formatWorkspacesText } from "../formatters.js";
import { type GlobalOptions, outputWithMode } from "../utils.js";

export function registerListCommand(program: Command): void {
	program
		.command("list")
		.description("List all functions in your workspace.")
		.action(async () => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			outputWithMode(
				options.output,
				await client.listWorkspaces(),
				formatWorkspacesText,
			);
		});
}

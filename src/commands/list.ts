import type { Command } from "commander";
import { createClient } from "../client.js";
import { formatWorkspacesText } from "../formatters.js";
import { type GlobalOptions, outputWithMode } from "../utils.js";

export function registerListCommand(program: Command): void {
	program
		.command("list")
		.description("List all available functions in your workspace.")
		.addHelpText(
			"after",
			`
Examples:
  microfn list

Output:
  Returns username/name pairs you can pass to commands that require
  <username/function>, for example: "alice/my-function".
`,
		)
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

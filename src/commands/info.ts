import type { Command } from "commander";
import { createClient } from "../client.js";
import { formatFunctionDetailsText } from "../formatters.js";
import {
	type GlobalOptions,
	outputWithMode,
	parseFunctionIdentifier,
} from "../utils.js";

export function registerInfoCommand(program: Command): void {
	program
		.command("info")
		.description("Show function details and metadata.")
		.argument("<username/function>", "Function identifier")
		.action(async (rawIdentifier: string) => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			const { username, functionName } = parseFunctionIdentifier(rawIdentifier);
			outputWithMode(
				options.output,
				await client.getFunction(username, functionName),
				(functionDetails) =>
					formatFunctionDetailsText(functionDetails, rawIdentifier),
			);
		});
}

import type { Command } from "commander";
import { createClient } from "../client.js";
import { formatFunctionCodeText } from "../formatters.js";
import {
	type GlobalOptions,
	outputWithMode,
	parseFunctionIdentifier,
} from "../utils.js";

export function registerCodeCommand(program: Command): void {
	program
		.command("code")
		.description("Get function source code.")
		.argument("<username/function>", "Function identifier")
		.action(async (rawIdentifier: string) => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			const { username, functionName } = parseFunctionIdentifier(rawIdentifier);
			outputWithMode(
				options.output,
				await client.getFunctionCode(username, functionName),
				formatFunctionCodeText,
			);
		});
}

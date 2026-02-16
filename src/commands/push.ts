import type { Command } from "commander";
import { createClient } from "../client.js";
import {
	type GlobalOptions,
	outputWithMode,
	parseFunctionIdentifier,
	readCodeInput,
} from "../utils.js";

export function registerPushCommand(program: Command): void {
	program
		.command("push")
		.alias("update-code")
		.description("Push code to a function.")
		.argument("<username/function>", "Function identifier")
		.argument("<file>", "Code file path or '-' to read stdin")
		.action(async (rawIdentifier: string, file: string) => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			const { username, functionName } = parseFunctionIdentifier(rawIdentifier);
			const code = readCodeInput(file);
			const result = await client.updateFunctionCode(
				username,
				functionName,
				code,
			);
			outputWithMode(
				options.output,
				result,
				(r) => r.message || "Code pushed successfully",
			);
		});
}

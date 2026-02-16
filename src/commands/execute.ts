import type { Command } from "commander";
import { createClient } from "../client.js";
import { formatExecuteResultText } from "../formatters.js";
import {
	type GlobalOptions,
	outputWithMode,
	parseFunctionIdentifier,
	parseJsonInput,
} from "../utils.js";

export function registerExecuteCommand(program: Command): void {
	program
		.command("execute")
		.description("Execute a function with JSON input.")
		.argument("<username/function>", "Function identifier")
		.argument("[json]", "JSON payload or '-' to read stdin", "{}")
		.option("--include-logs", "Include execution logs in output", false)
		.action(
			async (
				rawIdentifier: string,
				payload: string,
				cmdOpts: { includeLogs: boolean },
			) => {
				const options = program.opts<GlobalOptions>();
				const client = createClient(options);
				const { username, functionName } =
					parseFunctionIdentifier(rawIdentifier);
				const inputData = parseJsonInput(payload);
				const result = await client.executeFunction(
					username,
					functionName,
					inputData,
				);
				outputWithMode(options.output, result, (r) =>
					formatExecuteResultText(r, cmdOpts.includeLogs),
				);
			},
		);
}

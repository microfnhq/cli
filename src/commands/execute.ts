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
		.description("Execute a function with optional JSON input.")
		.argument(
			"<username/function>",
			"Function identifier in the format username/functionName",
		)
		.argument(
			"[json]",
			"JSON payload, '-' to read from stdin, or default {}",
			"{}",
		)
		.option("--include-logs", "Include execution logs in output", false)
		.addHelpText(
			"after",
			`
Expected identifier:
  <username>/<functionName>
  e.g. "alice/weather-fn"

Expected payload:
  Any JSON object can be passed as inputData.
  If omitted, {} is sent.

Examples:
  # inline payload
  microfn execute alice/weather-fn '{"city": "tokyo"}'

  # stdin payload
  cat payload.json | microfn execute alice/weather-fn -

  # include logs
  microfn execute alice/weather-fn '{}' --include-logs
`,
		)
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

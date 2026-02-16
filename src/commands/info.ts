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
		.description("Show function metadata (excluding source code).")
		.argument(
			"<username/function>",
			"Function identifier in the format username/functionName",
		)
		.addHelpText(
			"after",
			`
Expected identifier:
  <username>/<functionName>
  e.g. "alice/weather-fn"

Examples:
  microfn info alice/weather-fn

Notes:
  - Includes details, deployment state, and runtime metadata.
  - Use microfn code alice/weather-fn to fetch source code instead.
`,
		)
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

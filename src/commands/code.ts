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
		.description("Fetch the function source code.")
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
  microfn code alice/weather-fn

Notes:
  - Returns code only.
  - Use microfn info alice/weather-fn for metadata instead.
`,
		)
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

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
		.description("Update a function's source code.")
		.argument(
			"<username/function>",
			"Function identifier in the format username/functionName",
		)
		.argument("<file>", "Code file path or '-' to read stdin")
		.addHelpText(
			"after",
			`
Expected identifier:
  <username>/<functionName>
  e.g. "alice/weather-fn"

Function source format (TypeScript):
  The module must export exactly one entrypoint function style:
  - export async function main(input) { ... }
  OR
  - export async function anyName(input) { ... }
  If main is not present, a single exported named function will be auto-wrapped as main().

  The exported function receives the execution input object and should return a JSON-serializable value.
  It can be async or sync.

Important:
  - Use default imports for @microfn/* modules:
    import kv from "@microfn/kv"
  - Do not use named imports:
    import { kv } from "@microfn/kv"

Valid source patterns:
  - export async function main(input) { ... }
  - export function main() { ... }
  - export async function handler(event) { ... }  // auto-wrapped as main()
  - export async function main() { ... ; return {ok: true}; }
  - import secret from "@microfn/secret"
  - import kv from "@microfn/kv"

Examples:
  # file input
  microfn push alice/weather-fn ./src/main.ts

  # stdin input
  cat main.ts | microfn push alice/weather-fn -

  # direct main entrypoint
  # file: main.ts
  export async function main(input) {
    const { city } = input || {};
    const res = await fetch(
      \`https://wttr.in/\${encodeURIComponent(city || "tokyo")}?format=3\`
    );
    return { weather: await res.text() };
  }

  # named function auto-wrapped
  # file: greet.ts
  export async function getGreeting(payload) {
    return { greeting: \`hello \${payload?.name || "world"}\` };
  }
`,
		)
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

#!/usr/bin/env node
import { Command } from "commander";
import { ApiError } from "./microfnApiClient.js";
import { parseOutputMode } from "./utils.js";
import {
	registerListCommand,
	registerCreateCommand,
	registerInfoCommand,
	registerCodeCommand,
	registerPushCommand,
	registerExecuteCommand,
} from "./commands/index.js";

function createProgram(): Command {
	const program = new Command();

	program
		.name("microfn")
		.description("CLI client for MicroFn APIs")
		.showHelpAfterError()
		.option(
			"--token <token>",
			"API token or JWT (defaults to MICROFN_API_TOKEN env var)",
		)
		.option("--base-url <url>", "API base URL (default: https://microfn.dev)")
		.option(
			"--output <mode>",
			"Output mode: text (default) or json",
			parseOutputMode,
			"text",
		)
		.option("--debug", "Enable debug output", false);

	// Register all commands
	registerListCommand(program);
	registerCreateCommand(program);
	registerInfoCommand(program);
	registerCodeCommand(program);
	registerPushCommand(program);
	registerExecuteCommand(program);

	program.addHelpText(
		"after",
		`
Examples:
  microfn list
  microfn create my-function ./src/main.ts
  cat code.ts | microfn create my-function -
  microfn info yourname/my-function
  microfn code yourname/my-function
  microfn push yourname/my-function ./src/main.ts
  cat code.ts | microfn push yourname/my-function -
  microfn execute yourname/my-function '{"name":"world"}'
  microfn --output json info yourname/my-function
  microfn execute yourname/my-function - <<'EOF'
  {"name":"world"}
  EOF
`,
	);

	return program;
}

async function main() {
	const program = createProgram();
	await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
	if (error instanceof ApiError) {
		console.error(`API Error (${error.statusCode}): ${error.message}`);
		if (error.details) {
			console.error(JSON.stringify(error.details, null, 2));
		}
	} else if (error instanceof Error) {
		console.error(error.message);
	} else {
		console.error(String(error));
	}
	process.exit(1);
});

import type { Command } from "commander";
import { createClient } from "../client.js";
import { formatCreatedWorkspaceText } from "../formatters.js";
import { type GlobalOptions, outputWithMode, readCodeInput } from "../utils.js";

export function registerCreateCommand(program: Command): void {
	program
		.command("create")
		.description("Create a new function/workspace from TypeScript source code.")
		.argument(
			"<name>",
			"Function name. Must be a valid workspace/function identifier.",
		)
		.argument("<file>", "Code file path or '-' to read stdin")
		.addHelpText(
			"after",
			`
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
  microfn create my-fn ./src/main.ts

  # stdin input
  cat main.ts | microfn create my-fn -

  # direct main entrypoint
  # file: main.ts
  export async function main(input) {
    const { name = "world" } = input || {};
    return { greeting: \`hello \${name}\` };
  }

  # named function auto-wrapped
  # file: greet.ts
  export async function greet(payload) {
    return { greeting: \`hello \${payload?.name || "world"}\` };
  }

  # with helper function
  # file: counter.ts
  import kv from "@microfn/kv";
  export async function main() {
    const count = (await kv.get("count")) || 0;
    await kv.set("count", count + 1);
    return { count: count + 1 };
  }
`,
		)
		.action(async (name: string, file: string) => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			const code = readCodeInput(file);
			const workspace = await client.createWorkspace({ name, code });
			outputWithMode(options.output, workspace, formatCreatedWorkspaceText);
		});
}

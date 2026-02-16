#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import {
	ApiError,
	type ExecuteFunctionResult,
	type FunctionCode,
	type FunctionDetails,
	MicroFnApiClient,
	type Workspace,
} from "./microfnApiClient.js";
import { Logger } from "./logger.js";

type OutputMode = "json" | "text";

type GlobalOptions = {
	token?: string;
	baseUrl?: string;
	output: OutputMode;
	debug: boolean;
};

function parseOutputMode(value: string): OutputMode {
	const normalizedValue = value.toLowerCase();
	if (normalizedValue !== "json" && normalizedValue !== "text") {
		throw new InvalidArgumentError("output must be 'json' or 'text'");
	}
	return normalizedValue;
}

function parseFunctionIdentifier(raw: string): {
	username: string;
	functionName: string;
} {
	const parts = raw.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error(
			`Invalid function identifier '${raw}'. Expected format username/function.`,
		);
	}
	return {
		username: parts[0],
		functionName: parts[1],
	};
}

function parseJsonInput(raw: string): unknown {
	if (raw === "-") {
		const stdin = readFileSync(0, "utf8").trim();
		return stdin ? JSON.parse(stdin) : {};
	}
	return JSON.parse(raw);
}

function readCodeInput(raw: string): string {
	if (raw === "-") {
		return readFileSync(0, "utf8");
	}
	return readFileSync(raw, "utf8");
}

function outputJson(value: unknown): void {
	console.log(JSON.stringify(value, null, 2));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringifyForText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value, null, 2);
}

function outputWithMode<T>(
	outputMode: OutputMode,
	value: T,
	textFormatter: (value: T) => string,
): void {
	if (outputMode === "json") {
		outputJson(value);
		return;
	}

	console.log(textFormatter(value));
}

function formatWorkspacesText(workspaces: Workspace[]): string {
	if (workspaces.length === 0) {
		return "No functions found.";
	}

	const rows = workspaces.map((w) => {
		const owner = w.username || w.Account?.username || "unknown-user";
		const name = `${owner}/${w.name}`;
		const status = w.latestDeployment?.status || "none";
		const visibility = w.isPublic ? "public" : "private";
		const mcp = w.mcpToolEnabled ? "yes" : "no";
		return { name, status, visibility, mcp };
	});

	const cols = {
		name: Math.max("NAME".length, ...rows.map((r) => r.name.length)),
		status: Math.max("STATUS".length, ...rows.map((r) => r.status.length)),
		visibility: Math.max(
			"VISIBILITY".length,
			...rows.map((r) => r.visibility.length),
		),
		mcp: Math.max("MCP".length, ...rows.map((r) => r.mcp.length)),
	};

	const header = [
		"NAME".padEnd(cols.name),
		"STATUS".padEnd(cols.status),
		"VISIBILITY".padEnd(cols.visibility),
		"MCP".padEnd(cols.mcp),
	].join("  ");

	const lines = rows.map((r) =>
		[
			r.name.padEnd(cols.name),
			r.status.padEnd(cols.status),
			r.visibility.padEnd(cols.visibility),
			r.mcp.padEnd(cols.mcp),
		].join("  "),
	);

	return [header, ...lines].join("\n");
}

function formatCreatedWorkspaceText(workspace: Workspace): string {
	const owner = workspace.username || workspace.Account?.username || "unknown-user";
	const fullName = `${owner}/${workspace.name}`;
	const status = workspace.latestDeployment?.status || "pending";
	return `Created function: ${fullName}\nDeployment: ${status}`;
}

function formatFunctionDetailsText(
	functionDetails: FunctionDetails,
	functionIdentifier: string,
): string {
	const lines: string[] = [
		`Function: ${functionIdentifier}`,
		`Visibility: ${functionDetails.visibility}`,
		`MCP Tool: ${functionDetails.mcp_tool_enabled ? "enabled" : "disabled"}`,
		`Status: ${functionDetails.deployment_status}`,
	];

	// Packages
	if (functionDetails.packages?.length > 0) {
		const pkgList = functionDetails.packages
			.map((p) => `${p.name}@${p.version}`)
			.join(", ");
		lines.push(`Packages: ${pkgList}`);
	} else {
		lines.push("Packages: none");
	}

	// Secrets
	lines.push(
		`Secrets: ${
			functionDetails.configured_secret_names.length > 0
				? functionDetails.configured_secret_names.join(", ")
				: "none"
		}`,
	);

	// Latest deployment
	if (functionDetails.latest_deployment) {
		const dep = functionDetails.latest_deployment;
		lines.push("");
		lines.push("Latest Deployment:");
		lines.push(`  ID: ${dep.id}`);
		lines.push(`  Status: ${dep.status}`);
		lines.push(`  Hash: ${dep.hash.substring(0, 12)}...`);
		lines.push(`  Deployed: ${dep.inserted_at}`);
		if (dep.signature) {
			const sig = dep.signature;
			const asyncStr = sig.async ? "async " : "";
			const params = sig.params.length > 0 ? sig.params.join(", ") : "";
			lines.push(`  Signature: ${asyncStr}${sig.name}(${params})`);
		}
	}

	// Last execution
	lines.push("");
	if (functionDetails.last_execution) {
		lines.push(
			`Last Execution: ${functionDetails.last_execution.status} at ${functionDetails.last_execution.executed_at}`,
		);
	} else {
		lines.push("Last Execution: never");
	}

	return lines.join("\n");
}

function formatFunctionCodeText(functionCode: FunctionCode): string {
	return functionCode.code || "";
}

function formatExecuteResultText(
	executeResult: ExecuteFunctionResult,
	includeLogs = false,
): string {
	const payload = executeResult.result;

	if (!isRecord(payload)) {
		return stringifyForText(payload);
	}

	const hasError =
		typeof payload.error === "string" && payload.error.length > 0;

	if (hasError) {
		const lines: string[] = [`Error: ${payload.error}`];
		if (Object.hasOwn(payload, "details")) {
			lines.push(stringifyForText(payload.details));
		}
		if (includeLogs) {
			const logs = payload.logs;
			if (Array.isArray(logs) && logs.length > 0) {
				lines.push("Logs:");
				for (const logEntry of logs) {
					lines.push(`- ${stringifyForText(logEntry)}`);
				}
			}
		}
		return lines.join("\n");
	}

	// Success case - just output the result
	const lines: string[] = [];
	if (Object.hasOwn(payload, "result")) {
		lines.push(stringifyForText(payload.result));
	}

	if (includeLogs) {
		const logs = payload.logs;
		if (Array.isArray(logs) && logs.length > 0) {
			lines.push("");
			lines.push("Logs:");
			for (const logEntry of logs) {
				lines.push(`- ${stringifyForText(logEntry)}`);
			}
		}
	}

	return lines.join("\n");
}

function createClient(options: GlobalOptions): MicroFnApiClient {
	const token =
		options.token ||
		process.env.MICROFN_API_KEY ||
		process.env.MICROFN_API_TOKEN ||
		process.env.MICROFN_TOKEN;
	const baseUrl =
		options.baseUrl ||
		process.env.MICROFN_API_BASE_URL ||
		process.env.API_BASE_URL;

	if (!token) {
		throw new Error("No token provided. Use --token or set MICROFN_API_TOKEN.");
	}

	const logger = new Logger(options.debug);
	return new MicroFnApiClient(token, baseUrl, undefined, logger);
}

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

	program
		.command("list")
		.description("List all functions in your workspace.")
		.action(async () => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			outputWithMode(
				options.output,
				await client.listWorkspaces(),
				formatWorkspacesText,
			);
		});

	program
		.command("create")
		.description("Create a new function from a code file.")
		.argument("<name>", "Function name")
		.argument("<file>", "Code file path or '-' to read stdin")
		.action(async (name: string, file: string) => {
			const options = program.opts<GlobalOptions>();
			const client = createClient(options);
			const code = readCodeInput(file);
			const workspace = await client.createWorkspace({ name, code });
			outputWithMode(
				options.output,
				workspace,
				formatCreatedWorkspaceText,
			);
		});

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
			const result = await client.updateFunctionCode(username, functionName, code);
			outputWithMode(
				options.output,
				result,
				(r) => r.message || "Code pushed successfully",
			);
		});

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

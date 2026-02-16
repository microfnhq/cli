import type {
	ExecuteFunctionResult,
	FunctionCode,
	FunctionDetails,
	Workspace,
} from "./microfnApiClient.js";
import { isRecord, stringifyForText } from "./utils.js";

export function formatWorkspacesText(workspaces: Workspace[]): string {
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

export function formatCreatedWorkspaceText(workspace: Workspace): string {
	const owner =
		workspace.username || workspace.Account?.username || "unknown-user";
	const fullName = `${owner}/${workspace.name}`;
	const status = workspace.latestDeployment?.status || "pending";
	return `Created function: ${fullName}\nDeployment: ${status}`;
}

export function formatFunctionDetailsText(
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

export function formatFunctionCodeText(functionCode: FunctionCode): string {
	return functionCode.code || "";
}

export function formatExecuteResultText(
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

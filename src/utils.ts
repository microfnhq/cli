import { readFileSync } from "node:fs";
import { InvalidArgumentError } from "commander";

export type OutputMode = "json" | "text";

export type GlobalOptions = {
	token?: string;
	baseUrl?: string;
	output: OutputMode;
	debug: boolean;
};

export function parseOutputMode(value: string): OutputMode {
	const normalizedValue = value.toLowerCase();
	if (normalizedValue !== "json" && normalizedValue !== "text") {
		throw new InvalidArgumentError("output must be 'json' or 'text'");
	}
	return normalizedValue;
}

export function parseFunctionIdentifier(raw: string): {
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

export function parseJsonInput(raw: string): unknown {
	if (raw === "-") {
		const stdin = readFileSync(0, "utf8").trim();
		return stdin ? JSON.parse(stdin) : {};
	}
	return JSON.parse(raw);
}

export function readCodeInput(raw: string): string {
	if (raw === "-") {
		return readFileSync(0, "utf8");
	}
	return readFileSync(raw, "utf8");
}

export function outputJson(value: unknown): void {
	console.log(JSON.stringify(value, null, 2));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function stringifyForText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value, null, 2);
}

export function outputWithMode<T>(
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

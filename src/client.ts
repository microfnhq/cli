import { MicroFnApiClient } from "./microfnApiClient.js";
import { Logger } from "./logger.js";
import type { GlobalOptions } from "./utils.js";

export function createClient(options: GlobalOptions): MicroFnApiClient {
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

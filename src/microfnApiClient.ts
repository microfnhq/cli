// my-mcp-server/src/microfnApiClient.ts

import { decodeJwt } from "jose";
import { Logger } from "./logger.js";

/**
 * Custom error class for API errors with detailed information
 */
export class ApiError extends Error {
	public readonly statusCode: number;
	public readonly details: unknown;
	public readonly rawError: unknown;

	constructor(
		message: string,
		statusCode: number,
		details: unknown = {},
		rawError: unknown = null,
	) {
		super(message);
		this.name = "ApiError";
		this.statusCode = statusCode;
		this.details = details; // Safe, sanitized details for user
		this.rawError = rawError; // Full error for logging only
	}
}

export interface Workspace {
	id: string;
	name: string;
	username?: string;
	mcpToolEnabled: boolean;
	isPublic: boolean;
	hasPublicEndpoint: boolean;
	cron?: string;
	publishedAt?: string | null;
	createdAt: string;
	updatedAt: string;
	Account?: {
		id: string;
		name: string;
		username: string;
	};

	latestDeployment?: {
		id: string;
		status: string;
		createdAt: string;
		hash?: string;
		signature?: {
			name?: string;
			params?: string[];
			async?: boolean;
			comment?: string;
			parameterInfo?: Array<{
				name: string;
				type: string;
				required: boolean;
				hasDefault: boolean;
			}>;
		};
	};
}

export interface Secret {
	id: string;
	key: string;
	value?: string;
}

export interface Deployment {
	id: string;
	status: string;
	createdAt?: string;
	updatedAt?: string;
	[key: string]: unknown;
	// Add other relevant fields as needed
}

export interface FunctionCode {
	code: string;
}

export interface ExecuteFunctionResult {
	result: any;
}

export interface GenerateFunctionParams {
	prompt: string;
}

export interface GenerateFunctionResult {
	variations: Array<{ code: string }>;
}

export interface RewriteFunctionParams {
	code: string;
}

export interface RewriteFunctionResult {
	code: string;
}

export interface FunctionDetails {
	function_name: string;
	username: string;
	visibility: string;
	mcp_tool_enabled: boolean;
	deployment_status: string;
	is_deployed: boolean;
	is_deploying: boolean;
	packages: Array<{ name: string; version: string }>;
	configured_secret_names: string[];
	last_deployment?: {
		id: string;
		status: string;
		deployment_provider?: string;
		deployment_provider_id?: string;
		inserted_at?: string;
		updated_at?: string;
	} | null;
	latest_deployment?: {
		id: number;
		status: string;
		signature?: {
			async: boolean;
			comment: string | null;
			name: string;
			params: string[];
		};
		hash: string;
		inserted_at: string;
		updated_at: string;
	} | null;
	code?: string | null;
	last_execution?: {
		id: number;
		status: string;
		executed_at: string;
	} | null;
}

export interface FunctionSettingsParams {
	mcp_tool_enabled: boolean;
}

export interface FunctionSettingsResult {
	function_name: string;
	mcp_tool_enabled: boolean;
	message: string;
}

export interface CreateWorkspaceParams {
	name: string;
	code: string;
}

export interface UpdateWorkspaceParams {
	code: string;
}

export interface CreateSecretParams {
	key: string;
	value: string;
}

export interface UpdateSecretParams {
	value: string;
}

export class MicroFnApiClient {
	private apiToken: string;
	private baseUrl: string;
	private runBaseUrl: string;
	private env?: any; // Store env for abort signal access
	private logger: Logger;

	constructor(apiToken: string, baseUrl?: string, env?: any, logger?: Logger) {
		this.apiToken = apiToken;
		this.runBaseUrl = baseUrl?.replace("/api", "") || "https://microfn.dev";
		this.baseUrl = baseUrl || `${this.runBaseUrl}/api`;
		this.env = env;
		this.logger = logger ?? new Logger(false);
		this.logger.log("[MicroFnApiClient] Initialized:", {
			baseUrl: this.baseUrl,
			runBaseUrl: this.runBaseUrl,
			hasToken: !!apiToken,
			tokenType: apiToken.startsWith("mfn_")
				? "PAT"
				: apiToken.startsWith("mcp_")
					? "MCP Token"
					: "ID Token",
		});
	}

	private remainingMs(opts?: { timeoutMs?: number }): number {
		// Use explicit timeout if provided
		if (opts?.timeoutMs) {
			return opts.timeoutMs;
		}
		// Use request deadline if available
		const dl = this.env?.__CURRENT_DEADLINE_TS as number | undefined;
		if (dl) {
			return Math.max(1, dl - Date.now());
		}
		// Default to 20 seconds for bootstrap operations
		return (this.env as any)?.MCP_DEFAULT_FETCH_TIMEOUT_MS ?? 20000;
	}

	private async fetchWithAbort(
		url: string,
		init: RequestInit,
		opts?: { timeoutMs?: number; signal?: AbortSignal },
	): Promise<Response> {
		// Use explicit signal if provided, otherwise use request context
		const outerSignal =
			opts?.signal ??
			(this.env?.__CURRENT_ABORT_SIGNAL as AbortSignal | undefined);
		const ctrl = new AbortController();
		const timeoutMs = this.remainingMs(opts);
		const timer = setTimeout(() => ctrl.abort("deadline"), timeoutMs);

		if (outerSignal) {
			outerSignal.addEventListener(
				"abort",
				() => ctrl.abort("transport-timeout"),
				{
					once: true,
				},
			);
		}

		try {
			return await fetch(url, { ...init, signal: ctrl.signal });
		} finally {
			clearTimeout(timer);
		}
	}

	private validateToken(): void {
		// Skip validation for PAT tokens
		if (this.apiToken.startsWith("mfn_") || this.apiToken.startsWith("mfp_")) {
			return;
		}

		// Skip validation for MCP tokens (they're simple identifiers)
		if (this.apiToken.startsWith("mcp_")) {
			return;
		}

		// Validate only Compact JWS (3-part) JWTs (ID tokens)
		const parts = this.apiToken.split(".");
		if (parts.length === 3) {
			try {
				const tokenPayload = decodeJwt(this.apiToken);
				const currentTime = Math.floor(Date.now() / 1000);
				const tokenExp = tokenPayload.exp as number;

				if (currentTime >= tokenExp) {
					const expiredAt = new Date(tokenExp * 1000).toISOString();
					this.logger.error("[MicroFnApiClient] ID token expired at:", expiredAt);
					throw new Error(
						`ID token expired at ${expiredAt}. Please re-authenticate.`,
					);
				}
			} catch (error) {
				if (error instanceof Error && error.message.includes("expired")) {
					throw error;
				}
				this.logger.error("[MicroFnApiClient] Failed to validate token:", error);
				throw new Error("Invalid ID token");
			}
		} else {
			// Non-JWS tokens (e.g., JWE access tokens or opaque tokens)
			// Skip local validation and let the server decide.
			const tokenType = parts.length === 5 ? "JWE" : "opaque";
			this.logger.log(
				"[MicroFnApiClient] Skipping JWT validation for non-compact token format",
				{ tokenType },
			);
		}
	}

	private getHeaders(): HeadersInit {
		const headers = {
			Authorization: `Bearer ${this.apiToken}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		};
		this.logger.log("[MicroFnApiClient] Request headers:", {
			hasAuth: !!headers.Authorization,
			tokenPrefix: this.apiToken
				? `${this.apiToken.substring(0, 10)}...`
				: "none",
		});
		return headers;
	}

	/**
	 * Centralized error handler that sanitizes errors for security
	 */
	private async handleApiError(
		res: Response,
		operation: string,
	): Promise<never> {
		let errorBody: unknown;
		const responseText = await res.text().catch(() => "");
		if (responseText) {
			try {
				errorBody = JSON.parse(responseText);
			} catch {
				errorBody = { message: responseText };
			}
		} else {
			errorBody = { message: `Request failed: ${res.statusText}` };
		}

		// Always log full details for debugging
		this.logger.error(
			`[MicroFnApiClient] ${operation} failed (${res.status}):`,
			errorBody,
		);

		// Determine what to show the user based on status code and error type
		let userMessage: string;
		let userDetails: unknown = {};

		// Type guard to safely access errorBody properties
		const isErrorObject = (obj: unknown): obj is Record<string, unknown> => {
			return typeof obj === "object" && obj !== null;
		};

		switch (res.status) {
			case 400: // Bad Request - usually safe validation errors
				if (isErrorObject(errorBody) && errorBody.errors) {
					// Changeset/validation errors are generally safe to expose
					userMessage = "Validation failed";
					userDetails = { validation_errors: errorBody.errors };
				} else if (isErrorObject(errorBody) && errorBody.validation_errors) {
					// ESLint or other validation errors
					userMessage =
						(typeof errorBody.error === "string" ? errorBody.error : null) ||
						"Code validation failed";
					userDetails = { validation_errors: errorBody.validation_errors };
				} else if (
					isErrorObject(errorBody) &&
					typeof errorBody.error === "string"
				) {
					// Generic error with safe error message from server
					userMessage = errorBody.error;
				} else if (
					isErrorObject(errorBody) &&
					typeof errorBody.message === "string"
				) {
					// Handle "message" field as fallback for 400 errors (usually safe)
					userMessage = errorBody.message;
				} else {
					userMessage = "Invalid request";
				}
				break;

			case 401:
				userMessage = "Authentication required";
				break;

			case 403:
				userMessage = "Permission denied";
				break;

			case 404:
				userMessage =
					(isErrorObject(errorBody) && typeof errorBody.error === "string"
						? errorBody.error
						: null) || "Resource not found";
				break;

			case 429:
				userMessage = "Rate limit exceeded. Please try again later";
				break;

			case 500:
			case 502:
			case 503:
				// Never expose internal server error details
				userMessage = "A server error occurred. Please try again later";
				break;

			default:
				userMessage = `Request failed: ${res.statusText}`;
		}

		throw new ApiError(userMessage, res.status, userDetails, errorBody);
	}

	// --- Packages (read-only from latest deployment) ---

	async listPackages(
		username: string,
		functionName: string,
	): Promise<Array<{ name: string; version: string }>> {
		const url = `${this.baseUrl}/v1/functions/${username}/${functionName}/packages`;
		this.logger.log("[MicroFnApiClient] GET", url);

		const res = await this.fetchWithAbort(url, {
			method: "GET",
			headers: this.getHeaders(),
		});

		this.logger.log("[MicroFnApiClient] Response:", res.status, res.statusText);
		if (!res.ok) {
			await this.handleApiError(res, "List packages");
		}

		const data = (await res.json()) as {
			packages?: Array<{ name: string; version: string }>;
		};
		return data.packages || [];
	}

	// Workspace (Function) Management

	async createWorkspace(params: CreateWorkspaceParams): Promise<Workspace> {
		const res = await this.fetchWithAbort(`${this.baseUrl}/v1/functions`, {
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify({
				name: params.name,
				initialCode: params.code,
			}),
		});
		if (!res.ok) {
			await this.handleApiError(res, "Create function");
		}
		const v1 = (await res.json()) as any;

		// v1 returns a flat object using snake_case keys
		return {
			id: String(v1.id ?? ""),
			name: v1.function_name ?? "",
			username: v1.username,
			mcpToolEnabled: !!v1.mcp_tool_enabled,
			isPublic: v1.visibility === "public",
			hasPublicEndpoint: false,
			cron: undefined,
			publishedAt: null,
			createdAt: v1.created_at ?? new Date().toISOString(),
			updatedAt: v1.updated_at ?? new Date().toISOString(),
			Account: v1.user
				? {
						id: String(v1.user.id),
						name: v1.user.username,
						username: v1.user.username,
					}
				: undefined,
			latestDeployment: v1.latest_deployment
				? {
						id: String(v1.latest_deployment.id),
						status: v1.latest_deployment.status,
						createdAt: v1.latest_deployment.inserted_at,
					}
				: undefined,
		};
	}

	async updateWorkspace(
		username: string,
		functionName: string,
		params: UpdateWorkspaceParams,
	): Promise<any> {
		// Forward to v1 code update
		return this.updateFunctionCode(username, functionName, params.code);
	}

	async renameWorkspace(
		username: string,
		functionName: string,
		newName: string,
	): Promise<{ function_name: string; old_name: string; message: string }> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}`,
			{
				method: "PATCH",
				headers: this.getHeaders(),
				body: JSON.stringify({ name: newName }),
			},
		);
		if (!res.ok) {
			await this.handleApiError(res, "Rename function");
		}
		return (await res.json()) as {
			function_name: string;
			old_name: string;
			message: string;
		};
	}

	async listWorkspaces(opts?: {
		timeoutMs?: number;
		signal?: AbortSignal;
	}): Promise<Workspace[]> {
		// Validate token before making the request
		this.validateToken();

		const url = `${this.runBaseUrl}/api/v1/functions`;
		this.logger.log(
			"[MicroFnApiClient] GET",
			url,
			opts ? `(timeout: ${opts.timeoutMs}ms)` : "",
		);

		const res = await this.fetchWithAbort(
			url,
			{
				method: "GET",
				headers: this.getHeaders(),
			},
			opts,
		);

		this.logger.log("[MicroFnApiClient] Response:", res.status, res.statusText);
		if (!res.ok) {
			await this.handleApiError(res, "List functions");
		}

		// The new endpoint returns an array directly, not wrapped in an object
		const functions = (await res.json()) as any[];
		this.logger.log(
			"[MicroFnApiClient] Found",
			functions?.length || 0,
			"functions",
		);

		// Transform the response to match the Workspace interface for backward compatibility
		const workspaces: Workspace[] = functions.map((func) => ({
			id: String(func.id ?? func.function_name),
			name: func.function_name,
			username: func.username,
			mcpToolEnabled: !!(func.mcpToolEnabled ?? func.mcp_tool_enabled ?? false),
			isPublic: func.visibility === "public",
			hasPublicEndpoint: func.visibility === "public",
			cron: undefined, // Not provided in new API
			publishedAt: undefined, // Not provided in new API
			createdAt: func.inserted_at,
			updatedAt: func.updated_at,
			Account: func.username
				? {
						id: func.username,
						name: func.username,
						username: func.username,
					}
				: undefined,
			latestDeployment: func.last_deployment
				? {
						id: func.last_deployment.id,
						status: func.last_deployment.status,
						createdAt: func.last_deployment.inserted_at,
						hash: "", // Not provided in new API
						signature: func.last_deployment.signature, // v1 includes signature when available
					}
				: undefined,
		}));

		return workspaces;
	}

	// Function Code

	async getFunctionCode(
		username: string,
		functionName: string,
	): Promise<FunctionCode> {
		const url = `${this.baseUrl}/v1/functions/${username}/${functionName}/code`;
		this.logger.log("[MicroFnApiClient] GET", url);

		const res = await this.fetchWithAbort(url, {
			method: "GET",
			headers: this.getHeaders(),
		});

		this.logger.log("[MicroFnApiClient] Response:", res.status, res.statusText);
		if (!res.ok) {
			await this.handleApiError(res, "Get function code");
		}

		const data = (await res.json()) as any;
		this.logger.log(
			"[MicroFnApiClient] Got code, length:",
			data?.code?.length || 0,
		);
		return { code: data?.code || "" };
	}

	// Function Details
	async getFunction(
		username: string,
		functionName: string,
	): Promise<FunctionDetails> {
		const url = `${this.baseUrl}/v1/functions/${username}/${functionName}`;
		this.logger.log("[MicroFnApiClient] GET", url);

		const res = await this.fetchWithAbort(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		this.logger.log("[MicroFnApiClient] Response:", res.status, res.statusText);
		if (!res.ok) {
			await this.handleApiError(res, "Get function details");
		}

		return (await res.json()) as FunctionDetails;
	}

	async updateFunctionCode(
		username: string,
		functionName: string,
		code: string,
	): Promise<any> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}/code`,
			{
				method: "POST",
				headers: this.getHeaders(),
				body: JSON.stringify({ code }),
			},
		);
		if (!res.ok) {
			await this.handleApiError(res, "Update function code");
		}
		return await res.json();
	}

	async updateFunctionSettings(
		username: string,
		functionName: string,
		settings: FunctionSettingsParams,
	): Promise<FunctionSettingsResult> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}/settings`,
			{
				method: "PATCH",
				headers: this.getHeaders(),
				body: JSON.stringify(settings),
			},
		);
		if (!res.ok) {
			await this.handleApiError(res, "Update function settings");
		}
		return await res.json();
	}

	// Function Execution

	async executeFunction(
		username: string,
		functionName: string,
		inputData: any,
	): Promise<ExecuteFunctionResult> {
		const url = `${this.baseUrl}/v1/functions/${username}/${functionName}/run`;
		this.logger.log("[MicroFnApiClient] POST", url);
		this.logger.log("[MicroFnApiClient] Input data:", JSON.stringify(inputData));

		const res = await this.fetchWithAbort(url, {
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify(inputData),
		});

		this.logger.log("[MicroFnApiClient] Response:", res.status, res.statusText);

		// Parse the response regardless of status code - the API returns
		// structured error responses with logs even on failure
		try {
			const json = await res.json();
			this.logger.log("[MicroFnApiClient] Execution result (JSON):", json);

			// If it's an error response (status >= 400), the result will contain
			// error, details, logs, and execution_id fields
			// If it's a success, it will contain result, logs, and execution_id
			return { result: json };
		} catch (_e) {
			// Fallback to text if JSON parsing fails
			const text = await res.text();
			this.logger.log("[MicroFnApiClient] Execution result (text):", text);

			// For non-JSON responses with error status, use our improved error handling
			if (!res.ok) {
				// Create a mock response with the text content for error handling
				const mockResponse = new Response(text, {
					status: res.status,
					statusText: res.statusText,
					headers: res.headers,
				});
				await this.handleApiError(mockResponse, "Execute function");
			}

			return { result: text };
		}
	}

	// Deployments

	async getLatestDeployment(
		username: string,
		functionName: string,
	): Promise<Deployment> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}/deployments/latest`,
			{
				method: "GET",
				headers: this.getHeaders(),
			},
		);
		if (res.status === 404) {
			return {} as Deployment;
		}
		if (!res.ok) {
			await this.handleApiError(res, "Get latest deployment");
		}
		const data = (await res.json()) as any;
		const d = data?.deployment;
		if (!d) return {} as Deployment;
		return {
			id: d.id,
			status: d.status,
			createdAt: d.createdAt || d.inserted_at,
			updatedAt: d.updatedAt || d.updated_at,
		};
	}

	async waitForDeployment(
		username: string,
		functionName: string,
	): Promise<{
		success: boolean;
		status?: string;
		deployment?: Deployment;
		message?: string;
		error?: string;
	}> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}/wait_deployment`,
			{
				method: "POST",
				headers: this.getHeaders(),
			},
		);

		const data = (await res.json()) as any;

		// Handle error responses
		if (!res.ok) {
			return {
				success: false,
				error: data.error || `Request failed with status ${res.status}`,
			};
		}

		// Handle timeout
		if (data.status === "timeout") {
			return {
				success: false,
				status: data.status,
				message: data.message,
			};
		}

		// Handle successful completion or immediate return
		return {
			success: true,
			status: data.status,
			deployment: data.deployment
				? {
						id: data.deployment.id,
						status: data.deployment.status,
						createdAt: data.deployment.createdAt || data.deployment.inserted_at,
						updatedAt: data.deployment.updatedAt || data.deployment.updated_at,
					}
				: undefined,
			message: data.message,
		};
	}

	// Secrets Management

	async listSecrets(username: string, functionName: string): Promise<Secret[]> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}/secrets`,
			{
				method: "GET",
				headers: this.getHeaders(),
			},
		);
		if (!res.ok) {
			await this.handleApiError(res, "List secrets");
		}
		const data = (await res.json()) as { secrets?: Secret[] };
		return data.secrets || [];
	}

	async createSecret(
		username: string,
		functionName: string,
		params: CreateSecretParams,
	): Promise<Secret[]> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}/secrets`,
			{
				method: "POST",
				headers: this.getHeaders(),
				body: JSON.stringify({ key: params.key, value: params.value }),
			},
		);
		if (!res.ok) {
			await this.handleApiError(res, "Create secret");
		}
		const data = (await res.json()) as { secrets?: Secret[] };
		return data.secrets || [];
	}

	async updateSecret(
		_username: string,
		_functionName: string,
		_secretId: string,
		_params: UpdateSecretParams,
	): Promise<Secret> {
		// Note: The Python API doesn't have an update method, only create/delete
		// This would need to be implemented if the API supports it
		throw new Error(
			"Update secret not implemented - use create/delete instead",
		);
	}

	async deleteSecret(
		username: string,
		functionName: string,
		secretId: string,
	): Promise<void> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/functions/${username}/${functionName}/secrets/${encodeURIComponent(secretId)}`,
			{
				method: "DELETE",
				headers: this.getHeaders(),
			},
		);
		if (!res.ok) {
			await this.handleApiError(res, "Delete secret");
		}
	}

	// Function Generation

	async generateFunction(
		params: GenerateFunctionParams,
	): Promise<GenerateFunctionResult> {
		const res = await this.fetchWithAbort(
			`${this.baseUrl}/v1/generate/function`,
			{
				method: "POST",
				headers: this.getHeaders(),
				body: JSON.stringify(params),
			},
		);
		if (!res.ok) {
			await this.handleApiError(res, "Generate function");
		}
		return (await res.json()) as GenerateFunctionResult;
	}

	async rewriteFunction(
		_params: RewriteFunctionParams,
	): Promise<RewriteFunctionResult> {
		throw new Error("Function rewrite endpoint is not available via v1 API.");
	}

	// Code Validation (lint)
	async checkCode(code: string): Promise<any> {
		const url = `${this.baseUrl}/v1/functions/check_code`;
		this.logger.log("[MicroFnApiClient] POST", url);
		const res = await this.fetchWithAbort(url, {
			method: "POST",
			headers: this.getHeaders(),
			body: JSON.stringify({ code }),
		});
		if (!res.ok) {
			await this.handleApiError(res, "Validate code");
		}
		return await res.json();
	}

	// --- Function details (show) ---
	async getFunctionDetails(
		username: string,
		functionName: string,
	): Promise<{
		deployment_status?: string;
		latest_deployment?: { id: string; status: string } | null;
		is_deploying?: boolean;
		[key: string]: unknown;
	}> {
		const url = `${this.baseUrl}/v1/functions/${username}/${functionName}`;
		const res = await this.fetchWithAbort(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!res.ok) {
			await this.handleApiError(res, "Get function details");
		}
		return (await res.json()) as any;
	}
}

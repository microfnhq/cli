export class Logger {
	private debug: boolean;

	constructor(debug = false) {
		this.debug = debug;
	}

	log(...args: unknown[]): void {
		if (this.debug) {
			console.log(...args);
		}
	}

	error(...args: unknown[]): void {
		console.error(...args);
	}
}

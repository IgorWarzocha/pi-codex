import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, Context, Model, RetryCallbacks, RetryPolicy, SimpleStreamOptions } from "@earendil-works/pi-ai";

export interface BranchSummaryRuntime {
	model: Model<Api>;
	apiKey?: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
	streamFn: StreamFn;
	sourceContext: Context;
	requestOptions: SimpleStreamOptions;
	retry?: RetryPolicy;
	callbacks?: RetryCallbacks;
}

const runtimes = new WeakMap<AbortSignal, BranchSummaryRuntime>();

export function getBranchSummaryRuntime(signal: AbortSignal): BranchSummaryRuntime | undefined {
	return runtimes.get(signal);
}

export function registerBranchSummaryRuntime(signal: AbortSignal, runtime: BranchSummaryRuntime): () => void {
	runtimes.set(signal, runtime);
	return () => {
		if (runtimes.get(signal) === runtime) runtimes.delete(signal);
	};
}

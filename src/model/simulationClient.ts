import type { BasketballData, ParlayPrice, Scenario, SimulationSummary } from "../types";

type Pending = { resolve: (price: ParlayPrice) => void; reject: (error: Error) => void };

export class SimulationClient {
  private worker: Worker;
  private pending = new Map<string, Pending>();
  private readyResolve: ((summary: SimulationSummary) => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === "ready") {
        this.readyResolve?.(event.data.summary as SimulationSummary);
        this.readyResolve = null;
        this.readyReject = null;
      } else if (event.data.type === "price") {
        const request = this.pending.get(event.data.requestId);
        request?.resolve(event.data.price as ParlayPrice);
        this.pending.delete(event.data.requestId);
      } else if (event.data.type === "error") {
        const error = new Error(event.data.message as string);
        if (event.data.requestId) {
          this.pending.get(event.data.requestId)?.reject(error);
          this.pending.delete(event.data.requestId);
        } else {
          this.readyReject?.(error);
        }
      }
    };
  }

  initialize(data: BasketballData, scenario: Scenario): Promise<SimulationSummary> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.worker.postMessage({ type: "init", data, scenario });
    });
  }

  price(marketIds: string[]): Promise<ParlayPrice> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ type: "price", requestId, marketIds });
    });
  }

  destroy(): void {
    this.worker.terminate();
    for (const request of this.pending.values()) request.reject(new Error("Simulation stopped"));
    this.pending.clear();
  }
}

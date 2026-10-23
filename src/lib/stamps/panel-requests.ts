import type { WalletId } from "./wallet";

export type StampPanelOperation = {
  generation: number;
  background: boolean;
  abort: AbortController;
  scopeKey: string;
  walletId: WalletId;
  cpid?: string;
};

type RequestContext = { scopeKey: string; walletId: WalletId };
type RequestOptions = { timeoutMs?: number; walletTimeoutMs?: number };

/** A background holdings check must never prevent an explicit edit or wallet action. */
export class StampPanelRequests {
  private operation: StampPanelOperation | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private readonly onTimeout: (operation: StampPanelOperation) => void;
  private readonly timeoutMs: number;
  private readonly walletTimeoutMs: number;

  constructor(onTimeout: (operation: StampPanelOperation) => void, options: RequestOptions = {}) {
    this.onTimeout = onTimeout;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.walletTimeoutMs = options.walletTimeoutMs ?? 120_000;
  }

  get current(): StampPanelOperation | null {
    return this.operation;
  }

  begin(context: RequestContext, background = false, wallet = false): StampPanelOperation | null {
    if (this.operation) {
      if (background || !this.operation.background) return null;
      this.invalidate();
    }
    const operation: StampPanelOperation = {
      ...context,
      generation: ++this.generation,
      background,
      abort: new AbortController(),
    };
    this.operation = operation;
    this.timer = setTimeout(
      () => {
        if (this.operation !== operation) return;
        this.invalidate();
        this.onTimeout(operation);
      },
      wallet ? this.walletTimeoutMs : this.timeoutMs,
    );
    return operation;
  }

  isCurrent(operation: StampPanelOperation): boolean {
    return this.operation === operation && !operation.abort.signal.aborted;
  }

  finish(operation: StampPanelOperation): boolean {
    if (this.operation !== operation) return false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.operation = null;
    return true;
  }

  invalidate(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const operation = this.operation;
    this.operation = null;
    operation?.abort.abort();
  }
}

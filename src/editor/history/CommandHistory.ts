import type { Command } from "@/editor/history/Command";

export interface HistoryInfo {
  undoCount: number;
  redoCount: number;
  usedBytes: number;
  budgetBytes: number;
  latestLabel: string | null;
}

export class CommandHistory {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private usedBytes = 0;

  constructor(readonly budgetBytes = 64 * 1024 * 1024) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 1) {
      throw new RangeError(`History budget must be a positive integer. Received: ${budgetBytes}.`);
    }
  }

  get info(): HistoryInfo {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      usedBytes: this.usedBytes,
      budgetBytes: this.budgetBytes,
      latestLabel: this.undoStack.at(-1)?.label ?? null,
    };
  }

  push(command: Command): void {
    this.clearRedo();
    this.undoStack.push(command);
    this.usedBytes += command.byteSize;
    this.trimToBudget();
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.usedBytes = 0;
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) {
      return false;
    }

    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) {
      return false;
    }

    command.redo();
    this.undoStack.push(command);
    return true;
  }

  private clearRedo(): void {
    for (const command of this.redoStack) {
      this.usedBytes -= command.byteSize;
    }
    this.redoStack.length = 0;
  }

  private trimToBudget(): void {
    while (this.usedBytes > this.budgetBytes && this.undoStack.length > 1) {
      const discarded = this.undoStack.shift();
      if (discarded) {
        this.usedBytes -= discarded.byteSize;
      }
    }
  }
}

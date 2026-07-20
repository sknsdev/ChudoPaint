import type { Command } from "@/editor/history/Command";

/** The MVP history retains the latest completed command only. */
export class SingleStepHistory {
  private latestCommand: Command | null = null;

  push(command: Command): void {
    this.latestCommand = command;
  }

  clear(): void {
    this.latestCommand = null;
  }

  undo(): boolean {
    if (!this.latestCommand) {
      return false;
    }

    this.latestCommand.undo();
    this.latestCommand = null;
    return true;
  }
}

import type { Command } from "@/editor/history/Command";

/** The MVP history retains one undoable command and its redo counterpart. */
export class SingleStepHistory {
  private undoCommand: Command | null = null;
  private redoCommand: Command | null = null;

  push(command: Command): void {
    this.undoCommand = command;
    this.redoCommand = null;
  }

  clear(): void {
    this.undoCommand = null;
    this.redoCommand = null;
  }

  undo(): boolean {
    if (!this.undoCommand) {
      return false;
    }

    this.undoCommand.undo();
    this.redoCommand = this.undoCommand;
    this.undoCommand = null;
    return true;
  }

  redo(): boolean {
    if (!this.redoCommand) {
      return false;
    }

    this.redoCommand.redo();
    this.undoCommand = this.redoCommand;
    this.redoCommand = null;
    return true;
  }
}

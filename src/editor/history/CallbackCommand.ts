import type { Command } from "@/editor/history/Command";

export class CallbackCommand implements Command {
  constructor(
    readonly label: string,
    readonly byteSize: number,
    private readonly undoCallback: () => void,
    private readonly redoCallback: () => void,
  ) {}

  undo(): void {
    this.undoCallback();
  }

  redo(): void {
    this.redoCallback();
  }
}

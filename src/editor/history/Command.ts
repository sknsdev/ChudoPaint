export interface Command {
  /** Human-readable operation name for history UI and assistive technologies. */
  label: string;
  /** Estimated owned memory in bytes, used to enforce the history budget. */
  byteSize: number;
  undo(): void;
  redo(): void;
}

export interface Command {
  /** Human-readable operation name for a future history panel and assistive UI. */
  label: string;
  undo(): void;
  redo(): void;
}

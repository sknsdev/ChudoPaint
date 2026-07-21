import { describe, expect, it } from "vitest";
import { CallbackCommand, CommandHistory } from "@/editor/history";

describe("CommandHistory", () => {
  it("undoes and redoes multiple commands in order", () => {
    const history = new CommandHistory();
    const values: string[] = [];
    const command = (label: string) =>
      new CallbackCommand(
        label,
        4,
        () => values.pop(),
        () => values.push(label),
      );

    values.push("one");
    history.push(command("one"));
    values.push("two");
    history.push(command("two"));

    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(values).toEqual([]);
    expect(history.redo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(values).toEqual(["one", "two"]);
  });

  it("clears redo commands after a new command", () => {
    const history = new CommandHistory();
    history.push(
      new CallbackCommand(
        "First",
        4,
        () => undefined,
        () => undefined,
      ),
    );
    expect(history.undo()).toBe(true);
    expect(history.info.redoCount).toBe(1);

    history.push(
      new CallbackCommand(
        "Second",
        4,
        () => undefined,
        () => undefined,
      ),
    );
    expect(history.info.redoCount).toBe(0);
    expect(history.redo()).toBe(false);
  });

  it("evicts the oldest undo command when the memory budget is exceeded", () => {
    const history = new CommandHistory(8);
    history.push(
      new CallbackCommand(
        "First",
        6,
        () => undefined,
        () => undefined,
      ),
    );
    history.push(
      new CallbackCommand(
        "Second",
        6,
        () => undefined,
        () => undefined,
      ),
    );

    expect(history.info.undoCount).toBe(1);
    expect(history.info.usedBytes).toBe(6);
    expect(history.info.latestLabel).toBe("Second");
  });
});

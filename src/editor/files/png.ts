import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const PNG_FILTER = {
  name: "PNG image",
  extensions: ["png"],
};

export interface DecodedPng {
  width: number;
  height: number;
  rgba: number[];
}

function normalizeSelectedPath(path: string | string[] | null): string | null {
  if (typeof path === "string") {
    return path;
  }

  return null;
}

export function documentNameFromPath(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? "Untitled";
  return filename.replace(/\.png$/i, "") || "Untitled";
}

export async function choosePngToOpen(): Promise<string | null> {
  const selection = await open({
    multiple: false,
    directory: false,
    filters: [PNG_FILTER],
    title: "Open PNG",
  });

  return normalizeSelectedPath(selection);
}

export async function decodePng(path: string): Promise<DecodedPng> {
  return invoke<DecodedPng>("open_png", { path });
}

export async function choosePngSavePath(defaultPath: string): Promise<string | null> {
  return save({
    defaultPath,
    filters: [PNG_FILTER],
    title: "Save PNG",
  });
}

export async function encodePng(
  path: string,
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Promise<string> {
  return invoke<string>("save_png", {
    path,
    width,
    height,
    rgba: Array.from(rgba),
  });
}

import type { Config } from "./index";

export function extensionsFromConfig(config: Config): string[] {
  const exts = ["ts"];
  if (config.js) exts.push("js");
  if (config.react) exts.push("tsx");
  if (config.js && config.react) exts.push("jsx");
  return exts;
}

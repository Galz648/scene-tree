/** Godot resource paths are project-relative after the res:// prefix. */
export function workspacePath(resourcePath: string): string {
  return resourcePath.startsWith("res://") ? resourcePath.slice("res://".length) : resourcePath;
}

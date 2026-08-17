/** `{{name}}` interpolation against upstream node outputs / loop items. */
export function interpolate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*([\w.#[\]-]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? `{{${key}}}` : value;
  });
}

export function outputsOf(nodes: Record<string, { output?: string }>): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = {};
  for (const [id, node] of Object.entries(nodes)) vars[id] = node.output;
  return vars;
}

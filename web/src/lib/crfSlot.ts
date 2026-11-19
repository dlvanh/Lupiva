/** Legacy CRF slots keep instance one; #n identifies a repeated measurement. */
export function parseSlot(slot: string) {
  const match = /^([^/]+)\/([^/#]+)(?:#([1-9]\d*))?$/.exec(slot);
  if (!match) throw new Error(`Invalid CRF slot: ${slot}`);
  const [, fieldId, component, number] = match;
  return { fieldId, component, instance: number ? Number(number) : 1, baseSlot: `${fieldId}/${component}` };
}

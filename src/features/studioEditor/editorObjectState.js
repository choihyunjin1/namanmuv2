export function getEditorObjectState(object) {
  return object?.metadata?.editor ?? {};
}

export function isObjectHidden(object) {
  return Boolean(getEditorObjectState(object).hidden);
}

export function isObjectLocked(object) {
  return Boolean(getEditorObjectState(object).locked);
}

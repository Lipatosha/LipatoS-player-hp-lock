const MODULE_ID = "lipatos-player-hp-lock";
const MESSAGE = "Изменять здоровье вручную может только ГМ.";
const LOCKED_PATHS = new Set([
  "system.attributes.hp.value",
  "system.attributes.hp.temp"
]);

function isPrivilegedUser() {
  return game.user?.isGM === true;
}

function getRootElement(app, html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (app?.element instanceof HTMLElement) return app.element;
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  return null;
}

function getActor(app) {
  const actor = app?.actor ?? app?.document ?? app?.object;
  return actor?.documentName === "Actor" ? actor : null;
}

function normalizePath(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getFieldPath(element) {
  if (!(element instanceof Element)) return null;

  const candidates = [
    element.getAttribute?.("name"),
    element.getAttribute?.("data-path"),
    element.getAttribute?.("data-property"),
    element.getAttribute?.("data-prop"),
    element.getAttribute?.("data-target"),
    element.dataset?.path,
    element.dataset?.property,
    element.dataset?.prop,
    element.dataset?.target
  ];

  for (const candidate of candidates) {
    const path = normalizePath(candidate);
    if (LOCKED_PATHS.has(path)) return path;
  }

  return null;
}

function findLockedField(start, root) {
  let element = start instanceof Element ? start : null;

  while (element) {
    const path = getFieldPath(element);
    if (path) return { element, path };

    if (element === root) break;
    element = element.parentElement;
  }

  return null;
}

function readActorValue(actor, path) {
  if (!actor || !path) return undefined;

  if (globalThis.foundry?.utils?.getProperty) {
    return foundry.utils.getProperty(actor, path);
  }

  if (path === "system.attributes.hp.value") return actor.system?.attributes?.hp?.value;
  if (path === "system.attributes.hp.temp") return actor.system?.attributes?.hp?.temp;
  return undefined;
}

function restoreDisplayedValue(field, actor, path) {
  if (!field || !("value" in field)) return;

  const current = readActorValue(actor, path);
  const value = current ?? "";

  queueMicrotask(() => {
    if (document.contains(field)) field.value = value;
  });
}

let lastWarningAt = 0;

function warnPlayer() {
  const now = Date.now();
  if (now - lastWarningAt < 600) return;
  lastWarningAt = now;
  ui.notifications?.warn(MESSAGE);
}

function blockManualEdit(event, root, actor) {
  if (isPrivilegedUser()) return;

  const locked = findLockedField(event.target, root);
  if (!locked) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  restoreDisplayedValue(locked.element, actor, locked.path);

  if (event.type !== "wheel") warnPlayer();
  return false;
}

function lockHealthFields(root, actor) {
  if (!root || !actor || isPrivilegedUser()) return;
  if (root.dataset?.lipatosHpGuard === "1") return;

  root.dataset.lipatosHpGuard = "1";

  const stop = event => blockManualEdit(event, root, actor);

  root.addEventListener("beforeinput", stop, true);
  root.addEventListener("input", stop, true);
  root.addEventListener("change", stop, true);
  root.addEventListener("paste", stop, true);
  root.addEventListener("drop", stop, true);
  root.addEventListener("wheel", stop, { capture: true, passive: false });

  root.addEventListener("keydown", event => {
    const locked = findLockedField(event.target, root);
    if (!locked) return;

    const allowed = new Set([
      "Tab",
      "Shift",
      "Control",
      "Alt",
      "Meta",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "Escape"
    ]);

    if (!allowed.has(event.key)) blockManualEdit(event, root, actor);
  }, true);
}

function onActorRender(app, html) {
  if (isPrivilegedUser()) return;

  const actor = getActor(app);
  if (!actor || actor.type !== "character" || !actor.isOwner) return;

  lockHealthFields(getRootElement(app, html), actor);
}

Hooks.on("renderActorSheet", onActorRender);
Hooks.on("renderActorSheetV2", onActorRender);
Hooks.on("renderApplicationV2", (app, html) => {
  const actor = getActor(app);
  if (actor?.type === "character") onActorRender(app, html);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);
});

const video = document.querySelector("#render-film");
const loader = document.querySelector(".loader");
const menu = document.querySelector(".menu-panel");
const menuCloseButton = document.querySelector(".menu-panel__close");
const menuTabList = document.querySelector(".menu-tabs");
const menuTabs = [...menuTabList.querySelectorAll("[role='tab']")];
const menuSceneHotspots = document.querySelector(".menu-scene-hotspots");
const visitSceneHotspots = document.querySelector(".visit-scene-hotspots");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SCRUB = Object.freeze({
  fallbackDuration: 40,
  easing: 0.19,
  seekThreshold: 0.012,
  snapThreshold: 0.002,
});

const SCENES = Object.freeze({
  menu: { start: 30.5, end: 35.8 },
  visit: { start: 38.3, end: Infinity },
});

const MENU_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp"]);

const state = {
  duration: SCRUB.fallbackDuration,
  targetTime: 0,
  renderedTime: 0,
  ready: false,
  animationFrame: 0,
  menuReturnFocus: null,
};

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getMaxScroll() {
  return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

function getTimeFromScroll() {
  const progress = window.scrollY / getMaxScroll();
  return progress * Math.max(0.01, state.duration - 0.04);
}

function getScrollFromTime(time) {
  return (clamp(time, 0, state.duration) / state.duration) * getMaxScroll();
}

function isTimeInScene(time, scene) {
  return time >= scene.start && time <= scene.end;
}

function updateSceneHotspots(time) {
  menuSceneHotspots.hidden = !isTimeInScene(time, SCENES.menu);
  visitSceneHotspots.hidden = !isTimeInScene(time, SCENES.visit);
}

function clearHorizontalDrift() {
  if (window.scrollX !== 0) {
    window.scrollTo({ top: window.scrollY, left: 0, behavior: "auto" });
  }
  menu.scrollLeft = 0;
}

function renderFrame() {
  if (state.ready) {
    const easing = prefersReducedMotion ? 1 : SCRUB.easing;
    const difference = state.targetTime - state.renderedTime;

    state.renderedTime += difference * easing;
    if (Math.abs(difference) < SCRUB.snapThreshold) {
      state.renderedTime = state.targetTime;
    }

    if (
      !video.seeking &&
      Math.abs(video.currentTime - state.renderedTime) > SCRUB.seekThreshold
    ) {
      video.currentTime = state.renderedTime;
    }

    updateSceneHotspots(state.renderedTime);
  }

  state.animationFrame = requestAnimationFrame(renderFrame);
}

function syncTargetTime() {
  clearHorizontalDrift();
  state.targetTime = getTimeFromScroll();
}

function seekTo(time) {
  if (!Number.isFinite(time)) return;

  const nextTime = clamp(time, 0, state.duration);
  state.targetTime = nextTime;
  state.renderedTime = nextTime;

  if (state.ready) video.currentTime = nextTime;

  window.scrollTo({
    top: getScrollFromTime(nextTime),
    left: 0,
    behavior: "auto",
  });
}

function getSelectedTab() {
  return menuTabs.find((tab) => tab.getAttribute("aria-selected") === "true");
}

function selectMenuTab(tab) {
  if (!tab || !menuTabList.contains(tab)) return;

  menuTabs.forEach((candidate) => {
    const selected = candidate === tab;
    const panelId = candidate.getAttribute("aria-controls");
    const panel = document.getElementById(panelId);

    candidate.setAttribute("aria-selected", String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    if (panel) panel.hidden = !selected;
  });

  requestAnimationFrame(clearHorizontalDrift);
}

function openMenu(tab = getSelectedTab()) {
  state.menuReturnFocus = document.activeElement;
  selectMenuTab(tab);
  menu.hidden = false;
  document.body.classList.add("menu-is-open");
  tab?.focus();
}

function closeMenu({ restoreFocus = true } = {}) {
  menu.hidden = true;
  document.body.classList.remove("menu-is-open");

  if (restoreFocus && state.menuReturnFocus instanceof HTMLElement) {
    state.menuReturnFocus.focus({ preventScroll: true });
  }

  state.menuReturnFocus = null;
  requestAnimationFrame(clearHorizontalDrift);
}

function initializeVideo() {
  if (state.ready) return;

  state.ready = true;
  state.duration =
    Number.isFinite(video.duration) && video.duration > 1
      ? video.duration
      : SCRUB.fallbackDuration;
  state.targetTime = getTimeFromScroll();
  state.renderedTime = state.targetTime;

  video.pause();
  video.currentTime = state.targetTime;
  updateSceneHotspots(state.renderedTime);
  loader.classList.add("is-ready");
}

function handleTabClick(event) {
  const tab =
    event.target instanceof Element
      ? event.target.closest("[role='tab']")
      : null;

  if (tab) selectMenuTab(tab);
}

function handleTabKeydown(event) {
  if (!MENU_KEYS.has(event.key)) return;

  const currentTab =
    event.target instanceof Element
      ? event.target.closest("[role='tab']")
      : null;
  const currentIndex = menuTabs.indexOf(currentTab);
  if (currentIndex < 0) return;

  event.preventDefault();

  const lastIndex = menuTabs.length - 1;
  const nextIndex = {
    ArrowLeft: (currentIndex - 1 + menuTabs.length) % menuTabs.length,
    ArrowRight: (currentIndex + 1) % menuTabs.length,
    Home: 0,
    End: lastIndex,
  }[event.key];

  const nextTab = menuTabs[nextIndex];
  selectMenuTab(nextTab);
  nextTab.focus();
}

function handleMenuWheel(event) {
  if (event.deltaY === 0) return;

  const scrollingDown = event.deltaY > 0;
  const atTop = menu.scrollTop <= 1;
  const atBottom = menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 1;
  const leavingMenu = scrollingDown ? atBottom : atTop;

  if (!leavingMenu) return;

  event.preventDefault();

  const distance =
    Math.sign(event.deltaY) * Math.max(120, Math.abs(event.deltaY));
  closeMenu({ restoreFocus: false });
  requestAnimationFrame(() => {
    window.scrollBy({ top: distance, left: 0, behavior: "auto" });
  });
}

function handleDocumentKeydown(event) {
  if (event.key === "Escape" && !menu.hidden) {
    closeMenu();
    return;
  }

  if (!SCROLL_KEYS.has(event.key) || !menu.hidden) return;
  if (
    event.target instanceof HTMLButtonElement ||
    event.target instanceof HTMLAnchorElement
  ) {
    return;
  }

  event.preventDefault();
  const direction = event.key.includes("Down") ? 1 : -1;
  window.scrollBy({
    top: direction * window.innerHeight * 0.8,
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
}

video.addEventListener("loadedmetadata", initializeVideo, { once: true });
video.addEventListener("canplay", initializeVideo, { once: true });
video.addEventListener("error", () => {
  loader.querySelector("p").textContent =
    "The experience film could not be loaded";
});

document.querySelectorAll("[data-time]").forEach((button) => {
  button.addEventListener("click", () => seekTo(Number(button.dataset.time)));
});

document.querySelectorAll("[data-menu-open]").forEach((button) => {
  button.addEventListener("click", () => openMenu());
});

document.querySelectorAll("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    openMenu(document.getElementById(button.dataset.openTab));
  });
});

menuCloseButton.addEventListener("click", () => closeMenu());
menuTabList.addEventListener("click", handleTabClick);
menuTabList.addEventListener("keydown", handleTabKeydown);
menu.addEventListener("wheel", handleMenuWheel, { passive: false });

window.addEventListener("scroll", syncTargetTime, { passive: true });
window.addEventListener("resize", syncTargetTime);
window.addEventListener("pageshow", clearHorizontalDrift);
window.addEventListener("pagehide", () =>
  cancelAnimationFrame(state.animationFrame),
);
document.addEventListener("keydown", handleDocumentKeydown);

if (video.readyState >= 1) initializeVideo();

syncTargetTime();
state.animationFrame = requestAnimationFrame(renderFrame);

/* Shared canvas primitives. Floating UI is bundled locally under vendor/. */
"use strict";
window.CanvasUI = (() => {
  const { computePosition, autoUpdate, offset, flip, shift, size } = FloatingUIDOM;
  const selects = new WeakMap();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function reveal(el, distance = 6) {
    if (reducedMotion.matches || !window.Motion) return;
    Motion.animate(el, { opacity: [0, 1], y: [distance, 0] }, { duration: .18, ease: [.22, 1, .36, 1] });
  }
  const dialogObserver = new MutationObserver(records => {
    for (const { target } of records) if (target.open) reveal(target, target.id === "library-dialog" ? 10 : 6);
  });
  document.querySelectorAll("dialog").forEach(el => dialogObserver.observe(el, { attributes: true, attributeFilter: ["open"] }));
  let active = null, serial = 0;
  const create = (tag, cls, text) => {
    const el = document.createElement(tag);
    el.className = cls || "";
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const isEditing = (target) => !!target?.closest('input,textarea,[contenteditable="true"],[role="textbox"]');
  const items = (popup) => [...popup.querySelectorAll('button:not(:disabled),a[href]')].filter(el => !el.hidden);
  function close(restoreFocus = false) {
    if (!active) return;
    const current = active;
    active = null;
    current.subCleanup?.();
    current.cleanup?.();
    current.popup.remove();
    current.trigger?.setAttribute("aria-expanded", "false");
    current.onClose?.();
    if (restoreFocus && current.trigger?.isConnected) current.trigger.focus({ preventScroll: true });
  }
  function open(content, { anchor, point, role = "menu", label = "操作菜单", placement = "bottom-start", onClose, selectedIndex = 0, width } = {}) {
    close();
    const popup = create("div", "ui-popup");
    popup.id = `ui-popup-${++serial}`;
    popup.setAttribute("role", role);
    popup.setAttribute("aria-label", label);
    popup.setAttribute("popover", "manual");
    popup.append(content);
    if (width) popup.style.width = width + "px";
    (anchor?.closest("dialog[open]") || document.querySelector("dialog[open]") || document.body).append(popup);
    popup.showPopover?.();
    anchor?.setAttribute("aria-expanded", "true");
    anchor?.setAttribute("aria-controls", popup.id);
    const reference = point ? { getBoundingClientRect: () => ({ x: point.x, y: point.y, left: point.x, top: point.y, right: point.x, bottom: point.y, width: 0, height: 0 }) } : anchor;
    const current = { popup, trigger: anchor, onClose };
    active = current;
    let positioned = false;
    const update = () => {
      if (anchor && !anchor.isConnected) return close();
      computePosition(reference, popup, {
        strategy: "fixed", placement,
        middleware: [offset(7), flip({ padding: 12 }), shift({ padding: 12 }), size({ padding: 12, apply({ availableHeight, elements }) { elements.floating.style.maxHeight = Math.max(80, availableHeight) + "px"; } })],
      }).then(({ x, y }) => {
        if (active !== current) return;
        Object.assign(popup.style, { left: `${x}px`, top: `${y}px`, visibility: "visible" });
        if (!positioned) { positioned = true; if (role === "listbox" && !reducedMotion.matches) {
          const above = anchor && y < anchor.getBoundingClientRect().top;
          popup.animate([{clipPath:above?"inset(calc(100% - 8px) 0 0 round 12px)":"inset(0 0 calc(100% - 8px) round 12px)",opacity:.4},{clipPath:"inset(0 round 12px)",opacity:1}],{duration:220,easing:"cubic-bezier(.22,1,.36,1)"});
        } else reveal(popup,4); focus(Math.max(0, selectedIndex)); }
      });
    };
    current.cleanup = autoUpdate(reference, popup, update);
    const options = items(popup);
    options.forEach(el => el.tabIndex = -1);
    const focus = (index) => {
      const option = options[(index + options.length) % options.length];
      if (!option) return;
      options.forEach(el => el.tabIndex = el === option ? 0 : -1);
      option.focus({ preventScroll: true });
      option.scrollIntoView({ block: "nearest" });
    };
    focus(Math.max(0, selectedIndex));
    popup.addEventListener("pointermove", e => { const item = e.target.closest("button,a"); if(item && options.includes(item) && document.activeElement !== item) item.focus({preventScroll:true}); });
    let typed = "", timer;
    popup.addEventListener("keydown", e => {
      e.stopPropagation();
      const index = options.indexOf(document.activeElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        focus(e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : index + (e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") close(true);
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && e.key !== " ") {
        typed += e.key.toLocaleLowerCase(); clearTimeout(timer);
        timer = setTimeout(() => typed = "", 600);
        const found = options.findIndex(el => (el.dataset.label || el.textContent).toLocaleLowerCase().startsWith(typed));
        if (found >= 0) focus(found);
      }
    });
    return popup;
  }
  function menu(entries, options = {}) {
    const content = create("div", "ui-menu-items");
    for (const raw of entries) {
      if (!raw || raw.separator) { content.append(create("div", "ui-separator")); continue; }
      const item = Array.isArray(raw) ? { label: raw[0], action: raw[1] } : raw;
      const b = create("button", "ui-menu-item" + (item.danger ? " danger" : ""));
      b.type = "button";
      b.dataset.label = item.label;
      b.setAttribute("role", options.role === "listbox" ? "option" : "menuitem");
      if (options.role === "listbox") b.setAttribute("aria-selected", String(!!item.selected));
      b.disabled = !!item.disabled;
      const check = create("span", "ui-menu-check", item.selected ? "✓" : item.glyph || "");
      const copy = create("span", "ui-menu-copy", item.label);
      if (item.description) copy.append(create("small", "", item.description));
      b.append(check, copy);
      if (item.shortcut) b.append(create("kbd", "ui-shortcut", item.shortcut));
      if (item.children) {
        b.setAttribute("aria-haspopup","menu"); b.setAttribute("aria-expanded","false");
        b.append(create("span","ui-sub-arrow","›"));
        const expand = () => {
          const parent = active; if (!parent || parent.subTrigger === b) return;
          parent.subCleanup?.();
          const sub=create("div","ui-popup ui-submenu"); sub.setAttribute("role","menu");sub.setAttribute("aria-label",item.label);sub.setAttribute("popover","manual");
          parent.popup.append(sub);sub.showPopover();b.setAttribute("aria-expanded","true");parent.subTrigger=b;
          for(const child of item.children){
            const option=create("button","ui-menu-item",child.label);option.setAttribute("role","menuitem");
            option.onclick=e=>{e.stopPropagation();close(true);Promise.resolve().then(child.action).catch(error=>document.dispatchEvent(new CustomEvent("canvas-ui-error",{detail:error})));};sub.append(option);
          }
          const cleanup=autoUpdate(b,sub,()=>computePosition(b,sub,{strategy:"fixed",placement:"right-start",middleware:[offset(4),flip({padding:8}),shift({padding:8})]}).then(({x,y})=>Object.assign(sub.style,{left:x+"px",top:y+"px",visibility:"visible"})));
          parent.subCleanup=()=>{cleanup();sub.remove();b.setAttribute("aria-expanded","false");parent.subTrigger=null;};
          sub.addEventListener("keydown",e=>{e.stopPropagation();const rows=items(sub),index=rows.indexOf(document.activeElement);if(e.key==="ArrowLeft"||e.key==="Escape"){parent.subCleanup();b.focus();}else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();rows[(index+(e.key==="ArrowDown"?1:rows.length-1))%rows.length]?.focus();}});
        };
        b.addEventListener("pointerenter",expand);
        b.addEventListener("click",e=>{e.stopPropagation();expand();});
        b.addEventListener("keydown",e=>{if(e.key==="ArrowRight"){e.preventDefault();expand();active?.popup.querySelector('.ui-submenu button')?.focus();}});
        content.append(b);continue;
      }
      b.addEventListener("pointerenter",()=>active?.subCleanup?.());
      b.addEventListener("click", e => {
        e.stopPropagation(); close(true);
        Promise.resolve().then(() => item.action?.()).catch(error => document.dispatchEvent(new CustomEvent("canvas-ui-error", { detail: error })));
      });
      content.append(b);
    }
    return open(content, options);
  }
  function enhanceSelect(select) {
    if (select.multiple || select.size > 1) return;
    let state = selects.get(select);
    if (!state) {
      const wrapper = create("span", "ui-select " + select.className);
      const trigger = create("button", "ui-select-trigger");
      trigger.type = "button";
      trigger.setAttribute("role", "combobox");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      const label = create("span", "ui-select-value");
      trigger.append(label, create("span", "ui-chevron"));
      select.before(wrapper); wrapper.append(select, trigger);
      select.hidden = true;
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");
      state = { wrapper, trigger, label };
      selects.set(select, state);
      const show = () => {
        if (active?.trigger === trigger) return close(true);
        const options = [...select.options];
        menu(options.map(option => ({
          label: option.label, selected: option.selected, disabled: option.disabled,
          action: () => { select.value = option.value; updateSelect(select); select.dispatchEvent(new Event("change", { bubbles: true })); },
        })), { anchor: trigger, role: "listbox", label: trigger.getAttribute("aria-label"), selectedIndex: options.filter(o => !o.disabled).findIndex(o => o.selected), width: Math.max(180, trigger.getBoundingClientRect().width) });
      };
      trigger.addEventListener("click", show);
      trigger.addEventListener("keydown", e => {
        if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); show(); }
      });
      select.addEventListener("change", () => updateSelect(select));
    }
    updateSelect(select);
  }
  function updateSelect(select) {
    const state = selects.get(select);
    if (!state) return;
    const text = select.selectedOptions[0]?.label || "请选择";
    if (state.label.textContent !== text) state.label.textContent = text;
    state.trigger.disabled = select.disabled;
    state.trigger.setAttribute("aria-label", select.getAttribute("aria-label") || [...select.labels].map(l => l.textContent).join(" ") || "选择选项");
    state.wrapper.dataset.selectId = select.id || "";
    state.trigger.title = select.title || state.label.textContent;
  }
  function enhanceDetails(details) {
    if (details.dataset.uiMenu) return;
    const summary = details.querySelector(":scope > summary"), content = details.querySelector(":scope > .dropdown");
    if (!summary || !content) return;
    details.dataset.uiMenu = "true";
    summary.setAttribute("aria-haspopup", "menu");
    summary.setAttribute("aria-expanded", "false");
    summary.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      if (active?.trigger === summary) return close(true);
      details.open = false;
      content.classList.add("ui-static-menu");
      content.querySelectorAll("button,a").forEach(el => el.setAttribute("role", "menuitem"));
      open(content, { anchor: summary, label: summary.getAttribute("aria-label") || summary.textContent.trim(), placement: details.closest(".creation-dock") ? "top-end" : "bottom-start", onClose: () => { content.classList.remove("ui-static-menu"); details.append(content); } });
    });
    // Canvas button handlers stop bubbling; dismiss before the item action runs.
    content.addEventListener("click", e => { if (e.target.closest("button,a")) close(); }, true);
  }
  const tabLists = new WeakSet();
  function enhanceTabs(list) {
    if (tabLists.has(list)) return;
    tabLists.add(list);
    const indicator = create("span", "tab-indicator");
    indicator.setAttribute("aria-hidden", "true"); list.prepend(indicator);
    let initialized = false, animation;
    const update = () => {
      const tab = list.querySelector('[role="tab"][aria-selected="true"]');
      if (!tab || !tab.offsetWidth) { initialized = false; return; }
      const x = tab.offsetLeft - 4, width = tab.offsetWidth;
      animation?.stop();
      if (initialized && !reducedMotion.matches && window.Motion) animation = Motion.animate(indicator, { x, width }, { type: "spring", stiffness: 420, damping: 36 });
      else { indicator.style.transform = `translateX(${x}px)`; indicator.style.width = width + "px"; }
      initialized = true;
    };
    new MutationObserver(update).observe(list, { attributes: true, attributeFilter: ["aria-selected"], subtree: true });
    new ResizeObserver(update).observe(list); update();
    list.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const tabs = [...list.querySelectorAll('[role="tab"]')], index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      e.preventDefault();
      const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click(); tabs[next].focus();
    });
  }
  function enhance(root = document) {
    if (root.matches?.(".asset-tabs,.view-tabs")) enhanceTabs(root);
    root.querySelectorAll?.(".asset-tabs,.view-tabs").forEach(enhanceTabs);
    if (root.matches?.("select")) enhanceSelect(root);
    root.querySelectorAll?.("select").forEach(enhanceSelect);
    if (root.matches?.("details")) enhanceDetails(root);
    root.querySelectorAll?.("details").forEach(enhanceDetails);
  }
  document.addEventListener("pointerdown", e => { if (active && !active.popup.contains(e.target) && !active.trigger?.contains(e.target)) close(); }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && active) { e.preventDefault(); e.stopPropagation(); close(true); } }, true);
  window.addEventListener("blur", () => close());
  document.addEventListener("close", () => close(), true);
  // Only inspect newly mounted controls; avoid scanning the whole canvas on mutations.
  const observer = new MutationObserver(records => {
    const roots = new Set(), changes = new Set();
    for (const record of records) {
      const select = record.target.closest?.("select");
      if (select && selects.has(select)) changes.add(select);
      for (const added of record.addedNodes) if (added.nodeType === 1 && !added.closest(".ui-popup")) roots.add(added);
    }
    for (const root of roots) if (root.isConnected) enhance(root);
    changes.forEach(updateSelect);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { menu, close, enhance, reveal, isEditing, get isOpen() { return !!active; } };
})();

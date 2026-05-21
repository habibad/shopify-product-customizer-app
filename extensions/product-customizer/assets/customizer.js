/* Product Customizer — storefront widget. Vanilla JS, no dependencies. */
(function () {
  "use strict";

  const ctx = window.__PRODUCT_CUSTOMIZER__;
  if (!ctx) return;

  // ---- Strip trailing slash from API base ----
  const API_BASE = (ctx.apiBase || "").replace(/\/$/, "");
  if (!API_BASE || API_BASE.includes("your-app-url")) {
    console.warn(
      "[ProductCustomizer] API base not configured. Set the 'App URL' field in the theme editor App Embed.",
    );
    return;
  }

  // ---- State ----
  let config = null;
  // selections: { [groupId]: { type, value, optionId?, label?, priceDelta, layerUrl? } }
  let selections = {};
  let basePrice = 0; // in cents

  // ---- Utility: format money like Shopify ----
  function formatMoney(cents) {
    const amount = (cents / 100).toFixed(2);
    const fmt = ctx.moneyFormat || "${{amount}}";
    return fmt.replace(/\{\{\s*amount\s*\}\}/g, amount);
  }

  // ---- Fetch config from app ----
  async function loadConfig() {
    const url = `${API_BASE}/api/customizer?shop=${encodeURIComponent(
      ctx.shop,
    )}&productId=${encodeURIComponent(ctx.productId)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!json.enabled) return null;
      return json.config;
    } catch (e) {
      console.error("[ProductCustomizer] Failed to load config:", e);
      return null;
    }
  }

  // ---- Build the launch button on the product page ----
  function buildLaunchButton() {
    const btn = document.createElement("button");
    btn.className = "pc-launch-btn";
    btn.type = "button";
    btn.textContent = ctx.buttonText || "Customize this product";
    if (ctx.buttonColor) btn.style.background = ctx.buttonColor;
    btn.addEventListener("click", openModal);

    // Try to inject near the existing add-to-cart form
    const form =
      document.querySelector('form[action*="/cart/add"]') ||
      document.querySelector("product-form") ||
      document.querySelector(".product-form");
    if (form) {
      form.parentNode.insertBefore(btn, form);
    } else {
      // Fallback: top of main content
      const main = document.querySelector("main") || document.body;
      main.insertBefore(btn, main.firstChild);
    }
  }

  // ---- Build the modal ----
  function buildModal() {
    const modal = document.createElement("div");
    modal.className = "pc-modal";
    modal.id = "pc-modal";
    modal.innerHTML = `
      <div class="pc-modal-content">
        <div class="pc-preview-pane">
          <div class="pc-preview-stage" id="pc-stage"></div>
        </div>
        <div class="pc-controls-pane">
          <div class="pc-modal-header">
            <h2>${escapeHtml(ctx.modalTitle || "Customize your product")}</h2>
            <button class="pc-close-btn" type="button" aria-label="Close">×</button>
          </div>
          <div class="pc-error" id="pc-error" style="display:none"></div>
          <div id="pc-groups"></div>
          <div class="pc-footer">
            <div class="pc-price" id="pc-price"></div>
            <button class="pc-add-to-cart" type="button" id="pc-add-to-cart">
              Add to cart
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".pc-close-btn").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    modal
      .querySelector("#pc-add-to-cart")
      .addEventListener("click", handleAddToCart);
  }

  // ---- Render preview stage (layered images + text overlays) ----
  function renderPreview() {
    const stage = document.getElementById("pc-stage");
    if (!stage) return;

    const baseUrl = config.baseImageUrl || ctx.featuredImage;
    let html = "";

    if (baseUrl) {
      html += `<img class="pc-layer" src="${escapeAttr(baseUrl)}" style="z-index:0" alt="">`;
    }

    // Stack option layers in zIndex order
    const layerGroups = config.groups
      .filter((g) => ["color", "size", "addon"].includes(g.type))
      .sort((a, b) => a.zIndex - b.zIndex);
    layerGroups.forEach((g) => {
      const sel = selections[g.id];
      if (sel && sel.layerUrl) {
        html += `<img class="pc-layer" src="${escapeAttr(sel.layerUrl)}" style="z-index:${g.zIndex + 1}" alt="">`;
      }
    });

    // Mask (top of color layers, below text)
    if (config.maskImageUrl) {
      html += `<img class="pc-layer pc-mask" src="${escapeAttr(config.maskImageUrl)}" style="z-index:90" alt="">`;
    }

    // Text/number overlays (free-positioned)
    config.groups
      .filter((g) => g.type === "text" || g.type === "number")
      .forEach((g) => {
        const sel = selections[g.id];
        if (sel && sel.value) {
          const pos = sel.position || { x: 50, y: 50 };
          html += `<div class="pc-text-overlay" data-group-id="${g.id}"
                     style="left:${pos.x}%; top:${pos.y}%; transform:translate(-50%,-50%); z-index:100; color:${sel.textColor || "#fff"}; font-size:${sel.fontSize || 32}px;">
                     ${escapeHtml(sel.value)}
                   </div>`;
        }
      });

    stage.innerHTML = html;

    // Wire up drag for text overlays
    stage.querySelectorAll(".pc-text-overlay").forEach((el) => {
      makeDraggable(el, stage);
    });
  }

  // ---- Drag text overlays ----
  function makeDraggable(el, container) {
    let dragging = false;
    const onDown = (e) => {
      dragging = true;
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      const groupId = el.dataset.groupId;
      if (selections[groupId]) {
        selections[groupId].position = {
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y)),
        };
      }
      el.style.left = x + "%";
      el.style.top = y + "%";
    };
    const onUp = () => {
      dragging = false;
    };
    el.addEventListener("mousedown", onDown);
    el.addEventListener("touchstart", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
  }

  // ---- Render groups in the controls pane ----
  function renderGroups() {
    const container = document.getElementById("pc-groups");
    if (!container) return;
    container.innerHTML = config.groups
      .map((g) => renderGroup(g))
      .join("");

    // Wire events
    container.querySelectorAll(".pc-swatch").forEach((el) => {
      el.addEventListener("click", () => {
        const groupId = el.dataset.groupId;
        const optionId = el.dataset.optionId;
        selectOption(groupId, optionId);
      });
    });
    container.querySelectorAll(".pc-size-btn").forEach((el) => {
      el.addEventListener("click", () => {
        selectOption(el.dataset.groupId, el.dataset.optionId);
      });
    });
    container.querySelectorAll(".pc-text-input").forEach((el) => {
      el.addEventListener("input", () => {
        const groupId = el.dataset.groupId;
        const group = config.groups.find((g) => g.id === groupId);
        selections[groupId] = {
          type: group.type,
          value: el.value,
          priceDelta: 0,
          position: selections[groupId]?.position || { x: 50, y: 70 },
          textColor: selections[groupId]?.textColor || "#fff",
          fontSize: selections[groupId]?.fontSize || 32,
        };
        renderPreview();
        renderPrice();
      });
    });
    container.querySelectorAll(".pc-file-input").forEach((el) => {
      el.addEventListener("change", () => {
        handleFileUpload(el);
      });
    });
    container.querySelectorAll(".pc-addon input").forEach((el) => {
      el.addEventListener("change", () => {
        const groupId = el.dataset.groupId;
        const optionId = el.dataset.optionId;
        if (el.checked) {
          selectOption(groupId, optionId);
        } else {
          delete selections[groupId];
          renderPreview();
          renderPrice();
        }
      });
    });
  }

  function renderGroup(g) {
    const req = g.required
      ? '<span class="pc-required">*</span>'
      : "";
    const label = `<label class="pc-group-label">${escapeHtml(g.name)}${req}</label>`;

    if (g.type === "color") {
      return `<div class="pc-group">${label}<div class="pc-swatches">${g.options
        .map((o) => {
          const bg = o.iconUrl
            ? `background-image:url(${escapeAttr(o.iconUrl)})`
            : `background-color:${escapeAttr(o.colorHex || "#ccc")}`;
          const sel =
            selections[g.id]?.optionId === o.id ? " pc-selected" : "";
          return `<div class="pc-swatch${sel}" style="${bg}"
                       data-group-id="${g.id}" data-option-id="${o.id}"
                       title="${escapeAttr(o.label)}"></div>`;
        })
        .join("")}</div></div>`;
    }

    if (g.type === "size") {
      return `<div class="pc-group">${label}<div class="pc-size-buttons">${g.options
        .map((o) => {
          const sel =
            selections[g.id]?.optionId === o.id ? " pc-selected" : "";
          return `<button type="button" class="pc-size-btn${sel}"
                     data-group-id="${g.id}" data-option-id="${o.id}">${escapeHtml(o.label)}</button>`;
        })
        .join("")}</div></div>`;
    }

    if (g.type === "text") {
      const max = g.maxLength ? `maxlength="${g.maxLength}"` : "";
      return `<div class="pc-group">${label}
        <input type="text" class="pc-text-input" data-group-id="${g.id}" ${max} placeholder="Enter text">
        <div class="pc-input-hint">Tip: drag the text on the preview to position it.</div>
      </div>`;
    }

    if (g.type === "number") {
      const max = g.maxLength ? `maxlength="${g.maxLength}"` : "";
      return `<div class="pc-group">${label}
        <input type="text" inputmode="numeric" pattern="[0-9]*" class="pc-text-input" data-group-id="${g.id}" ${max} placeholder="Enter number">
      </div>`;
    }

    if (g.type === "upload") {
      return `<div class="pc-group">${label}
        <input type="file" class="pc-file-input" data-group-id="${g.id}" accept="image/*">
        <div class="pc-input-hint">PNG, JPG, or SVG, max 5MB.</div>
      </div>`;
    }

    if (g.type === "addon") {
      return `<div class="pc-group">${label}${g.options
        .map((o) => {
          const checked =
            selections[g.id]?.optionId === o.id ? "checked" : "";
          const priceTxt =
            o.price > 0 ? `<span class="pc-addon-price">+${formatMoney(o.price * 100)}</span>` : "";
          return `<label class="pc-addon">
              <input type="checkbox" data-group-id="${g.id}" data-option-id="${o.id}" ${checked}>
              <span>${escapeHtml(o.label)}</span>${priceTxt}
            </label>`;
        })
        .join("")}</div>`;
    }

    return "";
  }

  // ---- File upload (data URL preview, kept in selection) ----
  function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showError("File too large (max 5MB)");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const groupId = input.dataset.groupId;
      selections[groupId] = {
        type: "upload",
        value: file.name,
        dataUrl: reader.result,
        priceDelta: 0,
      };
      renderPrice();
    };
    reader.readAsDataURL(file);
  }

  // ---- Pick an option for a color/size/addon group ----
  function selectOption(groupId, optionId) {
    const group = config.groups.find((g) => g.id === groupId);
    const option = group.options.find((o) => o.id === optionId);
    if (!group || !option) return;

    selections[groupId] = {
      type: group.type,
      optionId: option.id,
      value: option.value,
      label: option.label,
      layerUrl: option.layerUrl,
      priceDelta: option.price * 100, // store in cents
    };
    renderGroups();
    renderPreview();
    renderPrice();
  }

  // ---- Calculate and render total price ----
  function renderPrice() {
    const extras = Object.values(selections).reduce(
      (sum, s) => sum + (s.priceDelta || 0),
      0,
    );
    const total = basePrice + extras;
    const el = document.getElementById("pc-price");
    if (el) el.textContent = `Total: ${formatMoney(total)}`;
  }

  // ---- Show error ----
  function showError(msg) {
    const el = document.getElementById("pc-error");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(() => {
      el.style.display = "none";
    }, 4000);
  }

  // ---- Validate required groups ----
  function validate() {
    for (const g of config.groups) {
      if (g.required && !selections[g.id]) {
        showError(`Please complete: ${g.name}`);
        return false;
      }
    }
    return true;
  }

  // ---- Add to cart ----
  async function handleAddToCart() {
    if (!validate()) return;
    const btn = document.getElementById("pc-add-to-cart");
    btn.disabled = true;
    btn.textContent = "Adding...";

    try {
      // Save design to our app first
      const saveRes = await fetch(`${API_BASE}/api/customizer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: ctx.shop,
          productId: ctx.productId,
          selections,
          totalPrice:
            (basePrice +
              Object.values(selections).reduce(
                (s, x) => s + (x.priceDelta || 0),
                0,
              )) /
            100,
        }),
      });
      const saveJson = await saveRes.json();
      const designId = saveJson.designId || "";

      // Build line item properties from selections
      const properties = {};
      Object.entries(selections).forEach(([groupId, sel]) => {
        const group = config.groups.find((g) => g.id === groupId);
        if (!group) return;
        if (sel.label) {
          properties[group.name] = sel.label;
        } else if (sel.value) {
          properties[group.name] = sel.value;
        }
      });
      if (designId) properties._design_id = designId;

      // Get first variant id from product
      const variantId = await getFirstVariantId();
      if (!variantId) throw new Error("No variant found");

      // Call Shopify cart API
      const cartRes = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: variantId, quantity: 1, properties }],
        }),
      });
      if (!cartRes.ok) throw new Error("Cart add failed");

      // Navigate to cart
      window.location.href = "/cart";
    } catch (e) {
      console.error(e);
      showError("Could not add to cart. Please try again.");
      btn.disabled = false;
      btn.textContent = "Add to cart";
    }
  }

  async function getFirstVariantId() {
    try {
      const res = await fetch(`/products/${ctx.productHandle}.js`);
      const data = await res.json();
      return data.variants?.[0]?.id;
    } catch {
      return null;
    }
  }

  // ---- Open/close modal ----
  async function openModal() {
    const modal = document.getElementById("pc-modal");
    if (!modal) return;
    modal.classList.add("pc-open");
    document.body.style.overflow = "hidden";

    if (!config) {
      const groupsEl = document.getElementById("pc-groups");
      if (groupsEl)
        groupsEl.innerHTML =
          '<div class="pc-loading">Loading customization options...</div>';

      config = await loadConfig();
      if (!config) {
        if (groupsEl)
          groupsEl.innerHTML =
            '<div class="pc-error" style="display:block">Customizer is not configured for this product yet.</div>';
        return;
      }
    }

    renderGroups();
    renderPreview();
    renderPrice();
  }

  function closeModal() {
    document.getElementById("pc-modal")?.classList.remove("pc-open");
    document.body.style.overflow = "";
  }

  // ---- HTML escaping ----
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // ---- Boot ----
  async function init() {
    // Check if customizer is even enabled for this product before showing button
    const cfg = await loadConfig();
    if (!cfg) return; // silently exit, no button shown

    config = cfg;
    buildLaunchButton();
    buildModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

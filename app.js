/* Candle Cost Calculator — local-first MVP. The model is kept separate from the DOM
   so a future API/storage layer can replace only the persistence functions. */
const STORAGE_KEYS = {
  recipes: "candle-cost-recipes-v1",
  settings: "candle-cost-settings-v1",
  draft: "candle-cost-draft-v1",
};

const DEFAULT_SETTINGS = {
  hourlyRate: 500,
  lossPercent: 5,
  taxPercent: 0,
  marketplaceFee: 0,
  electricityCost: 0,
  packagingCost: 0,
};

const BASE_RECIPE = {
  name: "Новая свеча",
  waxType: "Соевый",
  waxPrice: 0,
  waxWeight: 180,
  fragrancePrice: 0,
  fragranceLoad: 8,
  wickPrice: 0,
  wickQty: 1,
  jarCost: 0,
  lidCost: 0,
  hardwareCost: 0,
  dyeCost: 0,
  decorCost: 0,
  labelCost: 0,
  miscMaterialCost: 0,
  otherMaterialCost: 0,
  boxCost: 0,
  fillerCost: 0,
  ribbonCost: 0,
  cardCost: 0,
  extraPackagingCost: 0,
  productionMinutes: 0,
  hourlyRate: 500,
  electricityCost: 0,
  depreciationCost: 0,
  lossPercent: 5,
  pricingMode: "markup",
  markupPercent: 100,
  targetMargin: 60,
  marketplaceFee: 0,
  acquiringFee: 0,
  taxPercent: 0,
  logisticsCost: 0,
  advertisingCost: 0,
  otherSalesCost: 0,
};

const PERCENT_LIMITS = {
  fragranceLoad: 100, lossPercent: 100, marketplaceFee: 100,
  acquiringFee: 100, taxPercent: 100, targetMargin: 99.9, markupPercent: 1000,
};
const SCENARIO_PRICES = [699, 799, 899, 999, 1199, 1499];

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Math.round(value || 0));
const preciseMoney = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value || 0) + " ₽";
const percent = (value) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value || 0)}%`;
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getDefaults() { return { ...DEFAULT_SETTINGS, ...readJSON(STORAGE_KEYS.settings, {}) }; }
function createRecipe() {
  const settings = getDefaults();
  return { ...BASE_RECIPE, hourlyRate: settings.hourlyRate, lossPercent: settings.lossPercent, taxPercent: settings.taxPercent, marketplaceFee: settings.marketplaceFee, electricityCost: settings.electricityCost, extraPackagingCost: settings.packagingCost };
}

const savedRecipes = readJSON(STORAGE_KEYS.recipes, []);
const savedDraft = readJSON(STORAGE_KEYS.draft, null);
let state = {
  recipe: savedDraft?.recipe ? { ...createRecipe(), ...savedDraft.recipe } : createRecipe(),
  activeRecipeId: savedRecipes.some((recipe) => recipe.id === savedDraft?.activeRecipeId) ? savedDraft.activeRecipeId : null,
  recipes: savedRecipes,
  settings: getDefaults(),
  comparison: [],
  whatIfDirty: false,
};

function calculate(recipe, forcedPrice) {
  const r = { ...BASE_RECIPE, ...recipe };
  const wax = number(r.waxPrice) / 1000 * number(r.waxWeight);
  const fragranceWeight = number(r.waxWeight) * number(r.fragranceLoad) / 100;
  const fragrance = number(r.fragrancePrice) / 1000 * fragranceWeight;
  const wick = number(r.wickPrice) * number(r.wickQty);
  const jar = number(r.jarCost);
  const lid = number(r.lidCost);
  const hardware = number(r.hardwareCost);
  const container = jar + lid + hardware;
  const dyeAndDecor = number(r.dyeCost) + number(r.decorCost);
  const label = number(r.labelCost);
  const miscMaterials = number(r.miscMaterialCost);
  const decor = dyeAndDecor + label + miscMaterials;
  const otherMaterials = number(r.otherMaterialCost);
  const packaging = number(r.boxCost) + number(r.fillerCost) + number(r.ribbonCost) + number(r.cardCost) + number(r.extraPackagingCost);
  const materials = wax + fragrance + wick + container + decor + otherMaterials + packaging;
  const loss = materials * number(r.lossPercent) / 100;
  const labor = number(r.productionMinutes) / 60 * number(r.hourlyRate);
  const cost = materials + loss + labor + number(r.electricityCost) + number(r.depreciationCost);
  const recommendedPrice = r.pricingMode === "margin"
    ? (number(r.targetMargin) >= 100 ? 0 : cost / (1 - number(r.targetMargin) / 100))
    : cost * (1 + number(r.markupPercent) / 100);
  const sellingPrice = forcedPrice === undefined ? recommendedPrice : number(forcedPrice);
  const marketplaceFee = sellingPrice * number(r.marketplaceFee) / 100;
  const acquiringFee = sellingPrice * number(r.acquiringFee) / 100;
  const tax = sellingPrice * number(r.taxPercent) / 100;
  const logisticsAndAds = number(r.logisticsCost) + number(r.advertisingCost);
  const saleOther = number(r.otherSalesCost);
  const fees = marketplaceFee + acquiringFee;
  const profit = sellingPrice - cost - fees - tax - logisticsAndAds - saleOther;
  const margin = sellingPrice > 0 ? profit / sellingPrice * 100 : 0;
  return { wax, fragranceWeight, fragrance, wick, jar, lid, hardware, container, dyeAndDecor, label, miscMaterials, decor, otherMaterials, packaging, materials, loss, labor, cost, recommendedPrice, sellingPrice, marketplaceFee, acquiringFee, tax, logisticsAndAds, saleOther, fees, profit, margin };
}

function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function currentCalc() { return calculate(state.recipe); }

function populateForm() {
  $$('[data-key]').forEach((input) => {
    const key = input.dataset.key;
    if (input.type === "radio") input.checked = state.recipe[key] === input.value;
    else input.value = state.recipe[key] ?? "";
  });
  $$('input[name="pricingMode"]').forEach((input) => input.checked = input.value === state.recipe.pricingMode);
  $('#candleName').value = state.recipe.name || "";
  $$('[data-setting]').forEach((input) => { input.value = state.settings[input.dataset.setting] ?? 0; });
  togglePricingMode();
  syncWhatIf();
}

function render() {
  const c = currentCalc();
  setText("wax-cost", preciseMoney(c.wax));
  setText("fragrance-weight", `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(c.fragranceWeight)} г`);
  setText("fragrance-cost", preciseMoney(c.fragrance));
  setText("wick-cost", preciseMoney(c.wick));
  setText("container-cost", preciseMoney(c.container));
  setText("packaging-cost", preciseMoney(c.packaging));
  setText("labor-cost", preciseMoney(c.labor));
  setText("loss-cost", preciseMoney(c.loss));

  setText("sum-wax", preciseMoney(c.wax)); setText("sum-fragrance", preciseMoney(c.fragrance)); setText("sum-wick", preciseMoney(c.wick));
  setText("sum-jar", preciseMoney(c.jar)); setText("sum-lid", preciseMoney(c.lid)); setText("sum-hardware", preciseMoney(c.hardware));
  setText("sum-decor", preciseMoney(c.dyeAndDecor)); setText("sum-label", preciseMoney(c.label)); setText("sum-packaging", preciseMoney(c.packaging));
  setText("sum-other-materials", preciseMoney(c.miscMaterials + c.otherMaterials)); setText("sum-labor", preciseMoney(c.labor));
  setText("sum-electricity", preciseMoney(state.recipe.electricityCost)); setText("sum-depreciation", preciseMoney(state.recipe.depreciationCost)); setText("sum-loss", preciseMoney(c.loss)); setText("total-cost", money(c.cost));
  setText("metric-cost", money(c.cost)); setText("metric-price", money(c.recommendedPrice)); setText("metric-price-note", state.recipe.pricingMode === "margin" ? "по желаемой марже" : "по наценке");
  setText("metric-profit", money(c.profit)); setText("metric-margin", percent(c.margin)); setText("recommended-price", money(c.recommendedPrice));
  setText("bridge-price", money(c.sellingPrice)); setText("bridge-cost", money(c.cost)); setText("bridge-fees", money(c.fees)); setText("bridge-logistics", money(c.logisticsAndAds)); setText("bridge-tax", money(c.tax + c.saleOther)); setText("bridge-profit", money(c.profit));
  renderScenarios(); renderWhatIf();
  if (!state.whatIfDirty) syncWhatIf();
  persistDraft();
}

function renderScenarios() {
  const body = $("#scenarios-table");
  body.innerHTML = SCENARIO_PRICES.map((price) => { const c = calculate(state.recipe, price); return `<tr><td>${money(price)}</td><td class="${c.profit < 0 ? "negative" : ""}">${money(c.profit)}</td><td>${percent(c.margin)}</td></tr>`; }).join("");
}
function syncWhatIf() {
  const c = currentCalc();
  const values = { waxPrice: state.recipe.waxPrice, jarCost: state.recipe.jarCost, fragrancePrice: state.recipe.fragrancePrice, fragranceLoad: state.recipe.fragranceLoad, marketplaceFee: state.recipe.marketplaceFee, sellingPrice: c.recommendedPrice };
  $$('[data-whatif]').forEach((input) => { input.value = values[input.dataset.whatif]; });
}
function readWhatIfRecipe() {
  const copy = { ...state.recipe };
  let sellingPrice = currentCalc().recommendedPrice;
  $$('[data-whatif]').forEach((input) => {
    if (input.dataset.whatif === "sellingPrice") sellingPrice = number(input.value);
    else copy[input.dataset.whatif] = number(input.value);
  });
  return { recipe: copy, sellingPrice };
}
function renderWhatIf() {
  const { recipe, sellingPrice } = readWhatIfRecipe(); const c = calculate(recipe, sellingPrice);
  setText("whatif-cost", money(c.cost)); setText("whatif-profit", money(c.profit)); setText("whatif-margin", percent(c.margin));
}
function togglePricingMode() {
  const marginMode = state.recipe.pricingMode === "margin";
  $("#markup-label").hidden = marginMode; $("#margin-label").hidden = !marginMode;
  setText("pricing-help", marginMode ? "Цена = себестоимость ÷ (1 − маржа / 100)" : "Цена = себестоимость × (1 + наценка / 100)");
}

function showValidation(message) {
  const box = $("#validation-message"); box.textContent = message; box.hidden = false;
  clearTimeout(showValidation.timer); showValidation.timer = setTimeout(() => { box.hidden = true; }, 3500);
}
function validateNumeric(key, raw) {
  const parsed = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(parsed)) return { value: 0, message: "Введите корректное число. Установлено значение 0." };
  if (parsed < 0) return { value: 0, message: "Отрицательные значения недопустимы. Установлено значение 0." };
  const limit = PERCENT_LIMITS[key];
  if (limit !== undefined && parsed > limit) return { value: limit, message: `Для этого поля допустимо значение до ${limit}%.` };
  return { value: parsed };
}
function updateRecipeField(input) {
  const key = input.dataset.key;
  if (key === "name") { state.recipe.name = input.value.trimStart(); return; }
  if (input.tagName === "SELECT") { state.recipe[key] = input.value; return; }
  const result = validateNumeric(key, input.value);
  state.recipe[key] = result.value;
  if (result.message) { input.value = result.value; showValidation(result.message); }
}

function recipesWithCalcs() { return state.recipes.map((recipe) => ({ recipe, calc: calculate(recipe.data) })); }
function renderRecipes() {
  const list = $("#recipes-list"), empty = $("#recipes-empty"), panel = $("#comparison-panel");
  const entries = recipesWithCalcs();
  empty.hidden = entries.length > 0; list.innerHTML = ""; setText("recipes-count", `${entries.length} ${declension(entries.length, "рецепт", "рецепта", "рецептов")}`);
  entries.forEach(({ recipe, calc }) => {
    const checked = state.comparison.includes(recipe.id) ? "checked" : "";
    list.insertAdjacentHTML("beforeend", `<article class="recipe-card"><label><input class="compare-check" data-id="${recipe.id}" type="checkbox" ${checked}> сравнить</label><p class="eyebrow">${escapeHTML(recipe.data.waxType || "РЕЦЕПТ")}</p><h3>${escapeHTML(recipe.data.name || "Без названия")}</h3><div class="recipe-stats"><div><span>Себестоимость</span><strong>${money(calc.cost)}</strong></div><div><span>Цена</span><strong>${money(calc.recommendedPrice)}</strong></div><div><span>Прибыль</span><strong>${money(calc.profit)}</strong></div><div><span>Маржа</span><strong>${percent(calc.margin)}</strong></div></div><div class="recipe-actions"><button class="small-button" data-action="edit" data-id="${recipe.id}" type="button">Редактировать</button><button class="small-button" data-action="duplicate" data-id="${recipe.id}" type="button">Дублировать</button><button class="small-button delete" data-action="delete" data-id="${recipe.id}" type="button">Удалить</button></div></article>`);
  });
  panel.hidden = entries.length === 0; renderComparison();
}
function renderComparison() {
  const selected = recipesWithCalcs().filter(({ recipe }) => state.comparison.includes(recipe.id));
  setText("comparison-hint", selected.length < 2 ? "Выберите минимум две" : `${selected.length} выбрано`);
  const rows = [
    ["Себестоимость", (c) => money(c.cost)], ["Цена", (c) => money(c.recommendedPrice)], ["Прибыль", (c) => money(c.profit)], ["Маржа", (c) => percent(c.margin)], ["Стоимость материалов", (c) => money(c.materials + c.loss)],
  ];
  $("#compare-head").innerHTML = `<tr><th>Показатель</th>${selected.map(({ recipe }) => `<th>${escapeHTML(recipe.data.name || "Без названия")}</th>`).join("")}</tr>`;
  $("#compare-body").innerHTML = selected.length ? rows.map(([label, value]) => `<tr><td>${label}</td>${selected.map(({ calc }) => `<td>${value(calc)}</td>`).join("")}</tr>`).join("") : `<tr><td>Выберите рецепты выше, чтобы увидеть сравнение.</td></tr>`;
}
function declension(n, one, few, many) { const v = Math.abs(n) % 100; const l = v % 10; return v > 10 && v < 20 ? many : l === 1 ? one : l > 1 && l < 5 ? few : many; }
function escapeHTML(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

function persistRecipes() { writeJSON(STORAGE_KEYS.recipes, state.recipes); }
function persistDraft() { writeJSON(STORAGE_KEYS.draft, { recipe: state.recipe, activeRecipeId: state.activeRecipeId }); }
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("visible"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("visible"), 3000); }
function saveRecipe() {
  state.recipe.name = (state.recipe.name || "").trim() || "Свеча без названия";
  $("#candleName").value = state.recipe.name;
  const data = JSON.parse(JSON.stringify(state.recipe));
  if (state.activeRecipeId) {
    const index = state.recipes.findIndex((recipe) => recipe.id === state.activeRecipeId);
    if (index > -1) state.recipes[index] = { ...state.recipes[index], data, updatedAt: Date.now() };
    else state.activeRecipeId = null;
  }
  if (!state.activeRecipeId) { state.activeRecipeId = crypto.randomUUID(); state.recipes.unshift({ id: state.activeRecipeId, data, createdAt: Date.now(), updatedAt: Date.now() }); }
  persistRecipes(); renderRecipes(); updateEditingIndicator(); toast("Расчёт сохранён на этом устройстве");
  persistDraft();
}
function updateEditingIndicator() { const indicator = $("#editing-indicator"); indicator.hidden = !state.activeRecipeId; indicator.textContent = state.activeRecipeId ? "Редактируется сохранённый рецепт" : ""; }
function newCalculation() {
  state.recipe = createRecipe(); state.activeRecipeId = null; state.whatIfDirty = false; state.comparison = state.comparison.filter((id) => state.recipes.some((recipe) => recipe.id === id));
  populateForm(); render(); updateEditingIndicator(); window.scrollTo({ top: 0, behavior: "smooth" }); toast("Создан новый расчёт с настройками по умолчанию");
}
function editRecipe(id) {
  const recipe = state.recipes.find((item) => item.id === id); if (!recipe) return;
  state.recipe = JSON.parse(JSON.stringify(recipe.data)); state.activeRecipeId = id; state.whatIfDirty = false;
  populateForm(); render(); updateEditingIndicator(); window.scrollTo({ top: 0, behavior: "smooth" }); toast("Рецепт загружен для редактирования");
}
function duplicateRecipe(id) {
  const source = state.recipes.find((item) => item.id === id); if (!source) return;
  const data = JSON.parse(JSON.stringify(source.data)); data.name = `${data.name || "Свеча"} — копия`;
  state.recipes.unshift({ id: crypto.randomUUID(), data, createdAt: Date.now(), updatedAt: Date.now() }); persistRecipes(); renderRecipes(); toast("Рецепт продублирован");
}
function deleteRecipe(id) {
  const recipe = state.recipes.find((item) => item.id === id); if (!recipe) return;
  if (!window.confirm(`Удалить рецепт «${recipe.data.name || "Без названия"}»?`)) return;
  state.recipes = state.recipes.filter((item) => item.id !== id); state.comparison = state.comparison.filter((item) => item !== id); if (state.activeRecipeId === id) state.activeRecipeId = null;
  persistRecipes(); persistDraft(); renderRecipes(); updateEditingIndicator(); toast("Рецепт удалён");
}

function bindEvents() {
  $$('[data-key]').forEach((input) => input.addEventListener("input", () => { updateRecipeField(input); render(); }));
  $('#candleName').addEventListener("input", (event) => { state.recipe.name = event.target.value; persistDraft(); });
  $$('input[name="pricingMode"]').forEach((input) => input.addEventListener("change", () => { state.recipe.pricingMode = input.value; togglePricingMode(); render(); }));
  $$('[data-whatif]').forEach((input) => input.addEventListener("input", () => { const check = validateNumeric(input.dataset.whatif, input.value); if (check.message) { input.value = check.value; showValidation(check.message); } state.whatIfDirty = true; renderWhatIf(); }));
  $('#reset-whatif').addEventListener("click", () => { state.whatIfDirty = false; syncWhatIf(); renderWhatIf(); });
  $('#save-recipe').addEventListener("click", saveRecipe); $('#new-calculation').addEventListener("click", newCalculation);
  $('#save-settings').addEventListener("click", () => {
    const next = {}; $$('[data-setting]').forEach((input) => { const result = validateNumeric(input.dataset.setting, input.value); next[input.dataset.setting] = result.value; input.value = result.value; });
    state.settings = { ...DEFAULT_SETTINGS, ...next }; writeJSON(STORAGE_KEYS.settings, state.settings); setText("settings-status", "Настройки сохранены"); toast("Значения по умолчанию сохранены");
  });
  $('#recipes-list').addEventListener("click", (event) => { const button = event.target.closest("button[data-action]"); if (!button) return; const { action, id } = button.dataset; if (action === "edit") editRecipe(id); if (action === "duplicate") duplicateRecipe(id); if (action === "delete") deleteRecipe(id); });
  $('#recipes-list').addEventListener("change", (event) => { const input = event.target.closest(".compare-check"); if (!input) return; state.comparison = input.checked ? [...new Set([...state.comparison, input.dataset.id])] : state.comparison.filter((id) => id !== input.dataset.id); renderComparison(); });
}

function init() { populateForm(); bindEvents(); render(); renderRecipes(); updateEditingIndicator(); }
init();

/* Candle Cost Calculator — local-first MVP. The model is kept separate from the DOM
   so a future API/storage layer can replace only the persistence functions. */
const STORAGE_KEYS = {
  recipes: "candle-cost-recipes-v1",
  settings: "candle-cost-settings-v1",
  draft: "candle-cost-draft-v1",
  templates: "candle-cost-templates-v1",
  inventory: "candle-cost-inventory-v1",
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
  weightMode: "wax",
  totalFillWeight: 194.4,
  fragrancePrice: 0,
  fragranceLoad: 8,
  capacityMode: "water",
  capacityWaterWeight: 220,
  capacityDiameter: 70,
  capacityHeight: 70,
  waxDensity: 0.86,
  blendEnabled: false,
  blend1Type: "Соевый",
  blend1Percent: 70,
  blend1Price: 0,
  blend2Type: "Кокосовый",
  blend2Percent: 30,
  blend2Price: 0,
  blend3Type: "Пчелиный",
  blend3Percent: 0,
  blend3Price: 0,
  wickPrice: 0,
  wickQty: 1,
  containerDiameter: 70,
  wickSeries: "eco",
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
  blend1Percent: 100, blend2Percent: 100, blend3Percent: 100,
};
const SCENARIO_PRICES = [699, 799, 899, 999, 1199, 1499];
const BUILT_IN_TEMPLATES = [
  { id: "soy-glass-180", name: "Соевый стакан 180 г", description: "Классическая ароматическая свеча в банке.", data: { waxType: "Соевый", weightMode: "wax", blendEnabled: false, waxWeight: 180, fragranceLoad: 8, wickQty: 1, productionMinutes: 35 } },
  { id: "coconut-jar-250", name: "Кокосовая свеча 250 г", description: "Большой формат в банке с мягким горением.", data: { waxType: "Кокосовый", weightMode: "wax", blendEnabled: false, waxWeight: 250, fragranceLoad: 8, wickQty: 1, productionMinutes: 45 } },
  { id: "beeswax-mold-100", name: "Пчелиная формовая 100 г", description: "Небольшая формовая свеча без ароматизатора.", data: { waxType: "Пчелиный", weightMode: "wax", blendEnabled: false, waxWeight: 100, fragranceLoad: 0, wickQty: 1, jarCost: 0, lidCost: 0, boxCost: 0, productionMinutes: 25 } },
];
const INVENTORY_ITEMS = [
  { key: "wax", label: "Воск", unit: "г", usage: (recipe) => getRecipeWeights(recipe).waxWeight * getReserveMultiplier(recipe) },
  { key: "fragrance", label: "Ароматизатор", unit: "г", usage: (recipe) => getRecipeWeights(recipe).fragranceWeight * getReserveMultiplier(recipe) },
  { key: "wick", label: "Фитили", unit: "шт.", usage: (recipe) => number(recipe.wickQty) },
  { key: "jar", label: "Банки", unit: "шт.", usage: () => 1 },
  { key: "lid", label: "Крышки", unit: "шт.", usage: () => 1 },
  { key: "box", label: "Коробки", unit: "шт.", usage: () => 1 },
];

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
  templates: [...BUILT_IN_TEMPLATES, ...readJSON(STORAGE_KEYS.templates, [])],
  inventory: { wax: "", fragrance: "", wick: "", jar: "", lid: "", box: "", ...readJSON(STORAGE_KEYS.inventory, {}) },
  planner: { source: "draft", quantity: 10 },
};

function getRecipeWeights(recipe) {
  const r = { ...BASE_RECIPE, ...recipe };
  const load = number(r.fragranceLoad) / 100;
  const waxWeight = r.weightMode === "total"
    ? number(r.totalFillWeight) / (1 + load)
    : number(r.waxWeight);
  const fragranceWeight = waxWeight * load;
  return { waxWeight, fragranceWeight, totalFillWeight: waxWeight + fragranceWeight };
}
function getReserveMultiplier(recipe) { return 1 + number(({ ...BASE_RECIPE, ...recipe }).lossPercent) / 100; }
function getBlendData(recipe) {
  const r = { ...BASE_RECIPE, ...recipe };
  const waxWeight = getRecipeWeights(r).waxWeight;
  const components = [1, 2, 3].map((index) => ({
    type: String(r[`blend${index}Type`] || `Компонент ${index}`).trim() || `Компонент ${index}`,
    share: number(r[`blend${index}Percent`]),
    price: number(r[`blend${index}Price`]),
  }));
  const total = components.reduce((sum, component) => sum + component.share, 0);
  const valid = Math.abs(total - 100) < 0.01;
  const averagePrice = valid ? components.reduce((sum, component) => sum + component.price * component.share / 100, 0) : 0;
  return { enabled: Boolean(r.blendEnabled), components, total, valid, averagePrice, waxWeight };
}
function getEffectiveWaxPrice(recipe) {
  const blend = getBlendData(recipe);
  return blend.enabled && blend.valid ? blend.averagePrice : number(recipe.waxPrice);
}
function getCapacityCalculation(recipe) {
  const r = { ...BASE_RECIPE, ...recipe };
  const volume = r.capacityMode === "geometry"
    ? Math.PI * Math.pow(number(r.capacityDiameter) / 20, 2) * (number(r.capacityHeight) / 10)
    : number(r.capacityWaterWeight);
  return { volume, fillWeight: volume * number(r.waxDensity) };
}

function calculate(recipe, forcedPrice) {
  const r = { ...BASE_RECIPE, ...recipe };
  const weights = getRecipeWeights(r);
  const waxUnitPrice = getEffectiveWaxPrice(r);
  const wax = waxUnitPrice / 1000 * weights.waxWeight;
  const fragranceWeight = weights.fragranceWeight;
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
  return { wax, waxWeight: weights.waxWeight, totalFillWeight: weights.totalFillWeight, waxUnitPrice, fragranceWeight, fragrance, wick, jar, lid, hardware, container, dyeAndDecor, label, miscMaterials, decor, otherMaterials, packaging, materials, loss, labor, cost, recommendedPrice, sellingPrice, marketplaceFee, acquiringFee, tax, logisticsAndAds, saleOther, fees, profit, margin };
}

function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function currentCalc() { return calculate(state.recipe); }
function renderWeightMode(calc) {
  const totalMode = state.recipe.weightMode === "total";
  $("#wax-weight-field").hidden = totalMode;
  $("#total-weight-field").hidden = !totalMode;
  $('[data-key="waxWeight"]').value = state.recipe.waxWeight;
  $('[data-key="totalFillWeight"]').value = state.recipe.totalFillWeight;
  setText("weight-breakdown", `${formatQuantity(calc.waxWeight)} г воска + ${formatQuantity(calc.fragranceWeight)} г отдушки = ${formatQuantity(calc.totalFillWeight)} г`);
}
function renderCapacity() {
  const calculation = getCapacityCalculation(state.recipe);
  $$('[data-capacity-field="water"]').forEach((field) => { field.hidden = state.recipe.capacityMode !== "water"; });
  $$('[data-capacity-field="geometry"]').forEach((field) => { field.hidden = state.recipe.capacityMode !== "geometry"; });
  setText("capacity-volume", `${formatQuantity(calculation.volume)} мл`);
  setText("capacity-fill-weight", `${formatQuantity(calculation.fillWeight)} г`);
}
function renderBlend() {
  const blend = getBlendData(state.recipe);
  $("#blend-enabled").checked = blend.enabled;
  blend.components.forEach((component, index) => setText(`blend${index + 1}-weight`, `${formatQuantity(blend.waxWeight * component.share / 100)} г`));
  setText("blend-total", `${formatQuantity(blend.total)}%`);
  setText("blend-average-price", blend.valid ? `${formatQuantity(blend.averagePrice)} ₽/кг` : "—");
  const status = $("#blend-status");
  status.textContent = blend.valid ? (blend.enabled ? "Смесь участвует в расчёте" : "Состав готов — включите при необходимости") : `Смесь не применена: сейчас ${formatQuantity(blend.total)}%, нужно 100%`;
  status.classList.toggle("valid", blend.valid);
  const priceInput = $("#wax-price-input");
  const activeBlend = blend.enabled && blend.valid;
  priceInput.disabled = activeBlend;
  priceInput.value = activeBlend ? blend.averagePrice : state.recipe.waxPrice;
  setText("wax-price-label", activeBlend ? "Средняя цена смеси, ₽/кг" : "Цена воска, ₽/кг");
  setText("wax-cost-note", activeBlend ? "Средняя цена смеси × фактический вес воска" : "Цена за кг ÷ 1000 × вес");
}

function populateForm() {
  $$('[data-key]').forEach((input) => {
    const key = input.dataset.key;
    if (input.type === "radio") input.checked = state.recipe[key] === input.value;
    else input.value = state.recipe[key] ?? "";
  });
  $$('input[name="pricingMode"]').forEach((input) => input.checked = input.value === state.recipe.pricingMode);
  $('#blend-enabled').checked = Boolean(state.recipe.blendEnabled);
  $('#candleName').value = state.recipe.name || "";
  $$('[data-setting]').forEach((input) => { input.value = state.settings[input.dataset.setting] ?? 0; });
  togglePricingMode();
  syncWhatIf();
}

function render() {
  const c = currentCalc();
  renderWeightMode(c); renderCapacity(); renderBlend();
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
  renderScenarios(); renderWhatIf(); renderWickAdvice();
  if (!state.whatIfDirty) syncWhatIf();
  renderPlanner();
  persistDraft();
}

function renderScenarios() {
  const body = $("#scenarios-table");
  body.innerHTML = SCENARIO_PRICES.map((price) => { const c = calculate(state.recipe, price); return `<tr><td>${money(price)}</td><td class="${c.profit < 0 ? "negative" : ""}">${money(c.profit)}</td><td>${percent(c.margin)}</td></tr>`; }).join("");
}
function wickSizeLabel(series, size) { return series === "eco" ? `ECO ${size}` : `уровень ${size}`; }
function renderWickAdvice() {
  const diameter = number(state.recipe.containerDiameter);
  const fragranceLoad = number(state.recipe.fragranceLoad);
  const blend = getBlendData(state.recipe);
  const activeBlend = blend.enabled && blend.valid;
  const waxType = activeBlend
    ? blend.components.filter((component) => component.share > 0).map((component) => `${component.type} ${formatQuantity(component.share)}%`).join(" + ")
    : state.recipe.waxType || "воск";
  const normalizedWaxType = waxType.toLocaleLowerCase("ru-RU");
  if (diameter < 20) {
    setText("wick-advisor-context", "укажите диаметр от 20 мм");
    setText("wick-advisor-main", "—"); setText("wick-advisor-range", "—"); setText("wick-advisor-layout", "—");
    setText("wick-advisor-note", "Укажите внутренний диаметр ёмкости или свечи, чтобы получить ориентир.");
    return;
  }
  const wickCount = diameter > 120 ? 3 : diameter > 90 ? 2 : 1;
  const zoneDiameter = diameter / wickCount;
  let size = Math.round((zoneDiameter - 30) / 5);
  const factors = [];
  if (activeBlend) {
    const waxModifier = blend.components.reduce((sum, component) => {
      const type = component.type.toLocaleLowerCase("ru-RU");
      const modifier = type.includes("пчели") ? 2 : type.includes("кокос") ? -1 : 0;
      return sum + modifier * component.share / 100;
    }, 0);
    size += Math.round(waxModifier);
    factors.push("состав восковой смеси");
  } else {
    if (normalizedWaxType.includes("пчели")) { size += 2; factors.push("пчелиный воск"); }
    if (normalizedWaxType.includes("кокос")) { size -= 1; factors.push("кокосовый воск"); }
  }
  if (fragranceLoad >= 10) { size += 1; factors.push("высокая отдушка"); }
  if (fragranceLoad > 0 && fragranceLoad <= 4) { size -= 1; factors.push("лёгкая отдушка"); }
  size = Math.max(2, Math.min(14, size));
  const label = wickSizeLabel(state.recipe.wickSeries, size);
  const lower = wickSizeLabel(state.recipe.wickSeries, Math.max(2, size - 2));
  const upper = wickSizeLabel(state.recipe.wickSeries, Math.min(16, size + 2));
  const layout = wickCount === 1 ? "1 фитиль по центру" : wickCount === 2 ? "2 фитиля симметрично" : "3 фитиля равномерно";
  setText("wick-advisor-context", `${formatQuantity(diameter)} мм · ${waxType} · ${formatQuantity(fragranceLoad)}% отдушки`);
  setText("wick-advisor-main", `${wickCount} × ${label}`);
  setText("wick-advisor-range", `${lower} и ${upper}`);
  setText("wick-advisor-layout", layout);
  const factorNote = factors.length ? ` Учтено: ${factors.join(", ")}.` : "";
  const widthNote = wickCount > 1 ? ` Диаметр ${formatQuantity(diameter)} мм лучше тестировать в схеме из ${wickCount} фитилей.` : "";
  setText("wick-advisor-note", `Начните с ${label} и сравните его с двумя соседними вариантами.${factorNote}${widthNote}`);
}
function syncWhatIf() {
  const c = currentCalc();
  const values = { waxPrice: c.waxUnitPrice, jarCost: state.recipe.jarCost, fragrancePrice: state.recipe.fragrancePrice, fragranceLoad: state.recipe.fragranceLoad, marketplaceFee: state.recipe.marketplaceFee, sellingPrice: c.recommendedPrice };
  $$('[data-whatif]').forEach((input) => { input.value = values[input.dataset.whatif]; });
}
function readWhatIfRecipe() {
  const copy = { ...state.recipe };
  let sellingPrice = currentCalc().recommendedPrice;
  $$('[data-whatif]').forEach((input) => {
    if (input.dataset.whatif === "sellingPrice") sellingPrice = number(input.value);
    else {
      copy[input.dataset.whatif] = number(input.value);
      if (input.dataset.whatif === "waxPrice") copy.blendEnabled = false;
    }
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
  if (key === "weightMode") {
    const weights = getRecipeWeights(state.recipe);
    state.recipe.weightMode = input.value;
    state.recipe.waxWeight = weights.waxWeight;
    state.recipe.totalFillWeight = weights.totalFillWeight;
    return;
  }
  if (input.tagName === "SELECT") { state.recipe[key] = input.value; return; }
  if (input.type === "text") { state.recipe[key] = input.value.trimStart(); return; }
  const result = validateNumeric(key, input.value);
  state.recipe[key] = result.value;
  if (result.message) { input.value = result.value; showValidation(result.message); }
}

function formatQuantity(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value || 0);
}
function getPlannerRecipe() {
  if (state.planner.source === "draft") return state.recipe;
  return state.recipes.find((recipe) => recipe.id === state.planner.source)?.data || state.recipe;
}
function persistTemplates() {
  writeJSON(STORAGE_KEYS.templates, state.templates.filter((template) => template.custom));
}
function persistInventory() { writeJSON(STORAGE_KEYS.inventory, state.inventory); }
function renderTemplates() {
  const list = $("#templates-list");
  if (!list) return;
  list.innerHTML = state.templates.map((template) => {
    const kind = template.custom ? "МОЙ ШАБЛОН" : "ГОТОВАЯ ОСНОВА";
    const remove = template.custom ? `<button class="text-button" data-template-action="delete" data-id="${template.id}" type="button">Удалить</button>` : "";
    return `<article class="template-card"><p class="eyebrow">${kind}</p><h3>${escapeHTML(template.name)}</h3><p>${escapeHTML(template.description)}</p><div class="template-actions"><button class="small-button" data-template-action="apply" data-id="${template.id}" type="button">Выбрать шаблон</button>${remove}</div></article>`;
  }).join("");
}
function saveTemplate() {
  const name = window.prompt("Название нового шаблона", state.recipe.name || "Мой шаблон");
  if (name === null) return;
  const normalizedName = name.trim();
  if (!normalizedName) { showValidation("Укажите название шаблона."); return; }
  state.templates.push({
    id: crypto.randomUUID(),
    name: normalizedName,
    description: "Сохранённый вами шаблон рецептуры.",
    data: JSON.parse(JSON.stringify(state.recipe)),
    custom: true,
  });
  persistTemplates(); renderTemplates(); toast("Шаблон сохранён на этом устройстве");
}
function applyTemplate(id) {
  const template = state.templates.find((item) => item.id === id);
  if (!template) return;
  state.recipe = template.custom
    ? { ...createRecipe(), ...JSON.parse(JSON.stringify(template.data)) }
    : { ...state.recipe, ...template.data, name: template.name };
  state.activeRecipeId = null;
  state.whatIfDirty = false;
  populateForm(); render(); updateEditingIndicator();
  window.scrollTo({ top: 0, behavior: "smooth" });
  toast(`Шаблон «${template.name}» применён`);
}
function deleteTemplate(id) {
  const template = state.templates.find((item) => item.id === id && item.custom);
  if (!template) return;
  if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
  state.templates = state.templates.filter((item) => item.id !== id);
  persistTemplates(); renderTemplates(); toast("Шаблон удалён");
}
function renderPlanner() {
  const select = $("#planner-recipe");
  if (!select) return;
  const currentSource = state.planner.source;
  const recipeOptions = state.recipes.map((recipe) => `<option value="${recipe.id}">${escapeHTML(recipe.data.name || "Свеча без названия")}</option>`).join("");
  select.innerHTML = `<option value="draft">Текущий расчёт — ${escapeHTML(state.recipe.name || "без названия")}</option>${recipeOptions}`;
  if (["draft", ...state.recipes.map((recipe) => recipe.id)].includes(currentSource)) select.value = currentSource;
  else state.planner.source = select.value;

  const quantity = Math.max(1, Math.floor(number(state.planner.quantity) || 1));
  state.planner.quantity = quantity;
  $("#planner-quantity").value = quantity;
  $$('[data-stock]').forEach((input) => { input.value = state.inventory[input.dataset.stock] ?? ""; });

  const recipe = { ...BASE_RECIPE, ...getPlannerRecipe() };
  const calc = calculate(recipe);
  const reserveMultiplier = getReserveMultiplier(recipe);
  const waxToPrepare = calc.waxWeight * quantity * reserveMultiplier;
  const fragranceToPrepare = calc.fragranceWeight * quantity * reserveMultiplier;
  const blend = getBlendData(recipe);
  const batchBlend = blend.enabled && blend.valid
    ? blend.components.filter((component) => component.share > 0).map((component) => `${component.type}: ${formatQuantity(waxToPrepare * component.share / 100)} г`).join(" · ")
    : `${recipe.waxType || "Воск"}: ${formatQuantity(waxToPrepare)} г`;
  setText("batch-fill", `${formatQuantity(calc.totalFillWeight * quantity)} г`);
  setText("batch-wax", `${formatQuantity(waxToPrepare)} г`);
  setText("batch-fragrance", `${formatQuantity(fragranceToPrepare)} г`);
  setText("batch-wicks", `${formatQuantity(number(recipe.wickQty) * quantity)} шт.`);
  setText("batch-jars", `${quantity} шт.`);
  setText("batch-blend", batchBlend);
  setText("batch-reserve-note", `Воск и отдушка включают технологический запас ${formatQuantity((reserveMultiplier - 1) * 100)}%. Готовый вес партии показан без запаса.`);
  setText("planner-cost", money(calc.cost * quantity));
  setText("planner-revenue", money(calc.sellingPrice * quantity));
  setText("planner-profit", money(calc.profit * quantity));

  const items = INVENTORY_ITEMS.map((item) => {
    const stored = state.inventory[item.key];
    const tracked = stored !== "" && stored !== null && stored !== undefined;
    const stock = tracked ? number(stored) : 0;
    const perUnit = item.usage(recipe);
    const required = perUnit * quantity;
    const shortage = Math.max(0, required - stock);
    const maximum = tracked && perUnit > 0 ? Math.floor(stock / perUnit) : null;
    return { ...item, tracked, stock, perUnit, required, shortage, maximum };
  });
  const constraints = items.filter((item) => item.tracked && item.perUnit > 0);
  const maximum = constraints.length ? Math.min(...constraints.map((item) => item.maximum)) : null;
  const limiters = maximum === null ? [] : constraints.filter((item) => item.maximum === maximum);
  setText("planner-maximum", maximum === null ? "—" : `${maximum} ${declension(maximum, "свеча", "свечи", "свечей")}`);
  if (maximum === null) setText("planner-note", "Укажите остатки материалов, чтобы рассчитать доступный выпуск.");
  else if (quantity <= maximum) setText("planner-note", `Остатков достаточно для партии из ${quantity} ${declension(quantity, "свечи", "свечей", "свечей")}.`);
  else setText("planner-note", `План превышает остатки: ограничение — ${limiters.map((item) => item.label.toLowerCase()).join(", ")}.`);

  $("#planner-table").innerHTML = items.map((item) => {
    const stock = item.tracked ? `${formatQuantity(item.stock)} ${item.unit}` : "Не учитывать";
    const perUnit = item.perUnit > 0 ? `${formatQuantity(item.perUnit)} ${item.unit}` : "Не используется";
    const required = item.perUnit > 0 ? `${formatQuantity(item.required)} ${item.unit}` : "—";
    let status = "Не контролируется", statusClass = "status-muted";
    if (item.tracked && item.perUnit === 0) status = "Не используется";
    else if (item.tracked && item.shortage > 0) { status = `Не хватает ${formatQuantity(item.shortage)} ${item.unit}`; statusClass = "status-short"; }
    else if (item.tracked) { status = "Достаточно"; statusClass = "status-ok"; }
    return `<tr><td>${item.label}</td><td>${stock}</td><td>${perUnit}</td><td>${required}</td><td class="${statusClass}">${status}</td></tr>`;
  }).join("");
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
  panel.hidden = entries.length === 0; renderComparison(); renderPlanner();
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
  state.recipe = { ...createRecipe(), ...JSON.parse(JSON.stringify(recipe.data)) }; state.activeRecipeId = id; state.whatIfDirty = false;
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
function activateToolTab(name) {
  $$('[data-tool-tab]').forEach((button) => {
    const active = button.dataset.toolTab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$('[data-tool-panel]').forEach((panel) => { panel.hidden = panel.dataset.toolPanel !== name; });
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
  $('#templates-list').addEventListener("click", (event) => {
    const button = event.target.closest("button[data-template-action]"); if (!button) return;
    if (button.dataset.templateAction === "apply") applyTemplate(button.dataset.id);
    if (button.dataset.templateAction === "delete") deleteTemplate(button.dataset.id);
  });
  $('#save-template').addEventListener("click", saveTemplate);
  $$('[data-tool-tab]').forEach((button) => button.addEventListener("click", () => activateToolTab(button.dataset.toolTab)));
  $('#blend-enabled').addEventListener("change", (event) => { state.recipe.blendEnabled = event.target.checked; render(); });
  $('#apply-capacity').addEventListener("click", () => {
    const capacity = getCapacityCalculation(state.recipe);
    if (capacity.fillWeight <= 0) { showValidation("Сначала укажите параметры ёмкости."); return; }
    state.recipe.weightMode = "total";
    state.recipe.totalFillWeight = capacity.fillWeight;
    if (state.recipe.capacityMode === "geometry" && number(state.recipe.capacityDiameter) > 0) state.recipe.containerDiameter = number(state.recipe.capacityDiameter);
    populateForm(); render(); toast("Итоговый вес перенесён в рецепт");
  });
  $('#planner-recipe').addEventListener("change", (event) => { state.planner.source = event.target.value; renderPlanner(); });
  $('#planner-quantity').addEventListener("input", (event) => {
    const result = validateNumeric("plannerQuantity", event.target.value);
    state.planner.quantity = Math.max(1, Math.floor(result.value || 1));
    if (result.message) showValidation(result.message);
    renderPlanner();
  });
  $$('[data-stock]').forEach((input) => input.addEventListener("input", () => {
    const key = input.dataset.stock;
    if (input.value === "") state.inventory[key] = "";
    else {
      const result = validateNumeric(key, input.value);
      state.inventory[key] = result.value;
      if (result.message) { input.value = result.value; showValidation(result.message); }
    }
    persistInventory(); renderPlanner();
  }));
  $('#save-inventory').addEventListener("click", () => { persistInventory(); toast("Остатки сохранены на этом устройстве"); });
}

function init() { populateForm(); bindEvents(); renderTemplates(); render(); renderRecipes(); updateEditingIndicator(); }
init();

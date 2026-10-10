// src/pages/Inventory/components/ProductModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Package, Pill, ShoppingBag, Plus, Trash2, Edit2, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './ProductModal.module.css';

// ============================================================
// MODES
// ============================================================
const MODE = {
  MEDICINE: 'medicine',
  RETAIL: 'retail',
};

// ============================================================
// UNIT SUGGESTIONS PER MODE
// ============================================================
const RETAIL_UNIT_SUGGESTIONS = [
  { label: 'Carton', abbr: 'ctn' },
  { label: 'Box',    abbr: 'box' },
  { label: 'Tray',   abbr: 'tray' },
  { label: 'Crate',  abbr: 'crt' },
  { label: 'Dozen',  abbr: 'dz' },
  { label: 'Pack',   abbr: 'pk' },
  { label: 'Bundle', abbr: 'bdl' },
  { label: 'Bag',    abbr: 'bag' },
];

const MEDICINE_UNIT_SUGGESTIONS = [
  { label: 'Strip',   abbr: 'strp' },
  { label: 'Blister', abbr: 'bls' },
  { label: 'Sachet',  abbr: 'sch' },
  { label: 'Bottle',  abbr: 'btl' },
  { label: 'Tube',    abbr: 'tube' },
  { label: 'Vial',    abbr: 'vial' },
  { label: 'Ampoule', abbr: 'amp' },
  { label: 'Pack',    abbr: 'pk' },
  { label: 'Box',     abbr: 'box' },
  { label: 'Carton',  abbr: 'ctn' },
];

// ============================================================
// CATEGORY SUGGESTIONS PER MODE
// ============================================================
const RETAIL_CATEGORY_SUGGESTIONS = [
  'Groceries', 'Beverages', 'Snacks', 'Household', 'Bakery',
  'Textiles', 'Electronics', 'Stationery', 'Other',
];

const MEDICINE_CATEGORY_SUGGESTIONS = [
  'Analgesics', 'Antibiotics', 'Antimalarials', 'Antihistamines',
  'Vitamins & Supplements', 'First Aid', 'Dermatology', 'Cardiovascular',
  'Respiratory', 'Gastrointestinal', 'Ophthalmic', 'Other',
];

// ============================================================
// PLACEHOLDERS PER MODE
// ============================================================
const MODE_COPY = {
  [MODE.MEDICINE]: {
    namePlaceholder: 'e.g. Paracetamol 500mg',
    skuPlaceholder: 'e.g. PARA-500',
    categoryPlaceholder: 'e.g. Analgesics',
    baseUnitPlaceholder: 'e.g. Tablet',
    baseUnitAbbrPlaceholder: 'e.g. tab',
  },
  [MODE.RETAIL]: {
    namePlaceholder: 'e.g. Bar Soap 250g',
    skuPlaceholder: 'e.g. SOP-024',
    categoryPlaceholder: 'e.g. Household',
    baseUnitPlaceholder: 'e.g. Piece',
    baseUnitAbbrPlaceholder: 'e.g. pc',
  },
};

// ============================================================
// BASE UNIT TYPE INFERENCE
// ============================================================
const MEASURED_UNIT_TOKENS = new Set([
  'm', 'meter', 'meters', 'metre', 'metres',
  'cm', 'mm', 'km',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
  'l', 'liter', 'liters', 'litre', 'litres', 'ml', 'milliliter', 'milliliters',
  'oz', 'lb', 'lbs', 'ft', 'foot', 'feet', 'inch', 'inches',
  'yard', 'yards',
]);

const inferBaseUnitType = (name, abbreviation) => {
  const tokens = [name, abbreviation]
    .filter(Boolean)
    .map(v => v.trim().toLowerCase());
  const isMeasured = tokens.some(t => MEASURED_UNIT_TOKENS.has(t));
  return {
    unitType: isMeasured ? 'MEASURED' : 'WHOLE',
    allowFractional: isMeasured,
  };
};

// ============================================================
// EMPTY FORM SHAPES
// ============================================================
const emptyUnitForm = () => ({
  name: '',
  abbreviation: '',
  conversionQty: 1,
  sellingPrice: '',
  cost: '',
});

const emptyPharmacy = () => ({
  genericName: '',
  brandName: '',
  strength: '',
  dosageForm: '',
  route: '',
  prescriptionCategory: '',
  packSize: '',
  storageConditions: '',
});

const emptyForm = () => ({
  name: '',
  sku: '',
  category: '',
  description: '',
  baseUnit: { name: '', abbreviation: '' },
  baseUnitSellingPrice: '',
  baseUnitCost: '',
  units: [],
});

const DEFAULT_MIN_STOCK = 10;

// ============================================================
// COMPONENT
// ============================================================
const ProductModal = ({
  isOpen,
  onClose,
  onSave,
  product,
  isSubmitting,
  currency,
  // Optional: pass true from a pharmacy app to default to Medicine mode
  defaultMode = MODE.MEDICINE,
  // Optional: pass false to hide the mode selector entirely (retail-only app)
  allowModeSwitch = true,
}) => {
  const [mode, setMode] = useState(defaultMode);

  const [showDescription, setShowDescription] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnitIndex, setEditingUnitIndex] = useState(null);

  const [formData, setFormData] = useState(emptyForm());
  const [unitForm, setUnitForm] = useState(emptyUnitForm());
  const [pharmacy, setPharmacy] = useState(emptyPharmacy());

  const isEdit = !!product;
  const isMedicine = mode === MODE.MEDICINE;

  const unitLabelPlural =
    formData.baseUnit.name && !formData.baseUnit.name.endsWith('s')
      ? `${formData.baseUnit.name}s`
      : formData.baseUnit.name || 'units';

  const unitSuggestions = isMedicine
    ? MEDICINE_UNIT_SUGGESTIONS
    : RETAIL_UNIT_SUGGESTIONS;

  const categorySuggestions = isMedicine
    ? MEDICINE_CATEGORY_SUGGESTIONS
    : RETAIL_CATEGORY_SUGGESTIONS;

  const copy = MODE_COPY[mode];

  // ---------- hydrate on open ----------
  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      const baseUnit = product.baseUnit || {};
      const units = product.units || [];
      const pp = product.pharmacyProduct;

      setShowDescription(!!product.description);

      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        category: product.category || '',
        description: product.description || '',
        baseUnit: {
          name: baseUnit.name || '',
          abbreviation: baseUnit.abbreviation || '',
        },
        baseUnitSellingPrice: baseUnit.price ?? '',
        baseUnitCost: baseUnit.cost ?? product.cost ?? '',
        units: units.map(u => ({
          name: u.name || '',
          abbreviation: u.abbreviation || '',
          conversionQty: parseFloat(u.conversionQty) || 1,
          sellingPrice: u.price ?? '',
          cost: u.cost ?? '',
        })),
      });

      // Mode is derived from the existing product
      setMode(pp ? MODE.MEDICINE : MODE.RETAIL);
      setPharmacy(
        pp
          ? {
              genericName: pp.genericName || '',
              brandName: pp.brandName || '',
              strength: pp.strength || '',
              dosageForm: pp.dosageForm || '',
              route: pp.route || '',
              prescriptionCategory: pp.prescriptionCategory || '',
              packSize: pp.packSize || '',
              storageConditions: pp.storageConditions || '',
            }
          : emptyPharmacy()
      );
    } else {
      setShowDescription(false);
      setFormData(emptyForm());
      setMode(defaultMode);       // New product → default mode
      setPharmacy(emptyPharmacy());
    }

    setUnitForm(emptyUnitForm());
    setEditingUnitIndex(null);
    setShowUnitForm(false);
  }, [isOpen, product, defaultMode]);

  // ---------- margin ----------
  const margin = useMemo(() => {
    const price = parseFloat(formData.baseUnitSellingPrice) || 0;
    const cost = parseFloat(formData.baseUnitCost) || 0;
    const diff = price - cost;
    const pct = price > 0 ? (diff / price) * 100 : 0;
    return { diff, pct };
  }, [formData.baseUnitSellingPrice, formData.baseUnitCost]);

  // ---------- handlers ----------
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'baseUnit.name' || name === 'baseUnit.abbreviation') {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        baseUnit: { ...prev.baseUnit, [field]: value },
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleUnitChange = (e) => {
    const { name, value } = e.target;
    setUnitForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePharmacyChange = (field, value) => {
    setPharmacy(prev => ({ ...prev, [field]: value }));
  };

  const handleModeChange = (newMode) => {
    if (isEdit) return;   // mode is fixed on edit
    setMode(newMode);
  };

  const resetUnitForm = () => {
    setUnitForm(emptyUnitForm());
    setEditingUnitIndex(null);
    setShowUnitForm(false);
  };

  const addOrUpdateUnit = () => {
    if (!unitForm.name || !unitForm.abbreviation || !unitForm.sellingPrice) {
      toast.error('Please fill in unit name, abbreviation, and selling price');
      return;
    }
    if (editingUnitIndex !== null) {
      const updated = [...formData.units];
      updated[editingUnitIndex] = { ...unitForm };
      setFormData(prev => ({ ...prev, units: updated }));
    } else {
      setFormData(prev => ({ ...prev, units: [...prev.units, { ...unitForm }] }));
    }
    resetUnitForm();
  };

  const editUnit = (index) => {
    setUnitForm(formData.units[index]);
    setEditingUnitIndex(index);
    setShowUnitForm(true);
  };

  const removeUnit = (index) => {
    setFormData(prev => ({
      ...prev,
      units: prev.units.filter((_, i) => i !== index),
    }));
  };

  const applySuggestion = ({ label, abbr }) => {
    setUnitForm(prev => ({
      ...prev,
      name: label,
      abbreviation: abbr || prev.abbreviation,
    }));
  };

  // ---------- submit ----------
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.name.trim()) return toast.error('Product name is required');
    if (!formData.baseUnit.name.trim()) return toast.error('Base unit name is required');
    if (!formData.baseUnit.abbreviation.trim()) return toast.error('Base unit abbreviation is required');
    if (!formData.baseUnitSellingPrice) return toast.error('Base selling price is required');

    const baseCost = parseFloat(formData.baseUnitCost) || 0;
    const { unitType: baseType, allowFractional: baseFractional } = inferBaseUnitType(
      formData.baseUnit.name,
      formData.baseUnit.abbreviation,
    );

    const payload = {
      name: formData.name.trim(),
      sku: formData.sku.trim() || undefined,
      category: formData.category.trim() || undefined,
      description: formData.description.trim() || undefined,
      cost: baseCost,
      minStock: DEFAULT_MIN_STOCK,
      baseUnit: {
        name: formData.baseUnit.name.trim(),
        abbreviation: formData.baseUnit.abbreviation.trim(),
        unitType: baseType,
        price: parseFloat(formData.baseUnitSellingPrice) || 0,
        cost: baseCost,
        allowFractional: baseFractional,
      },
    };

    if (formData.units.length > 0) {
      payload.units = formData.units.map(u => ({
        name: u.name.trim(),
        abbreviation: u.abbreviation.trim(),
        unitType: 'PACKAGED',
        conversionQty: parseFloat(u.conversionQty) || 1,
        price: parseFloat(u.sellingPrice) || 0,
        cost: parseFloat(u.cost) || 0,
        allowFractional: false,
      }));
    }

    // ─── Medicine mode → attach pharmacy metadata ───
    if (isMedicine) {
      const trim = (v) => (v || '').trim();
      const pharmacyPayload = {
        genericName: trim(pharmacy.genericName) || undefined,
        brandName: trim(pharmacy.brandName) || undefined,
        strength: trim(pharmacy.strength) || undefined,
        dosageForm: trim(pharmacy.dosageForm) || undefined,
        route: trim(pharmacy.route) || undefined,
        prescriptionCategory: trim(pharmacy.prescriptionCategory) || undefined,
        packSize: trim(pharmacy.packSize) || undefined,
        storageConditions: trim(pharmacy.storageConditions) || undefined,
      };
      const hasAny = Object.values(pharmacyPayload).some((v) => v !== undefined);
      if (hasAny) {
        payload.pharmacy = pharmacyPayload;
      }
    }

    onSave(payload);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ─── HEADER ─── */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>
              <Package size={18} />
              <span>{isEdit ? 'Edit Product' : 'Add Product'}</span>
            </div>
            <p className={styles.subtitle}>
              {isEdit
                ? 'Update product information. Stock and pricing across branches stay untouched.'
                : 'Create a product once. Manage its stock and pricing across your branches.'}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* ─── MODE SELECTOR ─── */}
        {allowModeSwitch && (
          <div className={styles.modeSelector}>
            <button
              type="button"
              className={`${styles.modeTab} ${isMedicine ? styles.modeTabActive : ''}`}
              onClick={() => handleModeChange(MODE.MEDICINE)}
              disabled={isEdit}
            >
              <Pill size={16} />
              <div className={styles.modeTabText}>
                <strong>Medicine</strong>
                <span>Batches, expiry, FEFO</span>
              </div>
            </button>
            <button
              type="button"
              className={`${styles.modeTab} ${!isMedicine ? styles.modeTabActive : ''}`}
              onClick={() => handleModeChange(MODE.RETAIL)}
              disabled={isEdit}
            >
              <ShoppingBag size={16} />
              <div className={styles.modeTabText}>
                <strong>Retail item</strong>
                <span>Direct stock</span>
              </div>
            </button>
          </div>
        )}

        {/* ─── BODY ─── */}
        <form onSubmit={handleSubmit} className={styles.body}>
          {/* ============ 1. PRODUCT INFORMATION ============ */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardStep}>1</span>
              <h4>Product information</h4>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroupFull}>
                <label>Product name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder={copy.namePlaceholder}
                  autoFocus
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>SKU</label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder={copy.skuPlaceholder}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Category</label>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder={copy.categoryPlaceholder}
                  list="product-category-suggestions"
                />
                <datalist id="product-category-suggestions">
                  {categorySuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {!showDescription && (
                <div className={styles.formGroupFull}>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setShowDescription(true)}
                  >
                    + Add description
                  </button>
                </div>
              )}

              {showDescription && (
                <div className={styles.formGroupFull}>
                  <label>Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Optional"
                    rows={2}
                  />
                </div>
              )}

              <div className={styles.formGroup}>
                <label>Base unit *</label>
                <input
                  type="text"
                  name="baseUnit.name"
                  value={formData.baseUnit.name}
                  onChange={handleChange}
                  placeholder={copy.baseUnitPlaceholder}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Abbreviation *</label>
                <input
                  type="text"
                  name="baseUnit.abbreviation"
                  value={formData.baseUnit.abbreviation}
                  onChange={handleChange}
                  placeholder={copy.baseUnitAbbrPlaceholder}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Base selling price * ({currency})</label>
                <input
                  type="number"
                  name="baseUnitSellingPrice"
                  value={formData.baseUnitSellingPrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  required
                />
                {formData.baseUnit.name && (
                  <span className={styles.fieldHint}>
                    per {formData.baseUnit.name}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Cost price ({currency})</label>
                <input
                  type="number"
                  name="baseUnitCost"
                  value={formData.baseUnitCost}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              {(formData.baseUnitSellingPrice || formData.baseUnitCost) && (
                <div className={styles.formGroupFull}>
                  <div className={styles.marginBadge}>
                    Expected margin: {currency} {margin.diff.toFixed(2)} · {margin.pct.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ============ 2. MEDICINE DETAILS (only in Medicine mode) ============ */}
          {isMedicine && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardStep}>2</span>
                <h4>Medicine details</h4>
                <span className={styles.cardHeaderHint}>Pharmacy</span>
              </div>

              <p className={styles.cardHint}>
                Clinical and regulatory information. Batches and expiry are added later
                when stock is received at a branch.
              </p>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Generic name</label>
                  <input
                    type="text"
                    value={pharmacy.genericName}
                    onChange={(e) => handlePharmacyChange('genericName', e.target.value)}
                    placeholder="e.g. Paracetamol"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Brand name</label>
                  <input
                    type="text"
                    value={pharmacy.brandName}
                    onChange={(e) => handlePharmacyChange('brandName', e.target.value)}
                    placeholder="e.g. Panadol"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Strength</label>
                  <input
                    type="text"
                    value={pharmacy.strength}
                    onChange={(e) => handlePharmacyChange('strength', e.target.value)}
                    placeholder="e.g. 500mg"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Dosage form</label>
                  <input
                    type="text"
                    value={pharmacy.dosageForm}
                    onChange={(e) => handlePharmacyChange('dosageForm', e.target.value)}
                    placeholder="e.g. TABLET"
                    list="dosage-form-suggestions"
                  />
                  <datalist id="dosage-form-suggestions">
                    <option value="TABLET" />
                    <option value="CAPSULE" />
                    <option value="SYRUP" />
                    <option value="SUSPENSION" />
                    <option value="INJECTION" />
                    <option value="CREAM" />
                    <option value="OINTMENT" />
                    <option value="DROPS" />
                    <option value="INHALER" />
                    <option value="SUPPOSITORY" />
                  </datalist>
                </div>

                <div className={styles.formGroup}>
                  <label>Route</label>
                  <input
                    type="text"
                    value={pharmacy.route}
                    onChange={(e) => handlePharmacyChange('route', e.target.value)}
                    placeholder="e.g. ORAL"
                    list="route-suggestions"
                  />
                  <datalist id="route-suggestions">
                    <option value="ORAL" />
                    <option value="TOPICAL" />
                    <option value="INTRAVENOUS" />
                    <option value="INTRAMUSCULAR" />
                    <option value="SUBCUTANEOUS" />
                    <option value="RECTAL" />
                    <option value="OPHTHALMIC" />
                    <option value="NASAL" />
                    <option value="INHALATION" />
                  </datalist>
                </div>

                <div className={styles.formGroup}>
                  <label>Prescription category</label>
                  <input
                    type="text"
                    value={pharmacy.prescriptionCategory}
                    onChange={(e) => handlePharmacyChange('prescriptionCategory', e.target.value)}
                    placeholder="e.g. OTC"
                    list="rx-category-suggestions"
                  />
                  <datalist id="rx-category-suggestions">
                    <option value="OTC" />
                    <option value="POM" />
                    <option value="CONTROLLED" />
                  </datalist>
                </div>

                <div className={styles.formGroup}>
                  <label>Pack size</label>
                  <input
                    type="text"
                    value={pharmacy.packSize}
                    onChange={(e) => handlePharmacyChange('packSize', e.target.value)}
                    placeholder="e.g. 10 tablets per strip"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Storage conditions</label>
                  <input
                    type="text"
                    value={pharmacy.storageConditions}
                    onChange={(e) => handlePharmacyChange('storageConditions', e.target.value)}
                    placeholder="e.g. Store below 25°C"
                  />
                </div>
              </div>
            </section>
          )}

          {/* ============ 3. SELLING UNITS ============ */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardStep}>{isMedicine ? '3' : '2'}</span>
              <h4>Selling units</h4>
              <span className={styles.cardHeaderHint}>Optional</span>
            </div>

            <p className={styles.cardHint}>
              Sell this product in different quantities or packages.
            </p>

            <div className={styles.subSectionHeader}>
              <span>
                {formData.units.length > 0
                  ? `${formData.units.length} selling unit${formData.units.length === 1 ? '' : 's'}`
                  : 'One unit only'}
              </span>
              <button
                type="button"
                className={styles.addUnitBtn}
                onClick={() => {
                  setUnitForm(emptyUnitForm());
                  setEditingUnitIndex(null);
                  setShowUnitForm(true);
                }}
              >
                <Plus size={14} /> Add selling unit
              </button>
            </div>

            {formData.units.length > 0 && (
              <div className={styles.unitsList}>
                {formData.units.map((unit, index) => (
                  <div key={index} className={styles.unitItem}>
                    <div className={styles.unitItemInfo}>
                      <span className={styles.unitItemName}>{unit.name}</span>
                      <span className={styles.unitItemAbbr}>({unit.abbreviation})</span>
                      <span className={styles.unitItemPrice}>
                        {currency} {unit.sellingPrice}
                      </span>
                      <span className={styles.unitItemQty}>
                        1 {unit.name} = {unit.conversionQty} {unitLabelPlural}
                      </span>
                    </div>
                    <div className={styles.unitItemActions}>
                      <button type="button" onClick={() => editUnit(index)}>
                        <Edit2 size={14} />
                      </button>
                      <button type="button" onClick={() => removeUnit(index)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showUnitForm && (
              <div className={styles.unitFormContainer}>
                <div className={styles.unitFormHeader}>
                  <h5>{editingUnitIndex !== null ? 'Edit Selling Unit' : 'Add Selling Unit'}</h5>
                  <button type="button" onClick={resetUnitForm}>
                    <X size={16} />
                  </button>
                </div>

                <div className={styles.suggestions}>
                  <span className={styles.suggestionsLabel}>
                    <Sparkles size={12} /> Common units
                  </span>
                  <div className={styles.chips}>
                    {unitSuggestions.map(s => (
                      <button
                        key={s.label}
                        type="button"
                        className={styles.chip}
                        onClick={() => applySuggestion(s)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Unit name *</label>
                    <input
                      type="text"
                      name="name"
                      value={unitForm.name}
                      onChange={handleUnitChange}
                      placeholder={isMedicine ? 'e.g. Strip' : 'e.g. Carton'}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Abbreviation *</label>
                    <input
                      type="text"
                      name="abbreviation"
                      value={unitForm.abbreviation}
                      onChange={handleUnitChange}
                      placeholder={isMedicine ? 'e.g. strp' : 'e.g. ctn'}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Contains</label>
                    <div className={styles.containsInput}>
                      <input
                        type="number"
                        name="conversionQty"
                        value={unitForm.conversionQty}
                        onChange={handleUnitChange}
                        placeholder="1"
                        step="0.01"
                        min="0.01"
                      />
                      <span className={styles.containsSuffix}>
                        {unitLabelPlural}
                      </span>
                    </div>
                    <span className={styles.fieldHint}>
                      1 {unitForm.name || 'unit'} = {unitForm.conversionQty || '?'} {unitLabelPlural}
                    </span>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Selling price ({currency}) *</label>
                    <input
                      type="number"
                      name="sellingPrice"
                      value={unitForm.sellingPrice}
                      onChange={handleUnitChange}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Cost ({currency})</label>
                    <input
                      type="number"
                      name="cost"
                      value={unitForm.cost}
                      onChange={handleUnitChange}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                <div className={styles.unitFormActions}>
                  <button type="button" className={styles.cancelBtn} onClick={resetUnitForm}>
                    Cancel
                  </button>
                  <button type="button" className={styles.saveUnitBtn} onClick={addOrUpdateUnit}>
                    {editingUnitIndex !== null ? 'Update' : 'Add'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Sticky footer */}
          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : `Save ${isMedicine ? 'medicine' : 'product'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductModal;
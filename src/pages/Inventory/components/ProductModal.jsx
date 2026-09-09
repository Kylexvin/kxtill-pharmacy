// src/pages/Inventory/components/ProductModal.jsx
import React, { useState, useEffect } from 'react';
import { X, Package, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './ProductModal.module.css';

const UNIT_TYPE_OPTIONS = [
  { value: 'WHOLE', label: 'Counted (e.g. piece, bottle)', allowFractional: false },
  { value: 'MEASURED', label: 'Measured (e.g. kg, metre, litre)', allowFractional: true },
  { value: 'PACKAGED', label: 'Bundle / pack', allowFractional: false },
];

const ProductModal = ({ isOpen, onClose, onSave, product, isSubmitting, currency }) => {
  const [mode, setMode] = useState('single');
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    cost: '',  // Product-level cost
    baseUnit: {
      name: '',
      abbreviation: '',
      unitType: 'WHOLE',
      sellingPrice: '',  // Selling price
      cost: '',  // BaseUnit cost (same as product cost)
      allowFractional: false,
    },
    units: [],
  });

  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnitIndex, setEditingUnitIndex] = useState(null);
  const [unitForm, setUnitForm] = useState({
    name: '',
    abbreviation: '',
    unitType: 'PACKAGED',
    conversionQty: 1,
    sellingPrice: '',
    cost: '',
    allowFractional: false,
  });

  useEffect(() => {
    if (product) {
      const baseUnit = product.baseUnit || {};
      const units = product.units || [];
      const hasUnits = units.length > 0;
      
      setMode(hasUnits ? 'multi' : 'single');
      
      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        category: product.category || '',
        cost: product.cost || baseUnit.cost || '',
        baseUnit: {
          name: baseUnit.name || '',
          abbreviation: baseUnit.abbreviation || '',
          unitType: baseUnit.unitType || 'WHOLE',
          sellingPrice: baseUnit.price || '',
          cost: baseUnit.cost || product.cost || '',
          allowFractional: baseUnit.allowFractional || false,
        },
        units: units.map(u => ({
          name: u.name || '',
          abbreviation: u.abbreviation || '',
          unitType: u.unitType || 'PACKAGED',
          conversionQty: parseFloat(u.conversionQty) || 1,
          sellingPrice: u.price || '',
          cost: u.cost || '',
          allowFractional: u.allowFractional || false,
        })),
      });
    } else {
      setMode('single');
      setFormData({
        name: '',
        sku: '',
        category: '',
        cost: '',
        baseUnit: {
          name: '',
          abbreviation: '',
          unitType: 'WHOLE',
          sellingPrice: '',
          cost: '',
          allowFractional: false,
        },
        units: [],
      });
    }
  }, [product]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    
    if (name === 'baseUnit.unitType') {
      setFormData(prev => ({
        ...prev,
        baseUnit: {
          ...prev.baseUnit,
          unitType: val,
          allowFractional: UNIT_TYPE_OPTIONS.find(o => o.value === val)?.allowFractional || false,
        },
      }));
    } else if (name === 'cost') {
      // When product cost changes, also update baseUnit cost
      setFormData(prev => ({
        ...prev,
        cost: val,
        baseUnit: {
          ...prev.baseUnit,
          cost: val,
        },
      }));
    } else if (name.startsWith('baseUnit.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        baseUnit: {
          ...prev.baseUnit,
          [field]: val,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: val,
      }));
    }
  };

  const handleUnitChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    
    setUnitForm(prev => ({
      ...prev,
      [name]: val,
      allowFractional: name === 'unitType' 
        ? UNIT_TYPE_OPTIONS.find(o => o.value === val)?.allowFractional || false
        : name === 'allowFractional'
          ? checked
          : prev.allowFractional,
    }));
  };

  const addUnit = () => {
    if (!unitForm.name || !unitForm.abbreviation || !unitForm.sellingPrice) {
      toast.error('Please fill in unit name, abbreviation, and selling price');
      return;
    }

    if (editingUnitIndex !== null) {
      const updatedUnits = [...formData.units];
      updatedUnits[editingUnitIndex] = { ...unitForm };
      setFormData(prev => ({ ...prev, units: updatedUnits }));
      setEditingUnitIndex(null);
    } else {
      setFormData(prev => ({
        ...prev,
        units: [...prev.units, { ...unitForm }],
      }));
    }

    resetUnitForm();
  };

  const removeUnit = (index) => {
    setFormData(prev => ({
      ...prev,
      units: prev.units.filter((_, i) => i !== index),
    }));
  };

  const editUnit = (index) => {
    setUnitForm(formData.units[index]);
    setEditingUnitIndex(index);
    setShowUnitForm(true);
  };

  const resetUnitForm = () => {
    setUnitForm({
      name: '',
      abbreviation: '',
      unitType: 'PACKAGED',
      conversionQty: 1,
      sellingPrice: '',
      cost: '',
      allowFractional: false,
    });
    setEditingUnitIndex(null);
    setShowUnitForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const payload = {
      name: formData.name,
      sku: formData.sku || undefined,
      category: formData.category || undefined,
      cost: parseFloat(formData.cost) || 0,
      baseUnit: {
        name: formData.baseUnit.name,
        abbreviation: formData.baseUnit.abbreviation,
        unitType: formData.baseUnit.unitType,
        price: parseFloat(formData.baseUnit.sellingPrice) || 0,
        cost: parseFloat(formData.baseUnit.cost) || 0,
        allowFractional: formData.baseUnit.unitType === 'MEASURED' 
          ? formData.baseUnit.allowFractional 
          : false,
      },
    };

    if (formData.units.length > 0) {
      payload.units = formData.units.map(u => ({
        name: u.name,
        abbreviation: u.abbreviation,
        unitType: u.unitType || 'PACKAGED',
        conversionQty: parseFloat(u.conversionQty) || 1,
        price: parseFloat(u.sellingPrice) || 0,
        cost: parseFloat(u.cost) || 0,
        allowFractional: u.unitType === 'MEASURED' ? u.allowFractional : false,
      }));
    }

    onSave(payload);
  };

  if (!isOpen) return null;

  const showFractionalToggle = formData.baseUnit.unitType === 'MEASURED';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <Package size={18} />
            <span>{product ? 'Edit Product' : 'Add Product'}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.body}>
          {/* Product Info */}
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Product Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter product name"
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
                placeholder="Enter SKU"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Category</label>
              <input
                type="text"
                name="category"
                value={formData.category}
                onChange={handleChange}
                placeholder="Enter category"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Cost ({currency})</label>
              <input
                type="number"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Mode Toggle */}
          <div className={styles.sectionDivider}>
            <h4>How is this product sold?</h4>
            <p className={styles.sectionHint}>Choose one option below</p>
          </div>

          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'single' ? styles.active : ''}`}
              onClick={() => setMode('single')}
            >
              <span className={styles.modeIcon}>1</span>
              <span>Single unit</span>
              <span className={styles.modeDesc}>e.g. piece, kilogram, litre</span>
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'multi' ? styles.active : ''}`}
              onClick={() => setMode('multi')}
            >
              <span className={styles.modeIcon}>2</span>
              <span>Multiple pack sizes</span>
              <span className={styles.modeDesc}>e.g. meter + pre-cut bundles</span>
            </button>
          </div>

          {/* Unit Section */}
          <div className={styles.sectionDivider}>
            <h4>{mode === 'single' ? 'Unit Details' : 'Primary Selling Unit'}</h4>
            <p className={styles.sectionHint}>
              {mode === 'single' 
                ? 'This is how the product will be sold' 
                : 'This is the base unit for inventory tracking'}
            </p>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Unit Name *</label>
              <input
                type="text"
                name="baseUnit.name"
                value={formData.baseUnit.name}
                onChange={handleChange}
                placeholder="e.g. Meter, Piece, Kilogram"
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
                placeholder="e.g. m, pc, kg"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Unit Type</label>
              <select
                name="baseUnit.unitType"
                value={formData.baseUnit.unitType}
                onChange={handleChange}
              >
                {UNIT_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Selling Price ({currency})</label>
              <input
                type="number"
                name="baseUnit.sellingPrice"
                value={formData.baseUnit.sellingPrice}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Cost ({currency})</label>
              <input
                type="number"
                name="baseUnit.cost"
                value={formData.baseUnit.cost}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            {showFractionalToggle && (
              <div className={styles.formGroupFull}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    name="baseUnit.allowFractional"
                    checked={formData.baseUnit.allowFractional}
                    onChange={handleChange}
                  />
                  Allow fractional quantities (e.g. 0.5, 1.25)
                </label>
              </div>
            )}
          </div>

          {/* Sellable Units - Multi mode only */}
          {mode === 'multi' && (
            <>
              <div className={styles.sectionDivider}>
                <div className={styles.sectionHeader}>
                  <h4>Also sell as</h4>
                  <button
                    type="button"
                    className={styles.addUnitBtn}
                    onClick={() => {
                      setUnitForm({
                        name: '',
                        abbreviation: '',
                        unitType: 'PACKAGED',
                        conversionQty: 1,
                        sellingPrice: '',
                        cost: '',
                        allowFractional: false,
                      });
                      setEditingUnitIndex(null);
                      setShowUnitForm(true);
                    }}
                  >
                    <Plus size={14} /> Add pack size
                  </button>
                </div>
                <p className={styles.sectionHint}>
                  Alternative ways to sell the same product (e.g. carton, bundle, pack)
                </p>
              </div>

              {formData.units.length > 0 && (
                <div className={styles.unitsList}>
                  {formData.units.map((unit, index) => {
                    const baseName = formData.baseUnit.name || 'unit';
                    return (
                      <div key={index} className={styles.unitItem}>
                        <div className={styles.unitItemInfo}>
                          <span className={styles.unitItemName}>{unit.name}</span>
                          <span className={styles.unitItemAbbr}>({unit.abbreviation})</span>
                          <span className={styles.unitItemPrice}>Sell: {currency} {unit.sellingPrice}</span>
                          <span className={styles.unitItemQty}>
                            = {unit.conversionQty} × {baseName}
                          </span>
                        </div>
                        <div className={styles.unitItemActions}>
                          <button type="button" onClick={() => editUnit(index)}>
                            <Package size={14} />
                          </button>
                          <button type="button" onClick={() => removeUnit(index)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {showUnitForm && (
                <div className={styles.unitFormContainer}>
                  <div className={styles.unitFormHeader}>
                    <h5>{editingUnitIndex !== null ? 'Edit Pack Size' : 'Add Pack Size'}</h5>
                    <button type="button" onClick={resetUnitForm}>
                      <X size={16} />
                    </button>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label>Pack Name *</label>
                      <input
                        type="text"
                        name="name"
                        value={unitForm.name}
                        onChange={handleUnitChange}
                        placeholder="e.g. Carton, Bundle, Pack"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Abbreviation *</label>
                      <input
                        type="text"
                        name="abbreviation"
                        value={unitForm.abbreviation}
                        onChange={handleUnitChange}
                        placeholder="e.g. ctn, bdl, pk"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Unit Type</label>
                      <select
                        name="unitType"
                        value={unitForm.unitType}
                        onChange={handleUnitChange}
                      >
                        <option value="WHOLE">Whole</option>
                        <option value="PACKAGED">Packaged</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Contains (how many base units?)</label>
                      <input
                        type="number"
                        name="conversionQty"
                        value={unitForm.conversionQty}
                        onChange={handleUnitChange}
                        placeholder="1"
                        step="0.01"
                        min="0.01"
                      />
                      <span className={styles.fieldHint}>
                        1 {unitForm.name || 'pack'} = {unitForm.conversionQty || '?'} × {formData.baseUnit.name || 'unit'}
                      </span>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Selling Price ({currency})</label>
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
                    {unitForm.unitType === 'MEASURED' && (
                      <div className={styles.formGroupFull}>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            name="allowFractional"
                            checked={unitForm.allowFractional}
                            onChange={handleUnitChange}
                          />
                          Allow fractional quantities
                        </label>
                      </div>
                    )}
                    <div className={styles.formGroupFull}>
                      <button
                        type="button"
                        className={styles.saveUnitBtn}
                        onClick={addUnit}
                      >
                        {editingUnitIndex !== null ? 'Update Pack Size' : 'Add Pack Size'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (product ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductModal;
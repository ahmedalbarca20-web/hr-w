'use strict';

const { CompanyFeature } = require('../models/index');
const { COMPANY_FEATURES } = require('../constants/company-features');

/** بدون صفوف company_features: نُرجع كل الميزات ما عدا هذه (تفعيل يدوي فقط). */
const OPT_IN_FEATURES_DEFAULT_OFF = new Set(['zk_device_pin']);

const normalizeFeatureList = (features) => {
  if (!Array.isArray(features)) return [];
  const normalized = features
    .map((f) => String(f || '').trim().toLowerCase())
    .filter((f) => COMPANY_FEATURES.includes(f));
  return [...new Set(normalized)];
};

const allFeatures = () => [...COMPANY_FEATURES];

const getCompanyEnabledFeatures = async (companyId, { fallbackToAll = true } = {}) => {
  if (!companyId) {
    return allFeatures().filter((f) => !OPT_IN_FEATURES_DEFAULT_OFF.has(f));
  }

  const rows = await CompanyFeature.findAll({
    where: { company_id: companyId },
    attributes: ['feature_key', 'is_enabled'],
  });

  if (rows.length === 0 && fallbackToAll) {
    return allFeatures().filter((f) => !OPT_IN_FEATURES_DEFAULT_OFF.has(f));
  }

  return rows
    .filter((row) => Number(row.is_enabled) === 1)
    .map((row) => row.feature_key);
};

const setCompanyFeatures = async (companyId, enabledFeatures = []) => {
  const normalized = normalizeFeatureList(enabledFeatures);
  const allRows = COMPANY_FEATURES.map((featureKey) => ({
    company_id: companyId,
    feature_key: featureKey,
    is_enabled: normalized.includes(featureKey) ? 1 : 0,
  }));

  await CompanyFeature.destroy({ where: { company_id: companyId } });
  if (allRows.length > 0) {
    await CompanyFeature.bulkCreate(allRows);
  }

  return normalized;
};

module.exports = {
  allFeatures,
  normalizeFeatureList,
  getCompanyEnabledFeatures,
  setCompanyFeatures,
};

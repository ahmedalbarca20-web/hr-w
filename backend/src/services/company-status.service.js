'use strict';

const { Company, User } = require('../models');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

const inactiveError = () => Object.assign(new Error('Company is inactive'), { statusCode: 403, code: 'COMPANY_INACTIVE' });
const expiredError  = () => Object.assign(new Error('Company contract expired'), { statusCode: 403, code: 'COMPANY_EXPIRED' });

/**
 * Ensure the company is active and not past contract_end.
 * If expired, the company is deactivated and all its users are disabled/logged out.
 * @param {number} companyId
 * @returns {Promise<import('../models/company.model')>} the company row
 */
async function enforceCompanyActive(companyId) {
  const company = await Company.findByPk(companyId, {
    attributes: ['id', 'is_active', 'contract_start', 'contract_end', 'timezone'],
  });

  if (!company || company.is_active !== 1) {
    throw inactiveError();
  }

  if (company.contract_end) {
    const tz = (company.timezone && String(company.timezone).trim()) || DEFAULT_IANA;
    const today = ymdInTimeZone(tz);
    if (company.contract_end < today) {
      // Auto-deactivate company + users when contract ends
      await company.update({ is_active: 0 });
      await User.update(
        { is_active: 0, refresh_token: null },
        { where: { company_id: company.id } }
      );
      throw expiredError();
    }
  }

  return company;
}

module.exports = { enforceCompanyActive };

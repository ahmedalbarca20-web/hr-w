'use strict';

const {
  mapClassicCheckTypeToEventType,
  CHECKINOUT_COLS,
  USERINFO_COLS,
} = require('../src/constants/zkAttClassicTables');

describe('zkAttClassicTables', () => {
  test('mapClassicCheckTypeToEventType', () => {
    expect(mapClassicCheckTypeToEventType('I')).toBe('CHECK_IN');
    expect(mapClassicCheckTypeToEventType('i')).toBe('CHECK_IN');
    expect(mapClassicCheckTypeToEventType('O')).toBe('CHECK_OUT');
    expect(mapClassicCheckTypeToEventType('0')).toBe('CHECK_IN');
    expect(mapClassicCheckTypeToEventType('1')).toBe('CHECK_OUT');
    expect(mapClassicCheckTypeToEventType('')).toBe('OTHER');
  });

  test('column constants exist', () => {
    expect(CHECKINOUT_COLS.checkTime).toBe('CHECKTIME');
    expect(USERINFO_COLS.badgeNumber).toBe('BADGENUMBER');
  });
});

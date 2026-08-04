import * as assert from 'assert';
import { maybeQuoteIdent } from '../../src/sql/identifiers';

describe('maybeQuoteIdent', () => {
  it('leaves simple lowercase/underscore identifiers unquoted', () => {
    assert.strictEqual(maybeQuoteIdent('uc_amp_dev_bronze_ssm'), 'uc_amp_dev_bronze_ssm');
    assert.strictEqual(maybeQuoteIdent('bronze_sslo03_timeseries'), 'bronze_sslo03_timeseries');
  });

  it('quotes names with hyphens or other special characters', () => {
    assert.strictEqual(maybeQuoteIdent('shared-spark-warehouse'), '"shared-spark-warehouse"');
  });

  it('quotes mixed-case names to preserve exact case', () => {
    assert.strictEqual(maybeQuoteIdent('SharedWarehouse'), '"SharedWarehouse"');
  });

  it('quotes "default" — the synthetic database name for loose root tables', () => {
    assert.strictEqual(maybeQuoteIdent('default'), '"default"');
  });

  it('quotes other common SQL reserved words', () => {
    assert.strictEqual(maybeQuoteIdent('order'), '"order"');
    assert.strictEqual(maybeQuoteIdent('table'), '"table"');
  });
});

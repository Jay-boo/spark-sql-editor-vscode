import * as assert from 'assert';
import * as path from 'path';
import { getCompletions } from '../../src/sql/completionLogic';
import { CatalogRef } from '../../src/warehouse/model';

const WAREHOUSE = path.join(process.cwd(), 'test', 'fixtures', 'spark-warehouse');
const CATALOGS: CatalogRef[] = [{ name: 'fixture-warehouse', path: WAREHOUSE }];

function labelsOf(completions: { label: string }[]): string[] {
  return completions.map((c) => c.label);
}

async function complete(text: string): Promise<Awaited<ReturnType<typeof getCompletions>>> {
  return getCompletions(text, text.length, CATALOGS);
}

describe('getCompletions', () => {
  it('suggests table names right after "db."', async () => {
    const completions = await complete('sales.');
    const tables = completions.filter((c) => c.kind === 'table');
    assert.deepStrictEqual(
      labelsOf(tables).sort(),
      ['customers', 'orders'],
    );
  });

  it('suggests column names right after "table." for a table referenced in FROM', async () => {
    const completions = await complete('SELECT * FROM sales.customers WHERE customers.');
    const columns = completions.filter((c) => c.kind === 'column');
    assert.deepStrictEqual(labelsOf(columns).sort(), ['active', 'id', 'name']);
  });

  it('resolves an alias to its table for column completion', async () => {
    const completions = await complete('SELECT * FROM sales.customers c WHERE c.');
    const columns = completions.filter((c) => c.kind === 'column');
    assert.deepStrictEqual(labelsOf(columns).sort(), ['active', 'id', 'name']);
  });

  it('offers keywords, tables, and in-scope columns on a bare invoke', async () => {
    const completions = await complete('SELECT * FROM sales.customers\nWHERE ');
    assert.ok(labelsOf(completions).includes('SELECT'));
    assert.ok(labelsOf(completions).includes('sales.customers'));
    assert.ok(labelsOf(completions).includes('id'));
  });

  it('returns nothing for a dot after an unresolvable name', async () => {
    const completions = await complete('SELECT * FROM sales.customers WHERE nope.');
    assert.deepStrictEqual(completions, []);
  });
});

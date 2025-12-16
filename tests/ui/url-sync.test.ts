import { describe, it, expect } from 'vitest';
import {
  buildQueryFromState,
  parseQueryToState,
} from '../../modules/ui/app/composables/useRecordQueryState';

describe('Record query URL state helpers', () => {
  it('builds query from state omitting defaults', () => {
    const query = buildQueryFromState({
      search: 'budget',
      types: ['bylaw', 'policy'],
      statuses: ['adopted'],
      page: 1,
      pageSize: 50, // default, should be omitted
    });

    expect(query).toEqual({
      search: 'budget',
      types: 'bylaw,policy',
      statuses: 'adopted',
    });
  });

  it('parses route query back to state', () => {
    const state = parseQueryToState({
      query: {
        search: 'noise',
        types: 'bylaw,policy',
        statuses: 'adopted,draft',
        page: '3',
        pageSize: '25',
      },
    } as any);

    expect(state).toEqual({
      search: 'noise',
      types: ['bylaw', 'policy'],
      statuses: ['adopted', 'draft'],
      page: 3,
      pageSize: 25,
    });
  });
});

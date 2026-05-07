import { cli, Strategy } from '@jackwener/opencli/registry';
import { HKPL_DOMAIN, fetchItemHtml, parseItemDetail } from './utils.js';

cli({
    site: 'hkpl',
    name: 'detail',
    access: 'read',
    description: 'Get HKPL bibliographic details for one item',
    domain: HKPL_DOMAIN,
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'id', positional: true, required: true, help: 'HKPL item id, chamo:id, or item URL' },
    ],
    columns: ['itemId', 'title', 'author', 'callNumber', 'publisher', 'publicationYear', 'isbn', 'language', 'subject', 'notes', 'coverImageUrl', 'url'],
    func: async (args) => {
        const { itemId, url, html } = await fetchItemHtml(args.id);
        return [parseItemDetail(itemId, url, html)];
    },
});

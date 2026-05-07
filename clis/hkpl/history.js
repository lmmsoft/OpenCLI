import { cli, Strategy } from '@jackwener/opencli/registry';
import { HKPL_DOMAIN, createAuthenticatedSession, fetchAccountHtml, parseCheckoutHistoryRows, parseCheckoutHistoryStatus } from './utils.js';

cli({
    site: 'hkpl',
    name: 'history',
    access: 'read',
    description: 'List HKPL returned-item checkout history when enabled',
    domain: HKPL_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: false,
    args: [
        { name: 'username', help: 'HKPL account number; can also use HKPL_USERNAME' },
        { name: 'password', help: 'HKPL password; can also use HKPL_PASSWORD' },
    ],
    columns: ['index', 'actionAt', 'title', 'action', 'barcode', 'reference', 'location', 'channel', 'renewCount', 'itemId', 'itemUrl'],
    func: async (args) => {
        const session = await createAuthenticatedSession(args);
        const html = await fetchAccountHtml(session);
        const status = parseCheckoutHistoryStatus(html);
        const rows = parseCheckoutHistoryRows(html);
        if (rows.length > 0) return rows;
        return [{
            index: 0,
            actionAt: '',
            title: status.enabled
                ? 'Checkout history is enabled, but no returned-item rows were found.'
                : 'Checkout history is disabled for this HKPL account.',
            action: status.enabled ? 'enabled_no_rows' : 'disabled',
            barcode: '',
            reference: '',
            location: status.value,
            channel: status.message,
            renewCount: '',
            itemId: '',
            itemUrl: '',
        }];
    },
});

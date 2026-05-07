import { cli, Strategy } from '@jackwener/opencli/registry';
import { HKPL_DOMAIN, createAuthenticatedSession, fetchAccountHtml, parseCheckoutHistoryStatus } from './utils.js';

cli({
    site: 'hkpl',
    name: 'history',
    access: 'read',
    description: 'Check HKPL returned-item checkout history availability',
    domain: HKPL_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: false,
    args: [
        { name: 'username', help: 'HKPL account number; can also use HKPL_USERNAME' },
        { name: 'password', help: 'HKPL password; can also use HKPL_PASSWORD' },
    ],
    columns: ['status', 'historyEnabled', 'settingValue', 'message'],
    func: async (args) => {
        const session = await createAuthenticatedSession(args);
        const html = await fetchAccountHtml(session);
        const status = parseCheckoutHistoryStatus(html);
        return [{
            status: status.enabled ? 'enabled_but_no_table_found' : 'disabled',
            historyEnabled: status.enabled ? 'yes' : 'no',
            settingValue: status.value,
            message: status.message,
        }];
    },
});
